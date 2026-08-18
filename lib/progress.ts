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

export type TrendDirection = "up" | "down" | "flat";

/**
 * What "improving" means for a metric — not every number here is simply
 * "bigger is better" (see lib/grading.ts's own tooltips: WPM and talk-time
 * both have a target *range*, and running a pitch too far under budget is
 * called out as its own problem, not a win). `up` always means "trending in
 * the direction the app already tells you is good" for that specific
 * metric, never just "the raw number went up" — the trend arrow's color is
 * meaningful, not just directional.
 */
export type Goodness = "higher-better" | "lower-better" | { target: number };

/**
 * Chronological first-half vs. second-half comparison — smoother than
 * last-vs-previous-single-session (which bounces around on one noisy data
 * point) while still simple enough to explain. Needs at least 2 points in
 * each half to say anything; returns null rather than guessing off too
 * little data, same "don't show a number that isn't trustworthy" rule
 * every other real metric in this app already follows.
 */
export function computeTrend(values: number[], goodness: Goodness, threshold: number): TrendDirection | null {
  if (values.length < 4) return null;
  const mid = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, mid);
  const secondHalf = values.slice(mid);

  const avg = (arr: number[]) => arr.reduce((sum, n) => sum + n, 0) / arr.length;
  const firstAvg = avg(firstHalf);
  const secondAvg = avg(secondHalf);

  if (typeof goodness === "object") {
    // Improvement = distance to target shrinking, regardless of which side of it you're on.
    const improvement = Math.abs(firstAvg - goodness.target) - Math.abs(secondAvg - goodness.target);
    if (improvement > threshold) return "up";
    if (improvement < -threshold) return "down";
    return "flat";
  }

  const diff = secondAvg - firstAvg;
  const signed = goodness === "higher-better" ? diff : -diff;
  if (signed > threshold) return "up";
  if (signed < -threshold) return "down";
  return "flat";
}

export interface CategoryAverage {
  key: string;
  label: string;
  average: number;
  count: number;
  /** How to render the number — "score" (x/5, the default) or a raw unit like "wpm"/"%"/"s". */
  unit?: "wpm" | "%" | "s";
  /** null when there isn't enough chronological data (< 4 points) to say anything meaningful. */
  trend?: TrendDirection | null;
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
  overallTrend: TrendDirection | null;
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

// Minimum change (in each metric's own unit) between the first and second
// half of the session history to count as a real trend rather than noise.
const SCORE_TREND_THRESHOLD = 0.15; // out of 5
const PCT_TREND_THRESHOLD = 3; // percentage points
const WPM_TREND_THRESHOLD = 5;
const SEC_TREND_THRESHOLD = 3;

// Midpoints of the ranges already documented as "good" elsewhere in the app
// (lib/grading.ts's objective-data blocks, the feedback page's Metric
// tooltips) — reused here so a trend arrow can never contradict what the
// per-session feedback already tells you about the same number.
const WPM_TARGET = 155; // middle of the 150-160 comprehension-research range
const TALK_TIME_TARGET = 47.5; // middle of the 40-55% balanced-conversation range

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

  // Chronological value arrays per key (not just a running sum) — `rows` is
  // already sorted oldest-first (lib/store.ts's listAllFeedback), and a
  // trend needs the actual sequence, not just the total.
  const sectionValues = new Map<string, number[]>();
  for (const row of validRows) {
    for (const [key, section] of Object.entries(row.sections)) {
      if (!section) continue;
      const arr = sectionValues.get(key) ?? [];
      arr.push(section.score);
      sectionValues.set(key, arr);
    }
  }
  const sectionAverages: CategoryAverage[] = Array.from(sectionValues.entries())
    .map(([key, values]) => ({
      key,
      label: SECTION_LABELS[key] ?? key,
      average: average(values)!,
      count: values.length,
      trend: computeTrend(values, "higher-better", SCORE_TREND_THRESHOLD),
    }))
    .sort((a, b) => b.average - a.average);

  const modeValues = new Map<SessionMode, number[]>();
  for (const row of validRows) {
    const arr = modeValues.get(row.mode) ?? [];
    arr.push(sessionAverage(row.sections));
    modeValues.set(row.mode, arr);
  }
  const modeAverages: CategoryAverage[] = Array.from(modeValues.entries())
    .map(([mode, values]) => ({
      key: mode,
      label: MODE_LABELS[mode],
      average: average(values)!,
      count: values.length,
      trend: computeTrend(values, "higher-better", SCORE_TREND_THRESHOLD),
    }))
    .sort((a, b) => b.average - a.average);

  const trend: TrendPoint[] = validRows.map((row) => ({
    sessionId: row.sessionId,
    createdAt: row.createdAt,
    average: sessionAverage(row.sections),
  }));

  const overallAverage = trend.length > 0 ? trend.reduce((sum, t) => sum + t.average, 0) / trend.length : null;
  const overallTrend = computeTrend(
    trend.map((t) => t.average),
    "higher-better",
    SCORE_TREND_THRESHOLD
  );

