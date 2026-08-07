import { chatCompletion, type ChatMessage, type ModelChoice } from "./llm";
import { buildPersona } from "./persona";
import { MAX_EXCHANGES_BY_MODE, type Session } from "./types";

const KICKOFF_MESSAGE = "(The session is starting now. Begin the conversation.)";

// Groq primary: this is the live, latency-sensitive path the user waits on,
// and speed via custom inference hardware is Groq's whole value proposition
// — llama-3.1-8b-instant is their fastest general-purpose tier and still
// supports tools/json_mode. Fallback chain: OpenRouter/Gemma (proven
// fast+reliable earlier this session), then local Ollama/llama3.2 as a last
// resort — benchmarked against qwen3:8b, mistral, and deepseek-r1 on this
// machine; llama3.2 was the only one with usable speed (~1.1s for a real
// persona prompt) and decent instruction-following, so it's the one kept.
const CONVERSATION_PRIMARY: ModelChoice = {
  provider: "groq",
  model: process.env.GROQ_MODEL_CONVERSATION || "llama-3.1-8b-instant",
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
  const systemPrompt = buildPersona(session.mode, session.topic, session.documentRefs);

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
