import { NextRequest, NextResponse } from "next/server";
import { getSession, saveSession } from "@/lib/store";
import { getNextInterviewerMessage, shouldAutoEnd } from "@/lib/conversation";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }
  if (session.endedAt) {
    return NextResponse.json({ error: "session already ended" }, { status: 400 });
  }

  const userTs = Date.now();
  session.turns.push({ speaker: "user", text, audioRef: null, startTs: userTs, endTs: Date.now() });

  let replyError: string | null = null;
  try {
    const reply = await getNextInterviewerMessage(session);
    const aiTs = Date.now();
    session.turns.push({ speaker: "ai", text: reply, audioRef: null, startTs: aiTs, endTs: aiTs });
  } catch (err) {
    replyError = err instanceof Error ? err.message : "Failed to reach OpenRouter";
  }

  await saveSession(session);

  return NextResponse.json({
    session,
    error: replyError,
    shouldAutoEnd: shouldAutoEnd(session),
  });
}