  return {
    totalCompleted: rows.length,
    validCount: validRows.length,
    overallAverage,
    overallTrend,
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
    wpm:
      wpmAvg !== null
        ? {
            key: "wpm",
            label: "Pace",
            average: wpmAvg,
            count: wpmValues.length,
            unit: "wpm",
            trend: computeTrend(wpmValues, { target: WPM_TARGET }, WPM_TREND_THRESHOLD),
          }
        : null,
    fillerPct:
      fillerAvg !== null
        ? {
            key: "filler",
            label: "Filler words",
            average: fillerAvg,
            count: fillerValues.length,
            unit: "%",
            trend: computeTrend(fillerValues, "lower-better", PCT_TREND_THRESHOLD),
          }
        : null,
    hedgePct:
      hedgeAvg !== null
        ? {
            key: "hedge",
            label: "Hedge words",
            average: hedgeAvg,
            count: hedgeValues.length,
            unit: "%",
            trend: computeTrend(hedgeValues, "lower-better", PCT_TREND_THRESHOLD),
          }
        : null,
    ttrPct:
      ttrAvg !== null
        ? {
            key: "ttr",
            label: "Vocabulary diversity",
            average: ttrAvg,
            count: ttrValues.length,
            unit: "%",
            trend: computeTrend(ttrValues, "higher-better", PCT_TREND_THRESHOLD),
          }
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
      talkAvg !== null
        ? {
            key: "talkTime",
            label: "Talk time",
            average: talkAvg,
            count: talkValues.length,
            unit: "%",
            trend: computeTrend(talkValues, { target: TALK_TIME_TARGET }, PCT_TREND_THRESHOLD),
          }
        : null,
    questionRatePct:
      questionAvg !== null
        ? {
            key: "questionRate",
            label: "Asked a question back",
            average: questionAvg,
            count: questionValues.length,
            unit: "%",
            trend: computeTrend(questionValues, "higher-better", PCT_TREND_THRESHOLD),
          }
        : null,
  };
}

export interface PitchTimingStats {
  /** Average seconds over (positive) or under (negative) budget. */
  avgDiffSec: number | null;
  avgDiffSecTrend: TrendDirection | null;
  /** Share of pitches landing within ~15% (min 5s) of their time budget. */
  onTargetRatePct: number | null;
  onTargetRatePctTrend: TrendDirection | null;
  count: number;
}

/** Pitch mode only — how close attempts land to their chosen time budget, on average. */
export function computePitchTimingStats(rows: FeedbackWithSession[]): PitchTimingStats {
  const validRows = rows.filter((r) => r.valid && r.mode === "pitch");
  const diffs: number[] = [];
  const onTargetFlags: number[] = [];

  for (const row of validRows) {
    const timing = computePitchTiming({ turns: row.turns, pitchTimeLimitSec: row.pitchTimeLimitSec });
    if (!timing) continue;
    diffs.push(timing.diffSec);
    const tolerance = Math.max(5, timing.targetSec * 0.15);
    onTargetFlags.push(Math.abs(timing.diffSec) <= tolerance ? 1 : 0);
  }

  if (diffs.length === 0) {
    return { avgDiffSec: null, avgDiffSecTrend: null, onTargetRatePct: null, onTargetRatePctTrend: null, count: 0 };
  }
  return {
    avgDiffSec: average(diffs),
    avgDiffSecTrend: computeTrend(diffs, { target: 0 }, SEC_TREND_THRESHOLD),
    onTargetRatePct: average(onTargetFlags)! * 100,
    onTargetRatePctTrend: computeTrend(
      onTargetFlags.map((f) => f * 100),
      "higher-better",
      PCT_TREND_THRESHOLD
    ),
    count: diffs.length,
  };
}

// Identity-style names for the top-scoring section — turns "your best
// section is Argumentation, 4.3/5" (a bare ranking entry) into something a
// person actually wants to read, per direct feedback that the ranking
// already on the page wasn't engaging on its own.
const SECTION_TITLES: Record<string, string> = {
  structure: "The Storyteller",
  delivery: "The Smooth Talker",
  content: "The Specific One",
  engagement: "The Engager",
  contextFit: "The Tailored Candidate",
  argumentation: "The Debater",
};

export interface StrengthSummary {
  title: string;
  headline: string;
  growthLine: string | null;
}

/**
 * Turns `stats.sectionAverages` (already computed, already sorted) into a
 * headline strength + a growth-area callout. Works against whatever scope
 * `stats` was computed with — pass mode-filtered stats to get "your best
 * skill in Debate," unfiltered stats for "your best skill overall" — so
 * this needs no extra scoping logic of its own.
 */
export function getStrengthSummary(stats: ProgressStats): StrengthSummary | null {
  const best = stats.sectionAverages[0];
  if (!best) return null;

  const title = SECTION_TITLES[best.key] ?? "The Practicer";
  const headline = `Your ${best.label} averages ${best.average.toFixed(1)}/5 — your strongest section.`;

  const worst = stats.sectionAverages[stats.sectionAverages.length - 1];
  const growthLine =
    worst && worst.key !== best.key
      ? `Biggest room to grow: ${worst.label}, averaging ${worst.average.toFixed(1)}/5.`
      : null;

  return { title, headline, growthLine };
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
