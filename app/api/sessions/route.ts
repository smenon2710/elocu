import { NextRequest, NextResponse } from "next/server";
import { getApiUserId, unauthorizedResponse } from "@/lib/auth";
import { randomUUID } from "crypto";
import { listSessions, saveSession } from "@/lib/store";
import { getNextInterviewerMessage } from "@/lib/conversation";
import { sanitizeDocumentRefs } from "@/lib/documents";
import {
  DEFAULT_PITCH_TIME_LIMIT_SEC,
  PITCH_TIME_LIMITS_SEC,
  type Session,
  type SessionMode,
} from "@/lib/types";

// LLM-backed: a Groq timeout falling back to OpenRouter can take ~90s (two
// 45s ceilings, lib/llm.ts) — set explicitly rather than relying on the
// host's default function timeout, which varies by platform and plan.
export const maxDuration = 120;

const VALID_MODES: SessionMode[] = ["interview", "conversation", "speech", "orator", "debate", "pitch"];

export async function GET() {
  const userId = await getApiUserId();
  if (!userId) return unauthorizedResponse();
  const sessions = await listSessions(userId);
  return NextResponse.json({ sessions });
}

export async function POST(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return unauthorizedResponse();
  const body = await req.json().catch(() => null);
  const mode: SessionMode = VALID_MODES.includes(body?.mode) ? body.mode : "conversation";
  const topic = typeof body?.topic === "string" ? body.topic.trim() : "";

  // Orator is the one mode where a blank topic is meaningful — the persona
  // invents an impromptu one. Every other mode needs the user's input.
  if (!topic && mode !== "orator") {
    return NextResponse.json({ error: "topic is required" }, { status: 400 });
  }
  const documentRefs = sanitizeDocumentRefs(body?.documentRefs);

  // Only pitch mode has a time budget; anything else stays null rather than
  // silently accepting a stray value from the client for a mode it doesn't apply to.
  const pitchTimeLimitSec: number | null =
    mode === "pitch"
      ? PITCH_TIME_LIMITS_SEC.includes(body?.pitchTimeLimitSec)
        ? body.pitchTimeLimitSec
        : DEFAULT_PITCH_TIME_LIMIT_SEC
      : null;

  const goalLabel: string | null =
    typeof body?.goalLabel === "string" && body.goalLabel.trim() ? body.goalLabel.trim().slice(0, 100) : null;

  const session: Session = {
    id: randomUUID(),
    userId,
    createdAt: Date.now(),
    endedAt: null,
    mode,
    topic,
    documentsUsed: documentRefs.length > 0,
    documentRefs,
    turns: [],
    pitchTimeLimitSec,
    goalLabel,
  };

  let openingError: string | null = null;
  try {
    const opening = await getNextInterviewerMessage(session);
    const now = Date.now();
    session.turns.push({ speaker: "ai", text: opening, audioRef: null, startTs: now, endTs: now });
  } catch (err) {
    openingError = err instanceof Error ? err.message : "Failed to reach the AI provider";
  }

  await saveSession(session);

  return NextResponse.json({ session, error: openingError });
}
