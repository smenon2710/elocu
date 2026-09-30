import { and, asc, desc, eq, isNotNull, lt, ne, sql } from "drizzle-orm";
import { db, schema } from "./db";
import type { Objective, Session, SessionMode, Feedback, FeedbackSections, TranscriptTurn } from "./types";

const { sessions, feedback, objectives } = schema;

// Postgres-backed (lib/db/schema.ts). Every function takes the caller's
// userId and filters on it — a session, its feedback, or an objective that
// belongs to someone else reads as "not found" and can't be updated or
// deleted, so there is no way to reach another user's data by guessing or
// sharing an id. Callers get the id from lib/auth.ts's getCurrentUserId().

// Every session/objective id is minted by crypto.randomUUID(), and ids arrive
// straight from URL params. Anything that isn't a UUID can't match a row, so
// it's rejected before the query — Postgres would otherwise throw on the
// uuid cast and turn a bad URL into a 500 instead of a 404.
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidId(id: string): boolean {
  return ID_PATTERN.test(id);
}

type SessionRow = typeof sessions.$inferSelect;
type FeedbackRow = typeof feedback.$inferSelect;
type ObjectiveRow = typeof objectives.$inferSelect;

function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    userId: row.userId,
    createdAt: row.createdAt,
    endedAt: row.endedAt,
    mode: row.mode,
    topic: row.topic,
    documentsUsed: row.documentsUsed,
    documentRefs: row.documentRefs,
    turns: row.turns,
    pitchTimeLimitSec: row.pitchTimeLimitSec,
    goalLabel: row.goalLabel,
  };
}

function toFeedback(row: FeedbackRow): Feedback {
  return {
    sessionId: row.sessionId,
    generatedAt: row.generatedAt,
    sections: row.sections,
    gradingFailed: row.gradingFailed,
    emptyTranscript: row.emptyTranscript,
    // Undefined (not null) when absent — /end and /pause treat a missing
    // count as "legacy feedback", see app/api/sessions/[id]/end/route.ts.
    gradedTurnCount: row.gradedTurnCount ?? undefined,
  };
}

function toObjective(row: ObjectiveRow): Objective {
  return { id: row.id, userId: row.userId, createdAt: row.createdAt, title: row.title, note: row.note, targets: row.targets };
}

/**
 * Insert or update. The update only applies when the existing row belongs to
 * the same user (`setWhere`), so a session id colliding with — or copied
 * from — someone else's can never overwrite their data.
 */
export async function saveSession(session: Session): Promise<void> {
  const updatable = {
    createdAt: session.createdAt,
    endedAt: session.endedAt,
    mode: session.mode,
    topic: session.topic,
    documentsUsed: session.documentsUsed,
    documentRefs: session.documentRefs,
    turns: session.turns,
    pitchTimeLimitSec: session.pitchTimeLimitSec,
    goalLabel: session.goalLabel,
  };
  await db()
    .insert(sessions)
    .values({ id: session.id, userId: session.userId, ...updatable })
    .onConflictDoUpdate({ target: sessions.id, set: updatable, setWhere: eq(sessions.userId, session.userId) });
}

export async function getSession(userId: string, id: string): Promise<Session | null> {
  if (!isValidId(id)) return null;
  const [row] = await db()
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, userId)))
    .limit(1);
  return row ? toSession(row) : null;
}

/** Same ownership rule as saveSession — and the session itself must belong to `userId`, or nothing is written. */
export async function saveFeedback(userId: string, fb: Feedback): Promise<void> {
  const owned = await getSession(userId, fb.sessionId);
  if (!owned) return;
  const updatable = {
    generatedAt: fb.generatedAt,
    sections: fb.sections,
    gradingFailed: fb.gradingFailed ?? false,
    emptyTranscript: fb.emptyTranscript ?? false,
    gradedTurnCount: fb.gradedTurnCount ?? null,
  };
  await db()
    .insert(feedback)
    .values({ sessionId: fb.sessionId, userId, ...updatable })
    .onConflictDoUpdate({ target: feedback.sessionId, set: updatable, setWhere: eq(feedback.userId, userId) });
}

