export type Speaker = "user" | "ai";

export interface TranscriptTurn {
  speaker: Speaker;
  text: string;
  audioRef: null; // Web Speech API exposes no recording blob; field kept for schema parity
  startTs: number;
  endTs: number;
}

export type DocumentKind = "resume" | "job_description" | "question_list" | "other";

export interface DocumentRef {
  id: string;
  kind: DocumentKind;
  filename: string;
  text: string;
}

export type SessionMode = "interview" | "conversation" | "speech" | "orator" | "debate";

export interface Session {
  id: string;
  userId: string;
  createdAt: number;
  endedAt: number | null;
  mode: SessionMode;
  topic: string;
  documentsUsed: boolean;
  documentRefs: DocumentRef[];
  turns: TranscriptTurn[];
}

export interface QuotedMoment {
  text: string;
  turnIndex: number;
}

export interface FeedbackSection {
  score: number;
  quotedMoment: QuotedMoment | null;
  fix: string;
}

export interface FeedbackSections {
  structure: FeedbackSection;
  delivery: FeedbackSection;
  content: FeedbackSection;
  engagement: FeedbackSection;
  contextFit?: FeedbackSection;
  argumentation?: FeedbackSection;
}

export interface Feedback {
  sessionId: string;
  generatedAt: number;
  sections: FeedbackSections;
  gradingFailed?: boolean;
  /** True when the session ended with no user turns at all — nothing to grade, not a failure. */
  emptyTranscript?: boolean;
}

export const LOCAL_USER_ID = "local-user";

// Speech/Orator are single-round by design: one AI prompt, one (possibly
// long) user turn, one brief AI reaction, then auto-end. Interview/
// Conversation/Debate are open-ended back-and-forth up to this many turns.
export const MAX_EXCHANGES_BY_MODE: Record<SessionMode, number> = {
  interview: 12,
  conversation: 12,
  debate: 12,
  speech: 1,
  orator: 1,
};
