import { promises as fs } from "fs";
import path from "path";
import type { Session, SessionMode, Feedback, FeedbackSections } from "./types";

const SESSIONS_DIR = path.join(process.cwd(), "data", "sessions");

async function ensureDir() {
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
}

const sessionPath = (id: string) => path.join(SESSIONS_DIR, `${id}.json`);
const feedbackPath = (id: string) => path.join(SESSIONS_DIR, `${id}.feedback.json`);

export async function saveSession(session: Session): Promise<void> {
  await ensureDir();
  await fs.writeFile(sessionPath(session.id), JSON.stringify(session, null, 2));
}

export async function getSession(id: string): Promise<Session | null> {
  try {
    const raw = await fs.readFile(sessionPath(id), "utf-8");
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export async function saveFeedback(feedback: Feedback): Promise<void> {
  await ensureDir();
  await fs.writeFile(feedbackPath(feedback.sessionId), JSON.stringify(feedback, null, 2));
}

export async function getFeedback(sessionId: string): Promise<Feedback | null> {
  try {
    const raw = await fs.readFile(feedbackPath(sessionId), "utf-8");
    return JSON.parse(raw) as Feedback;
  } catch {
    return null;
  }
}

export interface SessionSummary {
  id: string;
  mode: SessionMode;
  topic: string;
  createdAt: number;
  endedAt: number | null;
  turnCount: number;
  documentsUsed: boolean;
  hasFeedback: boolean;
}

/**
 * All sessions (in-progress and completed), most recent first — backs the
 * persistent history sidebar. `hasFeedback` is derived from the same
 * directory listing (whether a {id}.feedback.json exists) so there's no
 * extra I/O per session beyond the one readdir.
 */
export async function listSessions(limit = 50): Promise<SessionSummary[]> {
  let files: string[];
  try {
    files = await fs.readdir(SESSIONS_DIR);
  } catch {
    return [];
  }

  const feedbackIds = new Set(
    files.filter((f) => f.endsWith(".feedback.json")).map((f) => f.slice(0, -".feedback.json".length))
  );
  const sessionFiles = files.filter((f) => f.endsWith(".json") && !f.endsWith(".feedback.json"));

  const sessions = await Promise.all(
    sessionFiles.map(async (f) => {
      try {
        const raw = await fs.readFile(path.join(SESSIONS_DIR, f), "utf-8");
        return JSON.parse(raw) as Session;
      } catch {
        return null;
      }
    })
  );

  return sessions
    .filter((s): s is Session => s !== null)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
    .map((s) => ({
      id: s.id,
      mode: s.mode,
      topic: s.topic,
      createdAt: s.createdAt,
      endedAt: s.endedAt,
      turnCount: s.turns.length,
      documentsUsed: s.documentsUsed,
      hasFeedback: feedbackIds.has(s.id),
    }));
}

export interface FeedbackWithSession {
  sessionId: string;
  mode: SessionMode;
  createdAt: number;
  sections: FeedbackSections;
  /** False if gradingFailed or emptyTranscript — placeholder scores that would skew averages. */
  valid: boolean;
}

/**
 * Every session that has feedback, oldest first — the raw material for the
 * progress dashboard. Reads each feedback file's matching session file
 * alongside it (for mode/createdAt) rather than requiring two separate
 * round trips per caller.
 */
export async function listAllFeedback(): Promise<FeedbackWithSession[]> {
  let files: string[];
  try {
    files = await fs.readdir(SESSIONS_DIR);
  } catch {
    return [];
  }

  const feedbackFiles = files.filter((f) => f.endsWith(".feedback.json"));
  const rows = await Promise.all(
    feedbackFiles.map(async (f): Promise<FeedbackWithSession | null> => {
      try {
        const sessionId = f.slice(0, -".feedback.json".length);
        const [fbRaw, sessionRaw] = await Promise.all([
          fs.readFile(path.join(SESSIONS_DIR, f), "utf-8"),
          fs.readFile(sessionPath(sessionId), "utf-8"),
        ]);
        const fb = JSON.parse(fbRaw) as Feedback;
        const session = JSON.parse(sessionRaw) as Session;
        return {
          sessionId,
          mode: session.mode,
          createdAt: session.createdAt,
          sections: fb.sections,
          valid: !fb.gradingFailed && !fb.emptyTranscript,
        };
      } catch {
        return null;
      }
    })
  );

  return rows
    .filter((r): r is FeedbackWithSession => r !== null)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function deleteSession(id: string): Promise<void> {
  await Promise.all([
    fs.unlink(sessionPath(id)).catch(() => {}),
    fs.unlink(feedbackPath(id)).catch(() => {}),
  ]);
}
