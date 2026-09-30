import { NextRequest, NextResponse } from "next/server";
import { getApiUserId, unauthorizedResponse } from "@/lib/auth";
import { consumeLlmQuota, rateLimitedResponse } from "@/lib/rateLimit";
import { getSession, saveSession } from "@/lib/store";
import { getNextInterviewerMessage, shouldAutoEnd } from "@/lib/conversation";
import { stripNul } from "@/lib/documents";

// LLM-backed: a Groq timeout falling back to OpenRouter can take ~90s (two
// 45s ceilings, lib/llm.ts) — set explicitly rather than relying on the
// host's default function timeout, which varies by platform and plan.
export const maxDuration = 120;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userId = await getApiUserId();
  if (!userId) return unauthorizedResponse();
  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? stripNul(body.text).trim() : "";
  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const session = await getSession(userId, id);
  if (!session) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }
  if (session.endedAt) {
    return NextResponse.json({ error: "session already ended" }, { status: 400 });
  }

  // The client (app/(app)/session/[id]/page.tsx) tracks how long the user
  // actually had the floor — from the moment it became their turn (mic tap,
  // or the previous AI line finishing) to this submit — and sends it as
  // elapsedMs. Without it, startTs/endTs would both just be "now," which is
  // exactly the bug that made pacing feedback impossible to ground in real
  // numbers (see lib/grading.ts's pitch timing block). Clamped to a sane
  // ceiling (30 min) and floored at 0 so a clock skew or stale ref can't
  // produce a nonsensical duration.
  // Before the user's turn is recorded: a rate-limited turn is rejected
  // whole (the client puts the text back), never saved without a reply.
  const quota = await consumeLlmQuota(userId);
  if (!quota.ok) return rateLimitedResponse(quota);

  const rawElapsedMs = typeof body?.elapsedMs === "number" && Number.isFinite(body.elapsedMs) ? body.elapsedMs : 0;
  const elapsedMs = Math.min(Math.max(rawElapsedMs, 0), 30 * 60 * 1000);

  const userTs = Date.now();
  session.turns.push({ speaker: "user", text, audioRef: null, startTs: userTs - elapsedMs, endTs: userTs });

  let replyError: string | null = null;
  try {
    const reply = await getNextInterviewerMessage(session);
    const aiTs = Date.now();
    session.turns.push({ speaker: "ai", text: reply, audioRef: null, startTs: aiTs, endTs: aiTs });
  } catch (err) {
    replyError = err instanceof Error ? err.message : "Failed to reach the AI provider";
  }

  await saveSession(session);

  return NextResponse.json({
    session,
    error: replyError,
    shouldAutoEnd: shouldAutoEnd(session),
  });
}
