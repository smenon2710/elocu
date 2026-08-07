import { NextRequest, NextResponse } from "next/server";
import { getSession, saveFeedback } from "@/lib/store";
import { emptyTranscriptFeedback, gradeSession } from "@/lib/grading";

/**
 * Grades the session's current transcript without ending it — unlike /end,
 * this never sets `endedAt`, so the session stays fully resumable (more
 * turns can still be posted to it). Always regrades against whatever the
 * transcript looks like right now, since pausing again later after more
 * turns were added should reflect that, not return a stale snapshot.
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

  const hasUserTurns = session.turns.some((t) => t.speaker === "user");
  const feedback = hasUserTurns ? await gradeSession(session) : emptyTranscriptFeedback(session);
  await saveFeedback(feedback);

  return NextResponse.json({ feedback });
}
