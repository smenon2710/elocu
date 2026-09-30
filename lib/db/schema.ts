import { bigint, bigserial, boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { DocumentRef, FeedbackSections, ObjectiveTarget, SessionMode, TranscriptTurn } from "../types";

// Every user-owned table carries `user_id`, and every query in lib/store.ts
// filters on it — that, not the sign-in redirect, is what keeps one user's
// sessions and insights invisible to another. It's plain text because the
// id comes from the auth provider (Clerk's "user_…" ids), not from a users
// table of our own.
//
// Timestamps stay as epoch milliseconds (bigint, read back as JS numbers)
// rather than timestamptz so the shapes in lib/types.ts — and everything that
// does arithmetic on createdAt/startTs — are unchanged by the migration.
//
// Collections that are only ever read and written whole (turns,
// documentRefs, feedback sections, objective targets) are JSONB, not child
// tables: nothing queries inside them, so splitting them out would add joins
// for no benefit.

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    endedAt: bigint("ended_at", { mode: "number" }),
    mode: text("mode").$type<SessionMode>().notNull(),
    topic: text("topic").notNull(),
    documentsUsed: boolean("documents_used").notNull(),
    documentRefs: jsonb("document_refs").$type<DocumentRef[]>().notNull(),
    turns: jsonb("turns").$type<TranscriptTurn[]>().notNull(),
    pitchTimeLimitSec: integer("pitch_time_limit_sec"),
    goalLabel: text("goal_label"),
  },
  (t) => [index("sessions_user_created_idx").on(t.userId, t.createdAt), index("sessions_user_goal_idx").on(t.userId, t.goalLabel)]
);

export const feedback = pgTable(
  "feedback",
  {
    sessionId: uuid("session_id")
      .primaryKey()
      .references(() => sessions.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    generatedAt: bigint("generated_at", { mode: "number" }).notNull(),
    sections: jsonb("sections").$type<FeedbackSections>().notNull(),
    gradingFailed: boolean("grading_failed").notNull().default(false),
    emptyTranscript: boolean("empty_transcript").notNull().default(false),
    gradedTurnCount: integer("graded_turn_count"),
  },
  (t) => [index("feedback_user_idx").on(t.userId)]
);

export const objectives = pgTable(
  "objectives",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    title: text("title").notNull(),
    note: text("note"),
    targets: jsonb("targets").$type<ObjectiveTarget[]>().notNull(),
  },
  (t) => [index("objectives_user_idx").on(t.userId)]
);

// Replaces data/logs/llm-*.jsonl. Not user-scoped directly: rows are read
// back only by session id, and only after lib/store.ts has confirmed the
// session belongs to the caller (see app/(app)/session/[id]/logs/page.tsx).
export const llmCallLogs = pgTable(
  "llm_call_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    durationMs: integer("duration_ms").notNull(),
    provider: text("provider").notNull(),
    label: text("label").notNull(),
    sessionId: text("session_id"),
    model: text("model").notNull(),
    messageCount: integer("message_count").notNull(),
    ok: boolean("ok").notNull(),
    status: integer("status"),
    error: text("error"),
    usage: jsonb("usage"),
    providerRequestId: text("provider_request_id"),
  },
  (t) => [index("llm_call_logs_session_idx").on(t.sessionId)]
);

// Replaces data/logs/grading-failures-*.jsonl — same ownership rule as above.
export const gradingFailures = pgTable(
  "grading_failures",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    sessionId: text("session_id").notNull(),
    reason: text("reason").notNull(),
    raw: text("raw").notNull(),
  },
  (t) => [index("grading_failures_session_idx").on(t.sessionId)]
);
