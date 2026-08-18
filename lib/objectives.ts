import { randomUUID } from "crypto";
import { computeContentMetrics } from "./contentMetrics";
import { computeConversationMetrics } from "./conversationMetrics";
import { computeDeliveryMetrics } from "./deliveryMetrics";
import { computePitchTiming } from "./pitchMetrics";
import { computeTrend, MODE_LABELS, type TrendDirection } from "./progress";
import type { FeedbackWithSession } from "./store";
import type { FeedbackSections, Objective, ObjectiveMetric, ObjectiveTarget, SessionMode } from "./types";

type Goodness = "higher-better" | "lower-better" | "target";

export interface MetricMeta {
  unit: "score" | "wpm" | "%";
  goodness: Goodness;
  /** Some metrics only ever apply within one mode, regardless of the objective's own `mode` field. */
  lockedMode?: SessionMode;
  /** Which grading section's real, already-generated LLM fix to surface as advice for this metric. */
  adviceSection: keyof FeedbackSections;
}

// Exported so lib/objectiveSuggestion.ts can reuse the same lockedMode/unit
// facts when validating LLM-suggested targets — one source of truth for
// which metrics only ever apply within one mode, rather than a second copy
// that could drift.
export const METRIC_META: Record<ObjectiveMetric, MetricMeta> = {
  overallScore: { unit: "score", goodness: "higher-better", adviceSection: "structure" },
  sectionScore: { unit: "score", goodness: "higher-better", adviceSection: "structure" },
  wpm: { unit: "wpm", goodness: "target", adviceSection: "delivery" },
  fillerPct: { unit: "%", goodness: "lower-better", adviceSection: "delivery" },
  hedgePct: { unit: "%", goodness: "lower-better", adviceSection: "delivery" },
  ttrPct: { unit: "%", goodness: "higher-better", adviceSection: "content" },
  talkTimePct: { unit: "%", goodness: "target", lockedMode: "conversation", adviceSection: "engagement" },
  questionRatePct: { unit: "%", goodness: "higher-better", lockedMode: "conversation", adviceSection: "engagement" },
  pitchOnTargetPct: { unit: "%", goodness: "higher-better", lockedMode: "pitch", adviceSection: "delivery" },
};

function average(values: number[]): number | null {
  return values.length > 0 ? values.reduce((s, n) => s + n, 0) / values.length : null;
}

function sessionAverage(sections: FeedbackSections): number {
  const scores = Object.values(sections)
    .filter((s): s is { score: number } => !!s)
    .map((s) => s.score);
  return scores.reduce((sum, n) => sum + n, 0) / scores.length;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * How close `current` is to `target`, as a 0-100 "progress" figure — the
 * shape depends on which direction counts as improvement. "target" (wpm,
 * talk-time) rewards closeness in either direction, matching the same
 * distance-based framing lib/progress.ts's trend arrows already use for
 * these two metrics, just against a user-chosen number instead of a fixed
 * research target.
 */
function progressPctFor(current: number, target: number, goodness: Goodness): number {
  if (goodness === "higher-better") {
    return target > 0 ? clamp01(current / target) * 100 : 100;
  }
  if (goodness === "lower-better") {
    if (current <= target) return 100;
    return current > 0 ? clamp01(target / current) * 100 : 0;
  }
  return target !== 0 ? clamp01(1 - Math.abs(current - target) / Math.abs(target)) * 100 : 100;
}

function seriesForMetric(
  metric: ObjectiveMetric,
  sectionKey: keyof FeedbackSections | null,
  rows: FeedbackWithSession[]
): number[] {
  switch (metric) {
    case "overallScore":
      return rows.map((r) => sessionAverage(r.sections));
    case "sectionScore":
      if (!sectionKey) return [];
      return rows.map((r) => r.sections[sectionKey]?.score).filter((v): v is number => typeof v === "number");
    case "wpm":
    case "fillerPct":
    case "hedgePct": {
      const values: number[] = [];
      for (const r of rows) {
        const d = computeDeliveryMetrics({ turns: r.turns });
        const v = metric === "wpm" ? d.wpm : metric === "fillerPct" ? d.fillerPct : d.hedgePct;
        if (v !== null) values.push(v);
      }
      return values;
    }
    case "ttrPct": {
      const values: number[] = [];
      for (const r of rows) {
        const { ttrPct } = computeContentMetrics({ turns: r.turns });
        if (ttrPct !== null) values.push(ttrPct);
      }
      return values;
    }
    case "talkTimePct":
    case "questionRatePct": {
      const values: number[] = [];
      for (const r of rows.filter((row) => row.mode === "conversation")) {
        const c = computeConversationMetrics({ turns: r.turns });
        const v = metric === "talkTimePct" ? c.talkTimePct : c.questionRatePct;
        if (v !== null) values.push(v);
      }
      return values;
    }
    case "pitchOnTargetPct": {
      const flags: number[] = [];
      for (const r of rows.filter((row) => row.mode === "pitch")) {
        const t = computePitchTiming({ turns: r.turns, pitchTimeLimitSec: r.pitchTimeLimitSec });
        if (!t) continue;
        const tolerance = Math.max(5, t.targetSec * 0.15);
        flags.push(Math.abs(t.diffSec) <= tolerance ? 1 : 0);
      }
      return flags.map((f) => f * 100);
    }
  }
}

/** Most recent fix for a section, walking backwards since `rows` is oldest-first (lib/store.ts's listAllFeedback). */
function latestFixFor(sectionKey: keyof FeedbackSections, rows: FeedbackWithSession[]): string | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const section = rows[i].sections[sectionKey];
    if (section) return section.fix;
  }
  return null;
}

