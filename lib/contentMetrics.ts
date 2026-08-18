import type { TranscriptTurn } from "./types";

// Below this many words, type-token ratio is dominated by noise (a 5-word
// turn is trivially "100% unique"). Raw TTR is also inherently biased by
// length — longer text naturally re-uses more words, so it drops as a
// conversation runs on even with no change in actual vocabulary richness.
// That's a known limitation of raw TTR (vs. length-corrected measures like
// MTLD/VOCD, which are real NLP, not a quick word-count formula) — fine as
// a rough same-session signal, but not a fair comparison across sessions of
// very different lengths (e.g. a 1-turn Pitch vs. a 12-exchange Interview).
const MIN_WORDS_FOR_TTR = 20;

export interface ContentMetrics {
  totalWords: number;
  uniqueWords: number;
  /** null below MIN_WORDS_FOR_TTR — not enough text for the ratio to mean anything. */
  ttrPct: number | null;
}

/**
 * Type-token ratio (unique words / total words) across every user turn —
 * plain text analysis, no LLM call. Feeds lib/grading.ts's Content prompt as
 * measured data and the feedback page's stat line, same pattern as
 * lib/deliveryMetrics.ts.
 */
export function computeContentMetrics(session: { turns: TranscriptTurn[] }): ContentMetrics {
  const userTurns = session.turns.filter((t) => t.speaker === "user");
  const words = userTurns
    .flatMap((t) => t.text.toLowerCase().match(/[a-z0-9']+/g) ?? [])
    .filter(Boolean);

  const totalWords = words.length;
  const uniqueWords = new Set(words).size;
  const ttrPct = totalWords >= MIN_WORDS_FOR_TTR ? (uniqueWords / totalWords) * 100 : null;

  return { totalWords, uniqueWords, ttrPct };
}
