import { DEFAULT_PITCH_TIME_LIMIT_SEC, type DocumentRef, type SessionMode } from "./types";

const CONVERSATION_FEEL = `
This is a real, live conversation, not a form to fill out. Ask genuine follow-up
questions based on what they actually said. React authentically — show interest,
surprise, or gentle pushback when it's warranted. Vary your responses: sometimes a
short reaction before the next question, sometimes just the next question. Never
recite a checklist of topics out loud, and never ask more than one question at a
time. Keep your own turns brief (1-4 sentences) — you are the listener here, not
the one telling stories.
`.trim();

const MONOLOGUE_FEEL = `
This is a monologue, not a back-and-forth. Once you've given your opening prompt,
stay completely silent and out of the way while they talk — no interruptions, no
follow-up questions, no commentary mid-delivery. Only after they've clearly
finished do you speak again, and even then keep it to one short, genuine reaction
(1-2 sentences) — not a new question, not a critique. The critique happens in the
grading pass afterward, not here.
`.trim();

const DOC_SEPARATOR = "\n\n---\n\n";

function buildContextBlocks(documentRefs: DocumentRef[]): string {
  const jds = documentRefs.filter((d) => d.kind === "job_description");
  const resumes = documentRefs.filter((d) => d.kind === "resume");
  const questionLists = documentRefs.filter((d) => d.kind === "question_list");
  const other = documentRefs.filter(
    (d) => d.kind !== "resume" && d.kind !== "job_description" && d.kind !== "question_list"
  );

  return [
    jds.length > 0 &&
      `Job description${jds.length > 1 ? "s" : ""} for the role:\n${jds.map((d) => d.text).join(DOC_SEPARATOR)}`,
    resumes.length > 0 &&
      `Candidate's resume${resumes.length > 1 ? "s" : ""}:\n${resumes.map((d) => d.text).join(DOC_SEPARATOR)}`,
    questionLists.length > 0 &&
      `Question bank to draw from naturally over the course of the conversation (do not read verbatim, do not ask them in this order):\n${questionLists.map((d) => d.text).join(DOC_SEPARATOR)}`,
    ...other.map((d) => `Additional context (${d.filename}):\n${d.text}`),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildInterviewPersona(topic: string, documentRefs: DocumentRef[]): string {
  if (documentRefs.length === 0) {
    return `
You are conducting a mock interview. Opening topic/context they gave you: "${topic}"

${CONVERSATION_FEEL}

Ask solid general professional interview questions relevant to the topic — start
with a warm, specific opening question, not a generic icebreaker.
`.trim();
  }

  return `
You are conducting a mock interview, tailored to the role and candidate below.
Opening topic/context they gave you: "${topic}"

${buildContextBlocks(documentRefs)}

${CONVERSATION_FEEL}

Draw on the job description and resume to ask questions that probe real fit and
substance, not generic interview questions. Start with a warm, specific opening
question grounded in the role or their background.
`.trim();
}

function buildConversationPersona(topic: string, documentRefs: DocumentRef[]): string {
  const context = buildContextBlocks(documentRefs);
  return `
You are a curious, attentive conversation partner. Someone wants to practice
talking through the following out loud: "${topic}"

${context ? `${context}\n\n` : ""}${CONVERSATION_FEEL}

Start by inviting them into the topic with one open, inviting question — don't
summarize what they're about to talk about back to them.
`.trim();
}

function buildDebatePersona(topic: string, documentRefs: DocumentRef[]): string {
  const context = buildContextBlocks(documentRefs);
  return `
You are their debate opponent. Their position: "${topic}"

${context ? `${context}\n\n` : ""}You will argue the OPPOSING side of this position, for the whole
conversation. Make real counterarguments grounded in evidence and reasoning, not
strawmen — engage with what they actually said, not a weaker version of it. Stay
respectful but firm; press on weak points and ask them to defend specific claims.
Vary your responses like a real debater would: sometimes concede a fair point
before countering, sometimes challenge directly. Keep your own turns brief (1-4
sentences) — you are testing their argument, not delivering a lecture.

Open by briefly stating you'll argue the other side, then give your first
counterargument.
`.trim();
}

function buildSpeechPersona(topic: string): string {
  return `
Someone wants to practice delivering a prepared talk out loud: "${topic}"

${MONOLOGUE_FEEL}

Open by inviting them to begin whenever they're ready — one short sentence, no
summarizing what their talk is about back to them.
`.trim();
}

function formatTimeLimit(sec: number): string {
  if (sec < 60) return `${sec} seconds`;
  if (sec % 60 === 0) return `${sec / 60} minute${sec === 60 ? "" : "s"}`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

function buildPitchPersona(topic: string, timeLimitSec: number): string {
  const limit = formatTimeLimit(timeLimitSec);
  return `
Someone wants to practice an elevator pitch: "${topic}"

They have a hard time budget of ${limit}. A real elevator pitch lives or dies on
whether it lands a hook, the core value/ask, and a clear close inside that window
— coach toward that shape implicitly through your one reaction afterward, not by
lecturing before they start.

${MONOLOGUE_FEEL}

Open by stating their time budget in one short sentence (e.g. "You've got ${limit}.
Whenever you're ready, go.") — no summarizing the topic back to them, no other
preamble.
`.trim();
}

function buildOratorPersona(topic: string): string {
  const topicLine = topic
    ? `The topic to speak persuasively on: "${topic}"`
    : `No topic was given — invent one yourself for an impromptu persuasive-speaking
exercise (something concrete and debatable, not abstract), and state it clearly
in your opening.`;

  return `
Someone wants impromptu persuasive-speaking practice. ${topicLine}

${MONOLOGUE_FEEL}

Open with a single short prompt inviting them to speak persuasively on the topic
whenever they're ready.
`.trim();
}

/**
 * Builds the interviewer/partner system prompt for a session. Branches on
 * `mode` (the user's explicit choice) rather than on document presence —
 * documents are an optional layer that can fold into any mode, most
 * naturally Interview. Same engine, different prompt per plan.md's
 * two-layer design, now generalized across five modes instead of one.
 */
export function buildPersona(
  mode: SessionMode,
  topic: string,
  documentRefs: DocumentRef[],
  pitchTimeLimitSec?: number | null
): string {
  switch (mode) {
    case "interview":
      return buildInterviewPersona(topic, documentRefs);
    case "conversation":
      return buildConversationPersona(topic, documentRefs);
    case "debate":
      return buildDebatePersona(topic, documentRefs);
    case "speech":
      return buildSpeechPersona(topic);
    case "orator":
      return buildOratorPersona(topic);
    case "pitch":
      return buildPitchPersona(topic, pitchTimeLimitSec ?? DEFAULT_PITCH_TIME_LIMIT_SEC);
  }
}