/**
 * Concrete, on-topic advice for the 7 metrics with real countable data,
 * computed directly from the single most recent qualifying session — never
 * an LLM call, never a whole-section fix that might be about something
 * adjacent but different (a real bug found in practice: reusing the
 * Delivery section's fix for a "Hedging words" target surfaced advice about
 * *pauses*, since that's what the LLM happened to write about in that
 * session's Delivery section, not hedging specifically). `overallScore` and
 * `sectionScore` are the two metrics NOT handled here — a holistic score
 * genuinely has no better source than the real LLM fix written for exactly
 * that section, so those keep using `latestFixFor` in computeTargetProgress.
 */
function deterministicAdviceFor(metric: ObjectiveMetric, mostRecent: FeedbackWithSession): string | null {
  const modeLabel = MODE_LABELS[mostRecent.mode];

  switch (metric) {
    case "fillerPct": {
      const { fillerCount, fillerPct, fillerBreakdown, totalWords } = computeDeliveryMetrics({ turns: mostRecent.turns });
      if (fillerPct === null) return null;
      if (fillerCount === 0) return `No filler words caught in your last ${modeLabel} session — keep this up.`;
      const top = fillerBreakdown.slice(0, 2).map(([w, c]) => `"${w}" (${c}x)`).join(" and ");
      return `In your last ${modeLabel} session you used ${top} — ${fillerCount} filler words across ${totalWords} words (${fillerPct.toFixed(1)}%). Cut those specific words first.`;
    }
    case "hedgePct": {
      const { hedgeCount, hedgePct, hedgeBreakdown, totalWords } = computeDeliveryMetrics({ turns: mostRecent.turns });
      if (hedgePct === null) return null;
      if (hedgeCount === 0) return `No hedging words caught in your last ${modeLabel} session — keep this up.`;
      const top = hedgeBreakdown.slice(0, 2).map(([w, c]) => `"${w}" (${c}x)`).join(" and ");
      return `In your last ${modeLabel} session you used ${top} — ${hedgeCount} hedging words across ${totalWords} words (${hedgePct.toFixed(1)}%). Replace those with direct statements.`;
    }
    case "wpm": {
      const { wpm } = computeDeliveryMetrics({ turns: mostRecent.turns });
      if (wpm === null) return null;
      if (wpm > 165) return `You spoke at ~${wpm} wpm in your last ${modeLabel} session — noticeably fast. Slow down, especially in your opening line.`;
      if (wpm < 130) return `You spoke at ~${wpm} wpm in your last ${modeLabel} session — noticeably slow. Pick up the pace through the middle of your answer.`;
      return `You spoke at ~${wpm} wpm in your last ${modeLabel} session — already a solid pace, keep it steady.`;
    }
    case "ttrPct": {
      const { ttrPct } = computeContentMetrics({ turns: mostRecent.turns });
      if (ttrPct === null) return null;
      return `Your last ${modeLabel} session's vocabulary diversity was ${ttrPct.toFixed(0)}% — watch for repeated phrasing and swap in different words for ideas you restate.`;
    }
    case "talkTimePct": {
      const { talkTimePct } = computeConversationMetrics({ turns: mostRecent.turns });
      if (talkTimePct === null) return null;
      if (talkTimePct > 55) return `You accounted for ${talkTimePct.toFixed(0)}% of the words spoken last time — leave more room by asking a follow-up question instead of continuing.`;
      if (talkTimePct < 40) return `You accounted for only ${talkTimePct.toFixed(0)}% of the words spoken last time — offer more of your own view before turning it back to a question.`;
      return `You accounted for ${talkTimePct.toFixed(0)}% of the words spoken last time — already a healthy balance, keep it there.`;
    }
    case "questionRatePct": {
      const { questionRatePct } = computeConversationMetrics({ turns: mostRecent.turns });
      if (questionRatePct === null) return null;
      if (questionRatePct < 30) return `You asked a question back in only ${questionRatePct.toFixed(0)}% of your turns last time — end more of your turns with a genuine question.`;
      return `You asked a question back in ${questionRatePct.toFixed(0)}% of your turns last time — keep doing that.`;
    }
    case "pitchOnTargetPct": {
      const timing = computePitchTiming({ turns: mostRecent.turns, pitchTimeLimitSec: mostRecent.pitchTimeLimitSec });
      if (!timing) return null;
      if (timing.diffSec > 0) return `Your last pitch ran ${timing.diffSec}s over its ${timing.targetSec}s budget — cut content from the middle, not the close.`;
      if (timing.diffSec < 0) return `Your last pitch finished ${-timing.diffSec}s under its ${timing.targetSec}s budget — you likely have room to add a concrete example.`;
      return `Your last pitch landed right on its ${timing.targetSec}s budget — repeat that pacing.`;
    }
    default:
      return null;
  }
}

