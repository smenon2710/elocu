import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { listSessions, saveSession } from "@/lib/store";
import { getNextInterviewerMessage } from "@/lib/conversation";
import { LOCAL_USER_ID, type DocumentRef, type Session, type SessionMode } from "@/lib/types";

const VALID_MODES: SessionMode[] = ["interview", "conversation", "speech", "orator", "debate"];

export async function GET() {
  const sessions = await listSessions();
  return NextResponse.json({ sessions });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const mode: SessionMode = VALID_MODES.includes(body?.mode) ? body.mode : "conversation";
  const topic = typeof body?.topic === "string" ? body.topic.trim() : "";

  // Orator is the one mode where a blank topic is meaningful — the persona
  // invents an impromptu one. Every other mode needs the user's input.
  if (!topic && mode !== "orator") {
    return NextResponse.json({ error: "topic is required" }, { status: 400 });
  }
  const documentRefs: DocumentRef[] = Array.isArray(body?.documentRefs) ? body.documentRefs : [];

  const session: Session = {
    id: randomUUID(),
    userId: LOCAL_USER_ID,
    createdAt: Date.now(),
    endedAt: null,
    mode,
    topic,
    documentsUsed: documentRefs.length > 0,
    documentRefs,
    turns: [],
  };

  let openingError: string | null = null;
  try {
    const opening = await getNextInterviewerMessage(session);
    const now = Date.now();
    session.turns.push({ speaker: "ai", text: opening, audioRef: null, startTs: now, endTs: now });
  } catch (err) {
    openingError = err instanceof Error ? err.message : "Failed to reach OpenRouter";
  }

  await saveSession(session);

  return NextResponse.json({ session, error: openingError });
}
