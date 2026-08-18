export type Speaker = "user" | "ai";

export interface TranscriptTurn {
  speaker: Speaker;
  text: string;
  audioRef: null; // Web Speech API exposes no recording blob; field kept for schema parity
  startTs: number;
  endTs: number;
}

export type DocumentKind = "resume" | "job_description" | "question_list" | "other";

export interface DocumentRef {
  id: string;
  kind: DocumentKind;
  filename: string;
  text: string;
}

export type SessionMode = "interview" | "conversation" | "speech" | "orator" | "debate" | "pitch";

export interface Session {
  id: string;
  userId: string;
  createdAt: number;
  endedAt: number | null;
  mode: SessionMode;
  topic: string;
  documentsUsed: boolean;
  documentRefs: DocumentRef[];
  turns: TranscriptTurn[];
  /** Only meaningful for `pitch` mode — the time budget (seconds) picked at start. Null for every other mode. */
  pitchTimeLimitSec: number | null;
  /**
   * Freeform, user-named identity for an ongoing thing being rehearsed
   * across multiple sessions ("Pitch to Dale Carnegie", "Q3 board meeting
   * speech") — optional, null for a one-off session. Sessions sharing a
   * label group together for improvement tracking (lib/store.ts's
   * listGoalLabels/getPreviousAttemptForGoal, the feedback page's
   * attempt-over-attempt delta, and /app/goals/[label]'s trend view).
   * Deliberately just a string, not a separate entity/table — matches
   * `topic`'s existing freeform-text pattern rather than adding a new
   * concept to manage.
   */
  goalLabel: string | null;
}

export interface QuotedMoment {
  text: string;
  turnIndex: number;
}

export interface FeedbackSection {
  score: number;
  quotedMoment: QuotedMoment | null;
  fix: string;
}

export interface FeedbackSections {
  structure: FeedbackSection;
  delivery: FeedbackSection;
  content: FeedbackSection;
  engagement: FeedbackSection;
  contextFit?: FeedbackSection;
  argumentation?: FeedbackSection;
}

export interface Feedback {
  sessionId: string;
  generatedAt: number;
  sections: FeedbackSections;
  gradingFailed?: boolean;
  /** True when the session ended with no user turns at all — nothing to grade, not a failure. */
  emptyTranscript?: boolean;
  /**
   * `session.turns.length` at the moment this was generated. Lets
   * `/api/sessions/[id]/pause` (see lib/grading.ts) skip a redundant
   * grading LLM call when nothing's been added since the last pause,
   * without needing a separate versioning scheme. Optional because
   * feedback generated before this field existed won't have it — treated
   * as "always regrade" rather than backfilled, since a stale one-time
   * miss costs one extra call, not correctness.
   */
  gradedTurnCount?: number;
}

export type ObjectiveMetric =
  | "overallScore"
  | "sectionScore"
  | "wpm"
  | "fillerPct"
  | "hedgePct"
  | "ttrPct"
  | "talkTimePct"
  | "questionRatePct"
  | "pitchOnTargetPct";

/**
 * One structured, trackable target under an Objective — e.g. "Argumentation
 * score in Debate -> 4.5/5." An Objective can hold several of these in
 * parallel (add one manually, or from an LLM suggestion — see
 * lib/objectiveSuggestion.ts), each with its own id so it can be edited or
 * removed independently without disturbing the others.
 */
export interface ObjectiveTarget {
  id: string;
  metric: ObjectiveMetric;
  /** Scopes the metric to one mode (e.g. only Debate sessions). Ignored for
   * metrics that are inherently mode-locked already (talkTimePct/
   * questionRatePct -> conversation, pitchOnTargetPct -> pitch). */
  mode: SessionMode | null;
  /** Only meaningful when metric === "sectionScore". */
  sectionKey: keyof FeedbackSections | null;
  targetValue: number;
}

/**
 * A user-declared aspiration tracked against real accumulated practice data
 * on /app/insights — distinct from Session.goalLabel above, which groups
 * repeated attempts at one specific thing ("Pitch to Dale Carnegie"). An
 * Objective is a broader target ("get better at Debate," "hit 150wpm")
 * measured across every qualifying session, not one practice thread.
 * `targets: []` means a pure free-text aspiration with no hard number(s) to
 * track yet — see lib/objectives.ts for how progress is computed either way.
 */
export interface Objective {
  id: string;
  userId: string;
  createdAt: number;
  title: string;
  note: string | null;
  /** Zero or more structured targets tracked in parallel under this one goal. */
  targets: ObjectiveTarget[];
}

export const LOCAL_USER_ID = "local-user";

// Speech/Orator/Pitch are single-round by design: one AI prompt, one
// (possibly long) user turn, one brief AI reaction, then auto-end. Interview/
// Conversation/Debate are open-ended back-and-forth up to this many turns.
export const MAX_EXCHANGES_BY_MODE: Record<SessionMode, number> = {
  interview: 12,
  conversation: 12,
  debate: 12,
  speech: 1,
  orator: 1,
  pitch: 1,
};

// The only durations a pitch's time budget can be — validated against on the
// server (app/api/sessions/route.ts) and offered as the picker's choices in
// the mode selector (app/(app)/app/page.tsx).
export const PITCH_TIME_LIMITS_SEC = [30, 60, 90, 180] as const;
export const DEFAULT_PITCH_TIME_LIMIT_SEC = 90;
