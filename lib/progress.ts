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

/**
 * Aggregates raw per-session feedback into the numbers the progress
 * dashboard shows. Only `valid` rows (not gradingFailed, not emptyTranscript)
 * feed the averages — placeholder scores from a failed grading pass would
 * silently skew them otherwise. `totalCompleted` still counts everything, so
 * the page can be honest about how many were excluded and why.
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
