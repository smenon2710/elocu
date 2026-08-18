import type { ObjectiveMetric, SessionMode } from "@/lib/types";

export const SECTION_OPTIONS: { key: string; label: string }[] = [
  { key: "structure", label: "Structure" },
  { key: "delivery", label: "Delivery" },
  { key: "content", label: "Content" },
  { key: "engagement", label: "Engagement" },
  { key: "contextFit", label: "Context Fit" },
  { key: "argumentation", label: "Argumentation" },
];

export const MODE_OPTIONS: { key: SessionMode; label: string }[] = [
  { key: "interview", label: "Interview" },
  { key: "conversation", label: "Conversation" },
  { key: "speech", label: "Speech" },
  { key: "orator", label: "Orator" },
  { key: "debate", label: "Debate" },
  { key: "pitch", label: "Pitch" },
];

export interface MetricOption {
  key: ObjectiveMetric;
  label: string;
  needsSection?: boolean;
  lockedMode?: SessionMode;
  targetHint: string;
  defaultTarget: number;
}

// Single source of truth for both the goal-creation form and the inline
// target editor on an existing goal's card — picking a target's shape
// (which metrics need a section, which are mode-locked, sensible defaults)
// only needs to be right in one place.
export const METRIC_OPTIONS: MetricOption[] = [
  { key: "overallScore", label: "Overall score", targetHint: "out of 5", defaultTarget: 4 },
  { key: "sectionScore", label: "A specific skill", needsSection: true, targetHint: "out of 5", defaultTarget: 4 },
  { key: "wpm", label: "Speaking pace (wpm)", targetHint: "words/min, e.g. 150", defaultTarget: 150 },
  { key: "fillerPct", label: "Filler words (%)", targetHint: "lower is better, e.g. 3", defaultTarget: 3 },
  { key: "hedgePct", label: "Hedging words (%)", targetHint: "lower is better, e.g. 3", defaultTarget: 3 },
  { key: "ttrPct", label: "Vocabulary diversity (%)", targetHint: "e.g. 55", defaultTarget: 55 },
  { key: "talkTimePct", label: "Talk time in Conversation (%)", lockedMode: "conversation", targetHint: "aim ~40-55, e.g. 47", defaultTarget: 47 },
  {
    key: "questionRatePct",
    label: "Asking a question back, in Conversation (%)",
    lockedMode: "conversation",
    targetHint: "e.g. 40",
    defaultTarget: 40,
  },
  { key: "pitchOnTargetPct", label: "Landing Pitch on time (%)", lockedMode: "pitch", targetHint: "e.g. 70", defaultTarget: 70 },
];

export function metricOption(key: ObjectiveMetric): MetricOption {
  return METRIC_OPTIONS.find((m) => m.key === key) ?? METRIC_OPTIONS[0];
}
