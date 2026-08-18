import type { TranscriptTurn } from "./types";

export interface ConversationMetrics {
  /** null when there's no text on either side to compute a ratio from. */
  talkTimePct: number | null;
  /** Share of user turns containing a "?" — null when there are no user turns. */
  questionRatePct: number | null;
  userTurnCount: number;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Talk-time ratio and question rate — Conversation mode's shape (frequent
 * back-and-forth, unlike Pitch/Speech's single monologue) is what makes
 * these meaningful, so lib/grading.ts only injects this for that mode. Both
 * are plain text analysis: talk-time by word count per speaker (a real
 * duration-based ratio isn't available for the AI's turns, which are never
 * "spoken" client-side), question rate by counting "?" per user turn.
 */
export function computeConversationMetrics(session: { turns: TranscriptTurn[] }): ConversationMetrics {
  const userTurns = session.turns.filter((t) => t.speaker === "user");
  const aiTurns = session.turns.filter((t) => t.speaker === "ai");

  const userWords = userTurns.reduce((sum, t) => sum + wordCount(t.text), 0);
  const aiWords = aiTurns.reduce((sum, t) => sum + wordCount(t.text), 0);
  const totalWords = userWords + aiWords;
  const talkTimePct = totalWords > 0 ? (userWords / totalWords) * 100 : null;

  const questionTurns = userTurns.filter((t) => t.text.includes("?")).length;
  const questionRatePct = userTurns.length > 0 ? (questionTurns / userTurns.length) * 100 : null;

  return { talkTimePct, questionRatePct, userTurnCount: userTurns.length };
}
