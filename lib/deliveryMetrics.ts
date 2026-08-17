import type { Session } from "./types";

// Lexical fillers only. Non-lexical ones ("um", "uh") are vocalized pauses
// that speech-recognition engines frequently drop entirely rather than
// transcribe — they're kept in the list in case a recognizer does catch
// them, but "like"/"you know"/"i mean" are the ones that reliably show up in
// a Web Speech API transcript (lib/useSpeech.ts). This is word-boundary
// regex matching, not real NLP — "like" in particular has legitimate
// non-filler uses ("I like pizza"), so counts here are a heuristic meant to
// ground feedback in an approximate number, not a linguistically precise one.
const FILLER_WORDS = ["um", "umm", "uh", "uhh", "er", "erm", "like", "you know", "i mean"] as const;

// Below this much real speaking time, a words/minute figure is more noise
// than signal (and on sessions from before turn duration was tracked
// accurately, total duration is 0 — this keeps a nonsense/infinite WPM from
// ever being shown rather than trying to special-case "old data").
const MIN_DURATION_SEC_FOR_WPM = 1;
// Above this, the number almost certainly reflects bad duration data rather
// than an actual human talking speed — hide it rather than confuse the
// grading prompt or the feedback page with it.
const MAX_SANE_WPM = 400;

export interface DeliveryMetrics {
  totalWords: number;
  /** null when there isn't enough real duration data to trust a rate. */
  wpm: number | null;
  fillerCount: number;
  /** null when there are no words to divide by. */
  fillerPct: number | null;
  /** Non-zero fillers found, sorted most→least common. */
  fillerBreakdown: [string, number][];
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function countFillers(text: string): Record<string, number> {
  const lower = text.toLowerCase();
  const counts: Record<string, number> = {};
  for (const filler of FILLER_WORDS) {
    const pattern = new RegExp(`\\b${filler.replace(/\s+/g, "\\s+")}\\b`, "g");
    const matches = lower.match(pattern);
    if (matches) counts[filler] = matches.length;
  }
  return counts;
}

/**
 * Aggregated across every user turn in the session, from real turn duration
 * (app/api/sessions/[id]/messages/route.ts) and plain text analysis — no
 * audio, no LLM call. Feeds both lib/grading.ts's Delivery prompt (as
 * measured fact rather than something the model has to guess at) and the
 * feedback page's always-accurate stat line, which stays correct even when
 * grading itself fails.
 */
export function computeDeliveryMetrics(session: Session): DeliveryMetrics {
  const userTurns = session.turns.filter((t) => t.speaker === "user");
  const totalWords = userTurns.reduce((sum, t) => sum + wordCount(t.text), 0);
  const totalDurationSec = userTurns.reduce((sum, t) => sum + Math.max(0, (t.endTs - t.startTs) / 1000), 0);

  let wpm: number | null = null;
  if (totalWords > 0 && totalDurationSec >= MIN_DURATION_SEC_FOR_WPM) {
    const raw = Math.round((totalWords / totalDurationSec) * 60);
    if (raw > 0 && raw <= MAX_SANE_WPM) wpm = raw;
  }

  const fillerCounts = countFillers(userTurns.map((t) => t.text).join(" "));
  const fillerCount = Object.values(fillerCounts).reduce((a, b) => a + b, 0);
  const fillerPct = totalWords > 0 ? (fillerCount / totalWords) * 100 : null;
  const fillerBreakdown = Object.entries(fillerCounts).sort((a, b) => b[1] - a[1]);

  return { totalWords, wpm, fillerCount, fillerPct, fillerBreakdown };
}
