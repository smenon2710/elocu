import { computeContentMetrics } from "./contentMetrics";
import { computeConversationMetrics } from "./conversationMetrics";
import { computeDeliveryMetrics } from "./deliveryMetrics";
import { computePitchTiming } from "./pitchMetrics";
import type { FeedbackWithSession } from "./store";
import type { FeedbackSections, SessionMode } from "./types";

export const MODE_LABELS: Record<SessionMode, string> = {
  interview: "Interview",
  conversation: "Conversation",
  speech: "Speech",
  orator: "Orator",
  debate: "Debate",
  pitch: "Pitch",
};

const SECTION_LABELS: Record<string, string> = {
  structure: "Structure",
  delivery: "Delivery",
  content: "Content",
  engagement: "Engagement",
  contextFit: "Context Fit",
  argumentation: "Argumentation",
};

export interface CategoryAverage {
  key: string;
  label: string;
  average: number;
  count: number;
  /** How to render the number — "score" (x/5, the default) or a raw unit like "wpm"/"%"/"s". */
  unit?: "wpm" | "%" | "s";
}

export interface TrendPoint {
  sessionId: string;
  createdAt: number;
  average: number;
}

export interface ProgressStats {
  totalCompleted: number;
  validCount: number;
  overallAverage: number | null;
  sectionAverages: CategoryAverage[];
  modeAverages: CategoryAverage[];
  trend: TrendPoint[];
}

function sessionAverage(sections: FeedbackSections): number {
  const scores = Object.values(sections)
    .filter((s): s is { score: number } => !!s)
    .map((s) => s.score);
  return scores.reduce((sum, n) => sum + n, 0) / scores.length;
}

function average(values: number[]): number | null {
  return values.length > 0 ? values.reduce((sum, n) => sum + n, 0) / values.length : null;
}

/**
 * Aggregates raw per-session feedback into the numbers the insights page
 * shows. Only `valid` rows (not gradingFailed, not emptyTranscript) feed the
 * averages — placeholder scores from a failed grading pass would silently
 * skew them otherwise. `totalCompleted` still counts everything passed in,
 * so the page can be honest about how many were excluded and why. Callers
 * pre-filter `rows` by mode (see app/(app)/app/insights/page.tsx) — this
 * function itself is mode-agnostic, same aggregation logic either way.
 */
export function computeProgressStats(rows: FeedbackWithSession[]): ProgressStats {
  const validRows = rows.filter((r) => r.valid);

  const sectionTotals = new Map<string, { sum: number; count: number }>();
  for (const row of validRows) {
    for (const [key, section] of Object.entries(row.sections)) {
      if (!section) continue;
      const entry = sectionTotals.get(key) ?? { sum: 0, count: 0 };
      entry.sum += section.score;
      entry.count += 1;
      sectionTotals.set(key, entry);
    }
  }
  const sectionAverages: CategoryAverage[] = Array.from(sectionTotals.entries())
    .map(([key, { sum, count }]) => ({ key, label: SECTION_LABELS[key] ?? key, average: sum / count, count }))
    .sort((a, b) => b.average - a.average);

  const modeTotals = new Map<SessionMode, { sum: number; count: number }>();
  for (const row of validRows) {
    const avg = sessionAverage(row.sections);
    const entry = modeTotals.get(row.mode) ?? { sum: 0, count: 0 };
    entry.sum += avg;
    entry.count += 1;
    modeTotals.set(row.mode, entry);
  }
  const modeAverages: CategoryAverage[] = Array.from(modeTotals.entries())
    .map(([mode, { sum, count }]) => ({ key: mode, label: MODE_LABELS[mode], average: sum / count, count }))
    .sort((a, b) => b.average - a.average);

  const trend: TrendPoint[] = validRows.map((row) => ({
    sessionId: row.sessionId,
    createdAt: row.createdAt,
    average: sessionAverage(row.sections),
  }));

  const overallAverage = trend.length > 0 ? trend.reduce((sum, t) => sum + t.average, 0) / trend.length : null;

  return {
    totalCompleted: rows.length,
    validCount: validRows.length,
    overallAverage,
    sectionAverages,
    modeAverages,
    trend,
  };
}

export interface DeliveryMetricStats {
  wpm: CategoryAverage | null;
  fillerPct: CategoryAverage | null;
  hedgePct: CategoryAverage | null;
  ttrPct: CategoryAverage | null;
}

/**
 * Averages the real, deterministic per-session metrics (lib/deliveryMetrics.ts,
 * lib/contentMetrics.ts) across every valid graded session — not part of the
 * LLM-graded `sections`, computed fresh from each row's real transcript
 * turns (now carried on `FeedbackWithSession`, see lib/store.ts). Each
 * average is null (and hidden by the page) if no session had enough data to
 * produce that particular number — same "don't show a number that isn't
 * trustworthy" rule the per-session feedback page already follows.
 */
