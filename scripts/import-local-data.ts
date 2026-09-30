/**
 * One-off: copies the pre-Postgres file store (data/sessions/*.json,
 * data/objectives/*.json, data/logs/*.jsonl) into the database DATABASE_URL
 * points at. Safe to re-run — rows that already exist are skipped, never
 * overwritten.
 *
 *   npm run db:import-local                 # assigns everything to "local-user"
 *   npm run db:import-local -- <userId>     # or straight to a specific account
 *
 * Imported under "local-user" by default, which is who the app runs as
 * until sign-in lands (lib/auth.ts). The files on disk are left untouched.
 */
import { loadEnvConfig } from "@next/env";
import { sql } from "drizzle-orm";
import { promises as fs } from "fs";
import path from "path";

loadEnvConfig(process.cwd());

async function readJsonFiles<T>(dir: string, filter: (f: string) => boolean): Promise<[string, T][]> {
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const out: [string, T][] = [];
  for (const f of files.filter(filter)) {
    try {
      out.push([f, JSON.parse(await fs.readFile(path.join(dir, f), "utf-8")) as T]);
    } catch {
      console.warn(`  skipped unreadable ${f}`);
    }
  }
  return out;
}

async function readJsonl<T>(dir: string, prefix: string): Promise<T[]> {
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const rows: T[] = [];
  for (const f of files.filter((f) => f.startsWith(prefix) && f.endsWith(".jsonl"))) {
    for (const line of (await fs.readFile(path.join(dir, f), "utf-8")).split("\n")) {
      if (!line.trim()) continue;
      try {
        rows.push(JSON.parse(line) as T);
      } catch {
        // skip a corrupt line
      }
    }
  }
  return rows;
}

// Postgres can't store U+0000, which binary uploads from before
// lib/documents.ts rejected them (e.g. a .docx read as text) left in some
// sessions. Strip it everywhere in a record rather than failing the import.
function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value).replace(/\\u0000/g, "")) as T;
}

async function main() {
  // Imported after env loading so lib/db sees DATABASE_URL.
  const { db, schema } = await import("../lib/db");
  const { isValidId } = await import("../lib/store");
  const { LOCAL_USER_ID } = await import("../lib/types");
  type Session = import("../lib/types").Session;
  type Feedback = import("../lib/types").Feedback;
  type Objective = import("../lib/types").Objective;

  const userId = process.argv[2] || LOCAL_USER_ID;
  const dataDir = path.join(process.cwd(), "data");
  console.log(`Importing ${dataDir} as user "${userId}"`);

  const sessionFiles = await readJsonFiles<Session>(path.join(dataDir, "sessions"), (f) => f.endsWith(".json") && !f.endsWith(".feedback.json"));
  const feedbackFiles = await readJsonFiles<Feedback>(path.join(dataDir, "sessions"), (f) => f.endsWith(".feedback.json"));
  const objectiveFiles = await readJsonFiles<Objective>(path.join(dataDir, "objectives"), (f) => f.endsWith(".json"));

  let sessionCount = 0;
  for (const [, raw] of sessionFiles) {
    const s = clean(raw);
    if (!isValidId(s.id)) continue;
    const res = await db()
      .insert(schema.sessions)
      .values({
        id: s.id,
        userId,
        createdAt: s.createdAt,
        endedAt: s.endedAt ?? null,
        mode: s.mode,
        topic: s.topic ?? "",
        documentsUsed: !!s.documentsUsed,
        documentRefs: s.documentRefs ?? [],
        turns: s.turns ?? [],
        pitchTimeLimitSec: s.pitchTimeLimitSec ?? null,
        goalLabel: s.goalLabel ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: schema.sessions.id });
    sessionCount += res.length;
  }

  const importedSessionIds = new Set(sessionFiles.map(([, s]) => s.id));
  let feedbackCount = 0;
  for (const [, raw] of feedbackFiles) {
    const f = clean(raw);
    if (!importedSessionIds.has(f.sessionId)) continue;
    const res = await db()
      .insert(schema.feedback)
      .values({
        sessionId: f.sessionId,
        userId,
        generatedAt: f.generatedAt,
        sections: f.sections,
        gradingFailed: !!f.gradingFailed,
        emptyTranscript: !!f.emptyTranscript,
        gradedTurnCount: f.gradedTurnCount ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: schema.feedback.sessionId });
    feedbackCount += res.length;
  }

  let objectiveCount = 0;
  for (const [, raw] of objectiveFiles) {
    const o = clean(raw);
    if (!isValidId(o.id)) continue;
    const res = await db()
      .insert(schema.objectives)
      .values({ id: o.id, userId, createdAt: o.createdAt, title: o.title, note: o.note ?? null, targets: o.targets ?? [] })
      .onConflictDoNothing()
      .returning({ id: schema.objectives.id });
    objectiveCount += res.length;
  }

  // Logs have no natural key, so they're only imported into an empty table —
  // re-running the script can't duplicate them.
  const logDir = path.join(dataDir, "logs");
  let logCount = 0;
  let failureCount = 0;
  const [{ n: existingLogs }] = await db().select({ n: sql<number>`count(*)::int` }).from(schema.llmCallLogs);
  if (existingLogs === 0) {
    type LogLine = { ts: string; durationMs: number; provider: string; label: string; sessionId: string | null; model: string; messageCount: number; ok: boolean; status: number | null; error: string | null; usage: unknown; providerRequestId?: string | null };
    for (const l of (await readJsonl<LogLine>(logDir, "llm-")).map(clean)) {
      await db().insert(schema.llmCallLogs).values({
        ts: new Date(l.ts),
        durationMs: l.durationMs ?? 0,
        provider: l.provider,
        label: l.label,
        sessionId: l.sessionId ?? null,
        model: l.model,
        messageCount: l.messageCount ?? 0,
        ok: !!l.ok,
        status: l.status ?? null,
        error: l.error ?? null,
        usage: l.usage ?? null,
        providerRequestId: l.providerRequestId ?? null,
      });
      logCount++;
    }
  }
  const [{ n: existingFailures }] = await db().select({ n: sql<number>`count(*)::int` }).from(schema.gradingFailures);
  if (existingFailures === 0) {
    type FailureLine = { ts: string; sessionId: string; reason: string; raw: string };
    for (const f of (await readJsonl<FailureLine>(logDir, "grading-failures-")).map(clean)) {
      await db().insert(schema.gradingFailures).values({ ts: new Date(f.ts), sessionId: f.sessionId, reason: f.reason, raw: f.raw ?? "" });
      failureCount++;
    }
  }

  console.log(
    `Imported ${sessionCount} sessions, ${feedbackCount} feedback, ${objectiveCount} objectives, ${logCount} call logs, ${failureCount} grading failures (already-present rows skipped).`
  );
  process.exit(0);
}


main().catch((err) => {
  console.error(err);
  process.exit(1);
});
