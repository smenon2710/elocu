/**
 * Beta report: who's been invited, who joined, and how much each person is
 * actually using Elocu — Clerk (invitations, accounts) joined with the
 * database (sessions, grades, LLM calls, tokens, today's rate-limit usage).
 * Read-only; changes nothing in Clerk or the database.
 *
 *   npm run beta:report            # against DATABASE_URL (local)
 *   npm run beta:report -- --prod  # against production (DATABASE_URL_UNPOOLED in .env.local)
 *
 * Needs CLERK_SECRET_KEY for the same Clerk instance the database's users
 * come from. This is the raw material saas-plan.md §9.1 wants from the beta:
 * which modes people use, real cost per user, and whether they come back.
 */
import { loadEnvConfig } from "@next/env";
import { createClerkClient } from "@clerk/backend";
import { sql } from "drizzle-orm";

loadEnvConfig(process.cwd());

const prod = process.argv.includes("--prod");
if (prod) {
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) {
    console.error("--prod needs DATABASE_URL_UNPOOLED in .env.local (see README \"Deployment\").");
    process.exit(1);
  }
  process.env.DATABASE_URL = url;
}

const DAY_MS = 86_400_000;

function ago(ts: number | null | undefined): string {
  if (!ts) return "—";
  const mins = Math.round((Date.now() - ts) / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function table(rows: Record<string, string>[]): string {
  if (rows.length === 0) return "  (none)";
  const cols = Object.keys(rows[0]);
  const widths = cols.map((c) => Math.max(c.length, ...rows.map((r) => r[c].length)));
  const line = (vals: string[]) => "  " + vals.map((v, i) => v.padEnd(widths[i])).join("  ");
  return [line(cols), line(widths.map((w) => "─".repeat(w))), ...rows.map((r) => line(cols.map((c) => r[c])))].join("\n");
}

interface Usage {
  sessions: number;
  ended: number;
  graded: number;
  avgScore: number | null;
  modes: string;
  lastSessionAt: number | null;
  llmCalls: number;
  llmCalls7d: number;
  failedCalls: number;
  tokens: number;
  todayCalls: number;
}

async function main() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    console.error("CLERK_SECRET_KEY is not set.");
    process.exit(1);
  }
  const clerk = createClerkClient({ secretKey });
  const { db } = await import("../lib/db");

  const [invitations, users] = await Promise.all([
    clerk.invitations.getInvitationList({ limit: 100 }),
    clerk.users.getUserList({ limit: 100, orderBy: "-created_at" }),
  ]);

  // One row of usage per user id that appears anywhere in the database.
  const dayStart = Date.now() - (Date.now() % DAY_MS);
  const weekAgo = new Date(Date.now() - 7 * DAY_MS);
  const res = await db().execute(sql`
    with s as (
      select s.user_id,
             count(*)::int as sessions,
             count(*) filter (where s.ended_at is not null)::int as ended,
             max(s.created_at) as last_session_at,
             string_agg(distinct s.mode, ', ') as modes
      from sessions s group by s.user_id
    ),
    f as (
      select f.user_id,
             count(*) filter (where not f.grading_failed and not f.empty_transcript)::int as graded,
             avg((select avg((v->>'score')::numeric) from jsonb_each(f.sections) as e(k, v)))
               filter (where not f.grading_failed and not f.empty_transcript) as avg_score
      from feedback f group by f.user_id
    ),
    l as (
      select s.user_id,
             count(*)::int as llm_calls,
             count(*) filter (where l.ts >= ${weekAgo})::int as llm_calls_7d,
             count(*) filter (where not l.ok)::int as failed_calls,
             coalesce(sum((l.usage->>'total_tokens')::int), 0)::int as tokens
      from llm_call_logs l join sessions s on s.id::text = l.session_id
      group by s.user_id
    ),
    r as (
      select user_id, count::int as today_calls from rate_limits where bucket = 'day' and window_start = ${dayStart}
    ),
    ids as (select user_id from s union select user_id from r union select user_id from objectives)
    select ids.user_id, s.sessions, s.ended, s.last_session_at, s.modes, f.graded, f.avg_score,
           l.llm_calls, l.llm_calls_7d, l.failed_calls, l.tokens, r.today_calls
    from ids left join s using (user_id) left join f using (user_id) left join l using (user_id) left join r using (user_id)
  `);

  const usage = new Map<string, Usage>();
  for (const row of res.rows as Record<string, unknown>[]) {
    usage.set(String(row.user_id), {
      sessions: Number(row.sessions ?? 0),
      ended: Number(row.ended ?? 0),
      graded: Number(row.graded ?? 0),
      avgScore: row.avg_score === null || row.avg_score === undefined ? null : Number(row.avg_score),
      modes: (row.modes as string | null) ?? "",
      lastSessionAt: row.last_session_at ? Number(row.last_session_at) : null,
      llmCalls: Number(row.llm_calls ?? 0),
      llmCalls7d: Number(row.llm_calls_7d ?? 0),
      failedCalls: Number(row.failed_calls ?? 0),
      tokens: Number(row.tokens ?? 0),
      todayCalls: Number(row.today_calls ?? 0),
    });
  }

  const dailyCap = Number(process.env.RATE_LIMIT_PER_DAY) > 0 ? Number(process.env.RATE_LIMIT_PER_DAY) : 300;
  const emailOf = (u: (typeof users.data)[number]) =>
    u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ?? u.emailAddresses[0]?.emailAddress ?? u.id;

  console.log(`\nElocu beta report — ${prod ? "PRODUCTION" : "local"} database, ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC\n`);

  const pending = invitations.data.filter((i) => i.status === "pending");
  console.log(`Invitations (${invitations.data.length} total, ${pending.length} pending)`);
  console.log(
    table(
      invitations.data.map((i) => ({
        email: i.emailAddress,
        status: i.status,
        sent: ago(i.createdAt),
        updated: ago(i.updatedAt),
      }))
    )
  );

  console.log(`\nAccounts (${users.data.length})`);
  console.log(
    table(
      users.data.map((u) => {
        const x = usage.get(u.id);
        return {
          email: emailOf(u),
          joined: ago(u.createdAt),
          "last active": ago(u.lastActiveAt ?? u.lastSignInAt),
          sessions: x ? `${x.sessions} (${x.ended} ended)` : "0",
          graded: x ? String(x.graded) : "0",
          "avg score": x?.avgScore != null ? x.avgScore.toFixed(1) : "—",
          modes: x?.modes || "—",
          "AI calls": x ? `${x.llmCalls} (${x.llmCalls7d} in 7d)` : "0",
          failed: x ? String(x.failedCalls) : "0",
          tokens: x ? x.tokens.toLocaleString("en-US") : "0",
          today: x ? `${x.todayCalls}/${dailyCap}` : `0/${dailyCap}`,
          "last session": ago(x?.lastSessionAt),
        };
      })
    )
  );

  // Data under ids Clerk doesn't know — e.g. unclaimed "local-user" imports,
  // or users deleted in Clerk whose sessions are still in the database.
  const known = new Set(users.data.map((u) => u.id));
  const orphans = [...usage.entries()].filter(([id]) => !known.has(id));
  if (orphans.length > 0) {
    console.log(`\nData not linked to a current Clerk account (${orphans.length})`);
    console.log(table(orphans.map(([id, x]) => ({ "user id": id, sessions: String(x.sessions), "AI calls": String(x.llmCalls) }))));
  }

  const totalTokens = [...usage.values()].reduce((a, x) => a + x.tokens, 0);
  const totalCalls = [...usage.values()].reduce((a, x) => a + x.llmCalls, 0);
  const totalSessions = [...usage.values()].reduce((a, x) => a + x.sessions, 0);
  console.log(
    `\nTotals: ${totalSessions} sessions, ${totalCalls} AI calls, ${totalTokens.toLocaleString("en-US")} tokens` +
      (totalSessions > 0 ? ` (~${Math.round(totalTokens / totalSessions).toLocaleString("en-US")} tokens/session)` : "") +
      "\n"
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
