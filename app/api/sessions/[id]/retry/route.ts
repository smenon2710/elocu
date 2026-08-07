import { NextRequest, NextResponse } from "next/server";
import { getSession, saveSession } from "@/lib/store";
import { getNextInterviewerMessage, shouldAutoEnd } from "@/lib/conversation";

/**
 * Completes an interrupted turn on resume: if the session was closed after
 * the user's turn was saved but before the AI replied (e.g. the LLM call
 * failed mid-flight), this fetches the missing reply without requiring the
 * user to repeat themselves. No-op if the last turn already has a reply.
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

  const lastTurn = session.turns[session.turns.length - 1];
  if (!lastTurn || lastTurn.speaker !== "user") {
    return NextResponse.json({ session, error: null, shouldAutoEnd: shouldAutoEnd(session) });
  }

  let replyError: string | null = null;
  try {
    const reply = await getNextInterviewerMessage(session);
    const now = Date.now();
    session.turns.push({ speaker: "ai", text: reply, audioRef: null, startTs: now, endTs: now });
    await saveSession(session);
  } catch (err) {
    replyError = err instanceof Error ? err.message : "Failed to reach OpenRouter";
  }

  return NextResponse.json({ session, error: replyError, shouldAutoEnd: shouldAutoEnd(session) });
}