export function computeDeliveryMetricStats(rows: FeedbackWithSession[]): DeliveryMetricStats {
  const validRows = rows.filter((r) => r.valid);
  const wpmValues: number[] = [];
  const fillerValues: number[] = [];
  const hedgeValues: number[] = [];
  const ttrValues: number[] = [];

  for (const row of validRows) {
    const delivery = computeDeliveryMetrics({ turns: row.turns });
    if (delivery.wpm !== null) wpmValues.push(delivery.wpm);
    if (delivery.fillerPct !== null) fillerValues.push(delivery.fillerPct);
    if (delivery.hedgePct !== null) hedgeValues.push(delivery.hedgePct);

    const content = computeContentMetrics({ turns: row.turns });
    if (content.ttrPct !== null) ttrValues.push(content.ttrPct);
  }

  const wpmAvg = average(wpmValues);
  const fillerAvg = average(fillerValues);
  const hedgeAvg = average(hedgeValues);
  const ttrAvg = average(ttrValues);

  return {
    wpm: wpmAvg !== null ? { key: "wpm", label: "Pace", average: wpmAvg, count: wpmValues.length, unit: "wpm" } : null,
    fillerPct:
      fillerAvg !== null
        ? { key: "filler", label: "Filler words", average: fillerAvg, count: fillerValues.length, unit: "%" }
        : null,
    hedgePct:
      hedgeAvg !== null
        ? { key: "hedge", label: "Hedge words", average: hedgeAvg, count: hedgeValues.length, unit: "%" }
        : null,
    ttrPct:
      ttrAvg !== null
        ? { key: "ttr", label: "Vocabulary diversity", average: ttrAvg, count: ttrValues.length, unit: "%" }
        : null,
  };
}

export interface ConversationDynamicsStats {
  talkTimePct: CategoryAverage | null;
  questionRatePct: CategoryAverage | null;
}

/** Conversation mode only — see lib/conversationMetrics.ts for why talk-time/question-rate don't generalize to other modes. */
export function computeConversationDynamicsStats(rows: FeedbackWithSession[]): ConversationDynamicsStats {
  const validRows = rows.filter((r) => r.valid && r.mode === "conversation");
  const talkValues: number[] = [];
  const questionValues: number[] = [];

  for (const row of validRows) {
    const dynamics = computeConversationMetrics({ turns: row.turns });
    if (dynamics.talkTimePct !== null) talkValues.push(dynamics.talkTimePct);
    if (dynamics.questionRatePct !== null) questionValues.push(dynamics.questionRatePct);
  }

  const talkAvg = average(talkValues);
  const questionAvg = average(questionValues);

  return {
    talkTimePct:
      talkAvg !== null ? { key: "talkTime", label: "Talk time", average: talkAvg, count: talkValues.length, unit: "%" } : null,
    questionRatePct:
      questionAvg !== null
        ? { key: "questionRate", label: "Asked a question back", average: questionAvg, count: questionValues.length, unit: "%" }
        : null,
  };
}

export interface PitchTimingStats {
  /** Average seconds over (positive) or under (negative) budget. */
  avgDiffSec: number | null;
  /** Share of pitches landing within ~15% (min 5s) of their time budget. */
  onTargetRatePct: number | null;
  count: number;
}

/** Pitch mode only — how close attempts land to their chosen time budget, on average. */
export function computePitchTimingStats(rows: FeedbackWithSession[]): PitchTimingStats {
  const validRows = rows.filter((r) => r.valid && r.mode === "pitch");
  const diffs: number[] = [];
  let onTarget = 0;

  for (const row of validRows) {
    const timing = computePitchTiming({ turns: row.turns, pitchTimeLimitSec: row.pitchTimeLimitSec });
    if (!timing) continue;
    diffs.push(timing.diffSec);
    const tolerance = Math.max(5, timing.targetSec * 0.15);
    if (Math.abs(timing.diffSec) <= tolerance) onTarget += 1;
  }

  if (diffs.length === 0) return { avgDiffSec: null, onTargetRatePct: null, count: 0 };
  return {
    avgDiffSec: average(diffs),
    onTargetRatePct: (onTarget / diffs.length) * 100,
    count: diffs.length,
  };
}

/** Distinct modes actually present in `rows`, most-recent-first by their latest session — powers the insights page's mode tabs (only tabs with real data are shown). */
export function distinctModes(rows: FeedbackWithSession[]): SessionMode[] {
  const lastSeen = new Map<SessionMode, number>();
  for (const row of rows) {
    lastSeen.set(row.mode, Math.max(lastSeen.get(row.mode) ?? 0, row.createdAt));
  }
  return Array.from(lastSeen.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([mode]) => mode);
}
