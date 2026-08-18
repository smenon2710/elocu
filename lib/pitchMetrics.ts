import type { TranscriptTurn } from "./types";

export interface PitchTimingResult {
  actualSec: number;
  targetSec: number;
  /** actualSec - targetSec: positive = ran over, negative = finished under. */
  diffSec: number;
}

/**
 * Target vs. actual delivery time for a pitch-mode session's single user
 * turn, from real startTs/endTs (see app/api/sessions/[id]/messages/route.ts).
 * Shared by the feedback page's per-session display and the insights page's
 * pitch-mode aggregate (average seconds over/under budget).
 */
export function computePitchTiming(session: {
  turns: TranscriptTurn[];
  pitchTimeLimitSec: number | null;
}): PitchTimingResult | null {
  if (!session.pitchTimeLimitSec) return null;
  const turn = session.turns.find((t) => t.speaker === "user");
  if (!turn) return null;

  const actualSec = Math.max(0, Math.round((turn.endTs - turn.startTs) / 1000));
  const targetSec = session.pitchTimeLimitSec;
  return { actualSec, targetSec, diffSec: actualSec - targetSec };
}
