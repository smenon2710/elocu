import { NextRequest, NextResponse } from "next/server";
import { getFeedback, getSession, saveFeedback } from "@/lib/store";
import { gradeSession } from "@/lib/grading";

/**
 * Re-runs the grading LLM call for a session whose last grading pass failed
 * (a parse/validation failure, or a provider outage that outlasted the
 * fallback chain). Unlike /end — which is idempotent and never regrades once
 * any feedback file exists — this deliberately overwrites, but only when the
 * cached feedback is actually a `gradingFailed` placeholder, so a good result
 * can't be spent on another call by accident. Works on already-ended
 * sessions, which /pause refuses to touch. No-op (returns the existing
 * feedback) when there's nothing to retry.
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

  const existing = await getFeedback(id);
  // Only retry a real failure — never regrade a session that was never graded,
  // one whose last pass succeeded, or an empty transcript (nothing to grade).
  if (!existing || !existing.gradingFailed) {
    return NextResponse.json({ feedback: existing });
  }
  if (!session.turns.some((t) => t.speaker === "user")) {
    return NextResponse.json({ feedback: existing });
  }

  const feedback = await gradeSession(session);
  await saveFeedback(feedback);
  return NextResponse.json({ feedback });
}
