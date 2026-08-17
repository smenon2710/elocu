import { chatCompletion, type ChatMessage, type ModelChoice } from "./llm";
import { buildPersona } from "./persona";
import { MAX_EXCHANGES_BY_MODE, type Session } from "./types";

const KICKOFF_MESSAGE = "(The session is starting now. Begin the conversation.)";

// Groq primary: this is the live, latency-sensitive path the user waits on,
// and speed via custom inference hardware is Groq's whole value proposition.
// llama-3.1-8b-instant (the model this used to point to) was fully removed
// from Groq's catalog at some point after §13 — every call was 404ing with
// model_not_found (see plan.md §22). Re-benchmarked live against Groq's
// current /openai/v1/models list: openai/gpt-oss-20b was the fastest
// (~0.3s), kept its reasoning in a separate `reasoning` response field
// rather than leaking a <think> block into `content` (qwen/qwen3.6-27b did
// exactly that — same disqualifying pattern §15 ruled out other "thinking"
// models for), and followed the persona instructions with the most natural,
// least stilted tone of what was tested (allam-2-7b was a fully reliable
// alternative but noticeably more formal/corporate-sounding, which works
// against "genuine conversation, not a form"). One real quirk found and
// accepted: on ~1/18 sampled multi-turn calls, Groq rejected gpt-oss-20b's
// output with a 400 tool_use_failed ("Tool choice is none, but model called
// a tool") — an OpenAI "harmony" response-format artifact, not something
// this app's request shape can avoid. The fallback chain below is exactly
// what absorbs that: confirmed live, it fails over to OpenRouter/Gemma
// mid-conversation with no visible break to the user, just ~2s more
// latency for that one turn.
const CONVERSATION_PRIMARY: ModelChoice = {
  provider: "groq",
  model: process.env.GROQ_MODEL_CONVERSATION || "openai/gpt-oss-20b",
};
const CONVERSATION_FALLBACKS: ModelChoice[] = [
  {
    provider: "openrouter",
    model: process.env.OPENROUTER_MODEL_CONVERSATION || "google/gemma-4-26b-a4b-it:free",
  },
  {
    provider: "ollama",
    model: process.env.OLLAMA_MODEL_CONVERSATION || "llama3.2",
  },
];

/**
 * Calls the LLM for the next interviewer turn given the full transcript so far.
 * No separate topic-tracking state (per plan.md open question #1) — the running
 * transcript plus persona system prompt is the only state passed on every turn.
 */
export async function getNextInterviewerMessage(session: Session): Promise<string> {
  const systemPrompt = buildPersona(session.mode, session.topic, session.documentRefs, session.pitchTimeLimitSec);

  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt }];

  if (session.turns.length === 0) {
    messages.push({ role: "user", content: KICKOFF_MESSAGE });
  } else {
    for (const turn of session.turns) {
      messages.push({
        role: turn.speaker === "user" ? "user" : "assistant",
        content: turn.text,
      });
    }
  }

  return chatCompletion(messages, {
    temperature: 0.8,
    label: "conversation",
    sessionId: session.id,
    primary: CONVERSATION_PRIMARY,
    fallbacks: CONVERSATION_FALLBACKS,
  });
}

export function exchangeCount(session: Session): number {
  return session.turns.filter((t) => t.speaker === "user").length;
}

export function shouldAutoEnd(session: Session): boolean {
  return exchangeCount(session) >= MAX_EXCHANGES_BY_MODE[session.mode];
}