export const VALID_METRICS = Object.keys(METRIC_META) as ObjectiveMetric[];
export const VALID_MODES: SessionMode[] = ["interview", "conversation", "speech", "orator", "debate", "pitch"];
export const VALID_SECTION_KEYS: (keyof FeedbackSections)[] = [
  "structure",
  "delivery",
  "content",
  "engagement",
  "contextFit",
  "argumentation",
];

// Sane bounds per unit — guards against a wildly-off target (a typo, or a
// hallucinated LLM suggestion) the same way lib/grading.ts clamps returned
// scores rather than trusting them verbatim. Applied to every target
// regardless of whether it came from the manual form or a suggestion.
const VALUE_BOUNDS: Record<"score" | "wpm" | "%", [number, number]> = {
  score: [1, 5],
  wpm: [60, 260],
  "%": [0, 100],
};

export function clampTargetValue(metric: ObjectiveMetric, value: number): number {
  const [min, max] = VALUE_BOUNDS[METRIC_META[metric].unit];
  return Math.min(max, Math.max(min, value));
}

/**
 * Validates one raw target payload (from the create/edit API routes or an
 * applied LLM suggestion) into a real ObjectiveTarget — reuses an existing
 * id when editing, assigns a new one otherwise. Returns null on anything
 * malformed rather than trusting client input verbatim.
 */
export function parseObjectiveTarget(raw: unknown): ObjectiveTarget | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  if (typeof r.metric !== "string" || !VALID_METRICS.includes(r.metric as ObjectiveMetric)) return null;
  const metric = r.metric as ObjectiveMetric;
  const meta = METRIC_META[metric];

  let sectionKey: keyof FeedbackSections | null = null;
  if (metric === "sectionScore") {
    if (typeof r.sectionKey !== "string" || !VALID_SECTION_KEYS.includes(r.sectionKey as keyof FeedbackSections)) return null;
    sectionKey = r.sectionKey as keyof FeedbackSections;
  }

  // Locked-mode metrics ignore whatever was passed and use the real
  // constraint instead.
  const mode: SessionMode | null =
    meta.lockedMode ?? (typeof r.mode === "string" && VALID_MODES.includes(r.mode as SessionMode) ? (r.mode as SessionMode) : null);

  if (typeof r.targetValue !== "number" || !Number.isFinite(r.targetValue)) return null;

  const id = typeof r.id === "string" && r.id ? r.id : randomUUID();

  return { id, metric, mode, sectionKey, targetValue: clampTargetValue(metric, r.targetValue) };
}

