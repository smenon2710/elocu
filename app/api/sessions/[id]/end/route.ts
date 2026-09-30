import { NextRequest, NextResponse } from "next/server";
import { getFeedback, getSession, saveFeedback, saveSession } from "@/lib/store";
import { emptyTranscriptFeedback, gradeSession } from "@/lib/grading";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  // Idempotent: repeat calls (auto-end racing the manual "End session"
  // button, a retried fetch, revisiting an already-ended session) return the
  // cached feedback instead of paying for another grading LLM call. But
  // cached feedback can come from an earlier /pause — if turns were added
  // after that pause (`gradedTurnCount` behind), or the pause's grading
  // failed, ending is the last chance to grade the full transcript, so it
  // regrades. Feedback predating `gradedTurnCount` is treated as current,
  // since there's no way to tell and revisits shouldn't spend a call.
  const existingFeedback = await getFeedback(id);
  if (existingFeedback) {
    const staleFromPause =
      !session.endedAt &&
      (existingFeedback.gradingFailed ||
        (existingFeedback.gradedTurnCount !== undefined &&
          existingFeedback.gradedTurnCount !== session.turns.length));
    if (!staleFromPause) {
      return NextResponse.json({ feedback: existingFeedback });
    }
  }

  if (!session.endedAt) {
    session.endedAt = Date.now();
    await saveSession(session);
  }

  // Nothing to grade if the session ended before any answer was given (e.g.
  // ended right after the opening question) — skip the LLM call entirely
  // rather than silently producing meaningless placeholder scores.
  const hasUserTurns = session.turns.some((t) => t.speaker === "user");
  const feedback = hasUserTurns ? await gradeSession(session) : emptyTranscriptFeedback(session);
  await saveFeedback(feedback);

  return NextResponse.json({ feedback });
}