export async function getFeedback(userId: string, sessionId: string): Promise<Feedback | null> {
  if (!isValidId(sessionId)) return null;
  const [row] = await db()
    .select()
    .from(feedback)
    .where(and(eq(feedback.sessionId, sessionId), eq(feedback.userId, userId)))
    .limit(1);
  return row ? toFeedback(row) : null;
}

export interface SessionSummary {
  id: string;
  mode: SessionMode;
  topic: string;
  createdAt: number;
  endedAt: number | null;
  turnCount: number;
  documentsUsed: boolean;
  hasFeedback: boolean;
  goalLabel: string | null;
}

/**
 * The user's sessions (in-progress and completed), most recent first — backs
 * the history sidebar. Turn count comes from jsonb_array_length rather than
 * shipping every transcript over the wire just to count it.
 */
export async function listSessions(userId: string, limit = 50): Promise<SessionSummary[]> {
  const rows = await db()
    .select({
      id: sessions.id,
      mode: sessions.mode,
      topic: sessions.topic,
      createdAt: sessions.createdAt,
      endedAt: sessions.endedAt,
      turnCount: sql<number>`jsonb_array_length(${sessions.turns})::int`,
      documentsUsed: sessions.documentsUsed,
      hasFeedback: sql<boolean>`${feedback.sessionId} is not null`,
      goalLabel: sessions.goalLabel,
    })
    .from(sessions)
    .leftJoin(feedback, eq(feedback.sessionId, sessions.id))
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.createdAt))
    .limit(limit);
  return rows;
}

export interface GoalSummary {
  label: string;
  count: number;
  lastUsedAt: number;
}

/**
 * The user's distinct goal labels, most recently used first — powers the
 * "keep practicing this?" picker in the mode selector
 * (app/(app)/app/page.tsx). Counts every session, not just graded ones, so a
 * goal is pickable before its first attempt has been graded.
 */
export async function listGoalLabels(userId: string, mode?: SessionMode): Promise<GoalSummary[]> {
  const conditions = [eq(sessions.userId, userId), isNotNull(sessions.goalLabel)];
  if (mode) conditions.push(eq(sessions.mode, mode));
  const rows = await db()
    .select({
      label: sessions.goalLabel,
      count: sql<number>`count(*)::int`,
      lastUsedAt: sql<number>`max(${sessions.createdAt})::bigint`,
    })
    .from(sessions)
    .where(and(...conditions))
    .groupBy(sessions.goalLabel)
    .orderBy(desc(sql`max(${sessions.createdAt})`));
  return rows.map((r) => ({ label: r.label as string, count: r.count, lastUsedAt: Number(r.lastUsedAt) }));
}

export interface FeedbackWithSession {
  sessionId: string;
  mode: SessionMode;
  topic: string;
  createdAt: number;
  goalLabel: string | null;
  sections: FeedbackSections;
  /** False if gradingFailed or emptyTranscript — placeholder scores that would skew averages. */
  valid: boolean;
  /** Real transcript turns — lets callers (lib/progress.ts) compute WPM/filler/TTR/etc. without a second query. */
  turns: TranscriptTurn[];
  pitchTimeLimitSec: number | null;
}

function feedbackWithSessionQuery(userId: string, goalLabel?: string) {
  const conditions = [eq(feedback.userId, userId), eq(sessions.userId, userId)];
  if (goalLabel !== undefined) conditions.push(eq(sessions.goalLabel, goalLabel));
  return db()
    .select({ s: sessions, f: feedback })
    .from(feedback)
    .innerJoin(sessions, eq(sessions.id, feedback.sessionId))
    .where(and(...conditions))
    .orderBy(asc(sessions.createdAt));
}

