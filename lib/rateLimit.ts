import { and, eq, lt, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "./db";

// Per-user caps on LLM calls — the only thing between one account (or one
// runaway client loop) and the whole Groq/OpenRouter budget, now that
// sign-in is the only gate. One shared budget across every LLM-backed route:
// a full session is ~15 calls (opening line, up to 12 replies, a pause, the
// grade), so the defaults allow ~20 sessions a day with ample burst room.
// Override per deployment with RATE_LIMIT_PER_MINUTE / RATE_LIMIT_PER_DAY.
const DEFAULT_PER_MINUTE = 20;
const DEFAULT_PER_DAY = 300;

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

function limitFromEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export type QuotaResult = { ok: true } | { ok: false; retryAfterSec: number; message: string };

/**
 * Records one LLM call for `userId` and says whether it's within limits.
 * Call it immediately before the LLM call — after any cache check, so a
 * request that ends up needing no model call (e.g. a repeat pause with no new
 * turns) doesn't spend quota.
 *
 * Both windows are bumped in one INSERT … ON CONFLICT DO UPDATE … RETURNING,
 * so concurrent requests can't both read "under the limit" and slip past it.
 * Denied attempts are still counted — hammering the endpoint doesn't reset
 * anything, it just keeps being refused until the window rolls over.
 *
 * Fails open: if the counter itself can't be written (a database blip), the
 * call is allowed and the error logged, rather than taking every LLM feature
 * down with it.
 */
export async function consumeLlmQuota(userId: string, now = Date.now()): Promise<QuotaResult> {
  const perMinute = limitFromEnv("RATE_LIMIT_PER_MINUTE", DEFAULT_PER_MINUTE);
  const perDay = limitFromEnv("RATE_LIMIT_PER_DAY", DEFAULT_PER_DAY);
  const minuteStart = now - (now % MINUTE_MS);
  const dayStart = now - (now % DAY_MS); // UTC day

  let counts: { bucket: string; count: number }[];
  try {
    counts = await db()
      .insert(schema.rateLimits)
      .values([
        { userId, bucket: "minute", windowStart: minuteStart, count: 1 },
        { userId, bucket: "day", windowStart: dayStart, count: 1 },
      ])
      .onConflictDoUpdate({
        target: [schema.rateLimits.userId, schema.rateLimits.bucket, schema.rateLimits.windowStart],
        set: { count: sql`${schema.rateLimits.count} + 1` },
      })
      .returning({ bucket: schema.rateLimits.bucket, count: schema.rateLimits.count });
  } catch (err) {
    console.log(`[rate-limit] counter write failed, allowing call: ${err instanceof Error ? err.message : String(err)}`);
    return { ok: true };
  }

  const dayCount = counts.find((c) => c.bucket === "day")?.count ?? 0;
  const minuteCount = counts.find((c) => c.bucket === "minute")?.count ?? 0;

  // First call of a new day for this user: prune their old windows. Keeps the
  // table at ~2 rows per active user without a separate cleanup job.
  if (dayCount === 1) {
    await db()
      .delete(schema.rateLimits)
      .where(and(eq(schema.rateLimits.userId, userId), lt(schema.rateLimits.windowStart, dayStart)))
      .catch(() => {});
  }

  if (dayCount > perDay) {
    const retryAfterSec = Math.ceil((dayStart + DAY_MS - now) / 1000);
    return {
      ok: false,
      retryAfterSec,
      message: `You've reached today's limit of ${perDay} AI responses. It resets at midnight UTC — about ${Math.ceil(retryAfterSec / 3600)} hour(s) from now.`,
    };
  }
  if (minuteCount > perMinute) {
    const retryAfterSec = Math.ceil((minuteStart + MINUTE_MS - now) / 1000);
    return {
      ok: false,
      retryAfterSec,
      message: `That's a lot of requests in a short time — please wait ${retryAfterSec} second${retryAfterSec === 1 ? "" : "s"} and try again.`,
    };
  }
  return { ok: true };
}

/** The 429 for a denied QuotaResult — JSON `{ error }` like every other route, plus Retry-After. */
export function rateLimitedResponse(result: Extract<QuotaResult, { ok: false }>): NextResponse {
  return NextResponse.json(
    { error: result.message, rateLimited: true, retryAfterSec: result.retryAfterSec },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSec) } }
  );
}