function weakestSectionOf(sections: FeedbackSections): keyof FeedbackSections | null {
  const entries = Object.entries(sections) as [keyof FeedbackSections, { score: number } | undefined][];
  const present = entries.filter((e): e is [keyof FeedbackSections, { score: number }] => !!e[1]);
  if (present.length === 0) return null;
  return present.reduce((min, cur) => (cur[1].score < min[1].score ? cur : min))[0];
}

export interface ObjectiveTargetProgress {
  target: ObjectiveTarget;
  currentValue: number | null;
  progressPct: number | null;
  sampleCount: number;
  trend: TrendDirection | null;
  /** A real, already-generated grading fix — never fabricated coaching text. */
  advice: string | null;
  unit: "score" | "wpm" | "%";
}

export interface ObjectiveProgress {
  /** One entry per `objective.targets`, same order, computed independently of each other. */
  targets: ObjectiveTargetProgress[];
  /** Only populated when `targets` is empty — a pure free-text aspiration's data-grounded nudge. */
  aspiration: { sampleCount: number; advice: string | null } | null;
}

function computeTargetProgress(target: ObjectiveTarget, validRows: FeedbackWithSession[]): ObjectiveTargetProgress {
  const meta = METRIC_META[target.metric];
  const effectiveMode = meta.lockedMode ?? target.mode ?? null;
  const scoped = effectiveMode ? validRows.filter((r) => r.mode === effectiveMode) : validRows;

  const series = seriesForMetric(target.metric, target.sectionKey, scoped);
  const currentValue = average(series);

  if (currentValue === null) {
    return { target, currentValue: null, progressPct: null, sampleCount: series.length, trend: null, advice: null, unit: meta.unit };
  }

  const progressPct = progressPctFor(currentValue, target.targetValue, meta.goodness);
  const trendGoodness = meta.goodness === "target" ? { target: target.targetValue } : meta.goodness;
  const threshold = meta.unit === "score" ? 0.15 : meta.unit === "wpm" ? 5 : 3;
  const trend = computeTrend(series, trendGoodness, threshold);

  const mostRecent = scoped[scoped.length - 1];
  const advice =
    target.metric === "overallScore" || target.metric === "sectionScore"
      ? latestFixFor(target.metric === "sectionScore" && target.sectionKey ? target.sectionKey : meta.adviceSection, scoped)
      : deterministicAdviceFor(target.metric, mostRecent);

  return { target, currentValue, progressPct, sampleCount: series.length, trend, advice, unit: meta.unit };
}

/**
 * Progress toward one Objective, computed over every valid graded session —
 * never a single session, per the explicit call that per-session feedback
 * isn't the right place for this (the app's existing feedback page stays
 * untouched). Each of `objective.targets` is scored independently so they
 * can be added, edited, or removed one at a time without recomputing the
 * others. `advice` on each is never a new LLM call: for `overallScore`/
 * `sectionScore` it reuses the real, most-recently-generated grading fix for
 * that exact section; for every other metric (pace, filler/hedge words,
 * vocabulary, talk-time, question-rate, pitch timing) it's computed
 * deterministically from the real counted data in the most recent
 * qualifying session (`deterministicAdviceFor`) so it's always specifically
 * about the metric being tracked, not a loosely-related whole-section fix.
 */
export function computeObjectiveProgress(objective: Objective, allRows: FeedbackWithSession[]): ObjectiveProgress {
  const validRows = allRows.filter((r) => r.valid);

  if (objective.targets.length === 0) {
    if (validRows.length === 0) {
      return { targets: [], aspiration: { sampleCount: 0, advice: null } };
    }
    const latest = validRows[validRows.length - 1];
    const weakestKey = weakestSectionOf(latest.sections);
    const advice = weakestKey ? latest.sections[weakestKey]?.fix ?? null : null;
    return { targets: [], aspiration: { sampleCount: validRows.length, advice } };
  }

  return { targets: objective.targets.map((t) => computeTargetProgress(t, validRows)), aspiration: null };
}
