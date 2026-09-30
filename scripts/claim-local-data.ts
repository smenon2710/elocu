/**
 * One-off: hands everything imported under "local-user" (see
 * scripts/import-local-data.ts) to a real Clerk account, so the pre-sign-in
 * history shows up for its owner and nobody else.
 *
 *   npm run db:claim-local -- you@example.com   # looks the account up in Clerk
 *   npm run db:claim-local -- user_2abc…        # or pass the Clerk user id directly
 *
 * Sign up in the app first so the account exists. Uses DATABASE_URL and
 * CLERK_SECRET_KEY from .env.local. Re-running is harmless: once claimed,
 * there are no "local-user" rows left to move.
 */
import { loadEnvConfig } from "@next/env";
import { createClerkClient } from "@clerk/backend";
import { eq } from "drizzle-orm";

loadEnvConfig(process.cwd());

async function resolveUserId(arg: string): Promise<string> {
  if (arg.startsWith("user_")) return arg;
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("CLERK_SECRET_KEY is not set — needed to look up an account by email (or pass the user_… id instead).");
  const clerk = createClerkClient({ secretKey });
  const { data } = await clerk.users.getUserList({ emailAddress: [arg] });
  if (data.length === 0) throw new Error(`No Clerk user with email ${arg} — sign up in the app first.`);
  return data[0].id;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: npm run db:claim-local -- <email | user_id>");
    process.exit(1);
  }
  const { db, schema } = await import("../lib/db");
  const { LOCAL_USER_ID } = await import("../lib/types");

  const userId = await resolveUserId(arg);
  const moved = await db().transaction(async (tx) => {
    const s = await tx.update(schema.sessions).set({ userId }).where(eq(schema.sessions.userId, LOCAL_USER_ID)).returning({ id: schema.sessions.id });
    const f = await tx.update(schema.feedback).set({ userId }).where(eq(schema.feedback.userId, LOCAL_USER_ID)).returning({ id: schema.feedback.sessionId });
    const o = await tx.update(schema.objectives).set({ userId }).where(eq(schema.objectives.userId, LOCAL_USER_ID)).returning({ id: schema.objectives.id });
    return { sessions: s.length, feedback: f.length, objectives: o.length };
  });
  console.log(`Moved ${moved.sessions} sessions, ${moved.feedback} feedback, ${moved.objectives} objectives from "${LOCAL_USER_ID}" to ${userId}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