function toFeedbackWithSession({ s, f }: { s: SessionRow; f: FeedbackRow }): FeedbackWithSession {
  return {
    sessionId: s.id,
    mode: s.mode,
    topic: s.topic,
    createdAt: s.createdAt,
    goalLabel: s.goalLabel,
    sections: f.sections,
    valid: !f.gradingFailed && !f.emptyTranscript,
    turns: s.turns,
    pitchTimeLimitSec: s.pitchTimeLimitSec,
  };
}

/**
 * Every one of the user's sessions that has feedback, oldest first — the raw
 * material for Insights and the goal views. One indexed join, replacing the
 * old read-every-file-per-page-view scan (review.md §4).
 */
export async function listAllFeedback(userId: string): Promise<FeedbackWithSession[]> {
  const rows = await feedbackWithSessionQuery(userId);
  return rows.map(toFeedbackWithSession);
}

/**
 * Every valid, graded attempt sharing a goal label, oldest first — the raw
 * material for /app/goals/[label]'s trend view and the feedback page's
 * attempt-over-attempt delta.
 */
export async function listAttemptsForGoal(userId: string, goalLabel: string): Promise<FeedbackWithSession[]> {
  const rows = await feedbackWithSessionQuery(userId, goalLabel);
  return rows.map(toFeedbackWithSession).filter((r) => r.valid);
}

/**
 * The most recent graded attempt on the same goal, before `beforeCreatedAt`
 * and excluding `excludeSessionId` — what the feedback page compares the
 * current attempt against to show "+1 from last time".
 */
export async function getPreviousAttemptForGoal(
  userId: string,
  goalLabel: string,
  excludeSessionId: string,
  beforeCreatedAt: number
): Promise<FeedbackWithSession | null> {
  const rows = await db()
    .select({ s: sessions, f: feedback })
    .from(feedback)
    .innerJoin(sessions, eq(sessions.id, feedback.sessionId))
    .where(
      and(
        eq(sessions.userId, userId),
        eq(feedback.userId, userId),
        eq(sessions.goalLabel, goalLabel),
        ne(sessions.id, excludeSessionId),
        lt(sessions.createdAt, beforeCreatedAt),
        eq(feedback.gradingFailed, false),
        eq(feedback.emptyTranscript, false)
      )
    )
    .orderBy(desc(sessions.createdAt))
    .limit(1);
  return rows[0] ? toFeedbackWithSession(rows[0]) : null;
}

/** Feedback goes with it (ON DELETE CASCADE). */
export async function deleteSession(userId: string, id: string): Promise<void> {
  if (!isValidId(id)) return;
  await db()
    .delete(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, userId)));
}

export async function saveObjective(objective: Objective): Promise<void> {
  const updatable = { createdAt: objective.createdAt, title: objective.title, note: objective.note, targets: objective.targets };
  await db()
    .insert(objectives)
    .values({ id: objective.id, userId: objective.userId, ...updatable })
    .onConflictDoUpdate({ target: objectives.id, set: updatable, setWhere: eq(objectives.userId, objective.userId) });
}

export async function getObjective(userId: string, id: string): Promise<Objective | null> {
  if (!isValidId(id)) return null;
  const [row] = await db()
    .select()
    .from(objectives)
    .where(and(eq(objectives.id, id), eq(objectives.userId, userId)))
    .limit(1);
  return row ? toObjective(row) : null;
}

/** The user's tracked objectives, most recently created first — powers /app/insights' goals section. */
export async function listObjectives(userId: string): Promise<Objective[]> {
  const rows = await db().select().from(objectives).where(eq(objectives.userId, userId)).orderBy(desc(objectives.createdAt));
  return rows.map(toObjective);
}

export async function deleteObjective(userId: string, id: string): Promise<void> {
  if (!isValidId(id)) return;
  await db()
    .delete(objectives)
    .where(and(eq(objectives.id, id), eq(objectives.userId, userId)));
}
