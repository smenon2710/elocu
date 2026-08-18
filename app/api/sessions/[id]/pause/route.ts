import { NextRequest, NextResponse } from "next/server";
import { getFeedback, getSession, saveFeedback } from "@/lib/store";
import { emptyTranscriptFeedback, gradeSession } from "@/lib/grading";

/**
 * Grades the session's current transcript without ending it — unlike /end,
 * this never sets `endedAt`, so the session stays fully resumable (more
 * turns can still be posted to it). Regrades against whatever the
 * transcript looks like right now whenever it's actually changed since the
 * last pause, but skips the LLM call entirely and returns the cached
 * feedback if nothing has — a real, observed cost saver, not a
 * hypothetical one: nothing stops a user from hitting "Pause & get
 * feedback," going back, and pausing again with zero new turns (or a
 * double-click racing itself). `Feedback.gradedTurnCount` (lib/types.ts) is
 * the marker that makes this check possible without a separate versioning
 * scheme. Deliberately does NOT skip when the cached feedback's own
 * `gradingFailed` is true — a failure is often transient (a provider
 * hiccup), so a repeat pause with no new turns should still get a real
 * retry rather than being stuck serving a stale "grading unavailable"
 * placeholder until the user happens to add another turn.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }
  if (session.endedAt) {
    return NextResponse.json({ error: "session already ended" }, { status: 400 });
  }

  const existingFeedback = await getFeedback(id);
  if (existingFeedback && !existingFeedback.gradingFailed && existingFeedback.gradedTurnCount === session.turns.length) {
    return NextResponse.json({ feedback: existingFeedback });
  }

  const hasUserTurns = session.turns.some((t) => t.speaker === "user");
  const feedback = hasUserTurns ? await gradeSession(session) : emptyTranscriptFeedback(session);
  await saveFeedback(feedback);

  return NextResponse.json({ feedback });
}
