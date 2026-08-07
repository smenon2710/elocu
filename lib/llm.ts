import { promises as fs } from "fs";
import path from "path";
import { fetchWithTimeout } from "./fetchWithTimeout";

// One JSONL file per day under data/ (already gitignored) — a local,
// structured record of every call independent of any provider's own
// dashboard, so call-volume/cost/latency regressions can be traced back to a
// session and a call site (conversation vs grading) after the fact.
const LOG_DIR = path.join(process.cwd(), "data", "logs");

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export class LLMError extends Error {}

export type Provider = "groq" | "openrouter" | "ollama";

// All three are OpenAI-compatible chat-completion APIs (same request/response
// shape), just different hosts/keys — that's what makes one fetch
// implementation reusable across providers instead of duplicating it.
//
// extraHeaders: OpenRouter-specific app attribution (shows "Elocu" rather
// than an anonymous caller in their dashboard). Groq/Ollama have no
// equivalent convention, so it's omitted there rather than sent as dead
// weight. apiKeyEnv is optional because Ollama (local, no auth) doesn't have
// one — see callOnce for how that's handled.
const PROVIDER_CONFIG: Record<Provider, { url: string; apiKeyEnv?: string; extraHeaders?: Record<string, string> }> = {
  groq: { url: "https://api.groq.com/openai/v1/chat/completions", apiKeyEnv: "GROQ_API_KEY" },
  openrouter: {
    url: "https://openrouter.ai/api/v1/chat/completions",
    apiKeyEnv: "OPENROUTER_API_KEY",
    extraHeaders: { "HTTP-Referer": "http://localhost:3000", "X-Title": "Elocu" },
  },
  ollama: { url: process.env.OLLAMA_URL || "http://localhost:11434/v1/chat/completions" },
};

export interface ModelChoice {
  provider: Provider;
  model: string;
}

interface LogEntry {
  provider: Provider;
  label: string;
  sessionId?: string;
  model: string;
  messageCount: number;
  startedAt: number;
  ok: boolean;
  status?: number;
  error?: string;
  usage?: unknown;
  // The provider's own id for this exact call — OpenRouter: look it up via
  // GET https://openrouter.ai/api/v1/generation?id=<id> for full cost/token
  // stats; Groq: shown against your key's usage in the Groq console. This is
  // the field that bridges a local log line to that provider's own
  // dashboard for the *same* call, not just "some call around this time."
  providerRequestId?: string;
}

async function logCall(entry: LogEntry): Promise<void> {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
    const day = new Date(entry.startedAt).toISOString().slice(0, 10);
    const file = path.join(LOG_DIR, `llm-${day}.jsonl`);
    const line = JSON.stringify({
      ts: new Date(entry.startedAt).toISOString(),
      durationMs: Date.now() - entry.startedAt,
      provider: entry.provider,
      label: entry.label,
      sessionId: entry.sessionId ?? null,
      model: entry.model,
      messageCount: entry.messageCount,
      ok: entry.ok,
      status: entry.status ?? null,
      error: entry.error ?? null,
      usage: entry.usage ?? null,
      providerRequestId: entry.providerRequestId ?? null,
    });
    await fs.appendFile(file, line + "\n");
  } catch {
    // Logging must never break the actual LLM call path.
  }
}

async function callOnce(
  choice: ModelChoice,
  messages: ChatMessage[],
  opts: { temperature?: number; timeoutMs?: number; label?: string; sessionId?: string }
): Promise<string> {
  const { url, apiKeyEnv, extraHeaders } = PROVIDER_CONFIG[choice.provider];
  const apiKey = apiKeyEnv ? process.env[apiKeyEnv] : undefined;
  const label = opts.label ?? "unknown";
  const startedAt = Date.now();

  // Deliberately unconditional (not gated behind a debug flag) so call
  // volume/provider is always visible in the server log.
  console.log(
    `[llm] ${choice.provider} chat completion — model=${choice.model} messages=${messages.length} label=${label}`
  );

  // Only providers with an apiKeyEnv (Groq, OpenRouter) require a key —
  // Ollama is local/unauthenticated, so apiKeyEnv is undefined for it and
  // this check is skipped entirely.
  if (apiKeyEnv && !apiKey) {
    const error = `${apiKeyEnv} is not set.`;
    await logCall({ provider: choice.provider, label, sessionId: opts.sessionId, model: choice.model, messageCount: messages.length, startedAt, ok: false, error });
    throw new LLMError(error);
  }

  type Outcome =
    | { ok: true; content: string; responseModel?: string; responseId?: string; usage?: unknown }
    | { ok: false; error: string; status?: number };

  let outcome: Outcome;
  try {
    outcome = await fetchWithTimeout<Outcome>(
      url,
      {
        method: "POST",
        headers: {
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          "Content-Type": "application/json",
          ...extraHeaders,
        },
        body: JSON.stringify({
          model: choice.model,
          messages,
          temperature: opts.temperature ?? 0.7,
          // Groq/OpenRouter document this as an end-user identifier used for
          // abuse detection — passing our session id makes their side
          // filterable/traceable per session too, not just per API key.
          // Ollama (local) just ignores the field.
          ...(opts.sessionId ? { user: opts.sessionId } : {}),
        }),
      },
      // 45s: even the fast path (Groq) deserves a real ceiling rather than
      // hanging indefinitely; the fallback below is what actually keeps
      // things snappy when a provider is having a bad moment.
      opts.timeoutMs ?? 45000,
      // Reading the body happens *inside* the guarded window — the timeout
      // must cover the full round trip, not just the initial connection
      // (see fetchWithTimeout.ts for why that distinction matters).
      async (res) => {
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          return { ok: false, error: `${choice.provider} request failed (${res.status}): ${body.slice(0, 500)}`, status: res.status };
        }
        const data = await res.json();
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content !== "string" || content.length === 0) {
          return { ok: false, error: `${choice.provider} response had no message content` };
        }
        return { ok: true, content, responseModel: data?.model, responseId: data?.id, usage: data?.usage };
      }
    );
  } catch (err) {
    const error = err instanceof Error ? err.message : `Network error calling ${choice.provider}`;
    await logCall({ provider: choice.provider, label, sessionId: opts.sessionId, model: choice.model, messageCount: messages.length, startedAt, ok: false, error });
    throw new LLMError(error);
  }

  if (!outcome.ok) {
    await logCall({
      provider: choice.provider,
      label,
      sessionId: opts.sessionId,
      model: choice.model,
      messageCount: messages.length,
      startedAt,
      ok: false,
      status: outcome.status,
      error: outcome.error,
    });
    throw new LLMError(outcome.error);
  }

  await logCall({
    provider: choice.provider,
    label,
    sessionId: opts.sessionId,
    model: outcome.responseModel ?? choice.model,
    messageCount: messages.length,
    startedAt,
    ok: true,
    usage: outcome.usage,
    providerRequestId: outcome.responseId,
  });

  return outcome.content;
}

/**
 * Multi-turn chat completion with automatic provider fallback. Tries
 * `primary`, then each entry in `fallbacks` in order, stopping at the first
 * success — so one (or even two) providers having a bad moment doesn't take
 * the app down with it. Used by both the live interviewer loop
 * (lib/conversation.ts) and the grading pass (lib/grading.ts), each picking
 * its own primary/fallback chain — currently Groq -> OpenRouter -> local
 * Ollama, fastest/most-reliable first.
 */
export async function chatCompletion(
  messages: ChatMessage[],
  opts: {
    temperature?: number;
    timeoutMs?: number;
    label?: string;
    sessionId?: string;
    primary: ModelChoice;
    fallbacks?: ModelChoice[];
  }
): Promise<string> {
  const chain = [opts.primary, ...(opts.fallbacks ?? [])];

  for (let i = 0; i < chain.length; i++) {
    try {
      return await callOnce(chain[i], messages, opts);
    } catch (err) {
      const isLast = i === chain.length - 1;
      if (isLast) throw err;
      const reason = err instanceof Error ? err.message : "unknown error";
      console.log(`[llm] ${chain[i].provider} failed (${reason}) — falling back to ${chain[i + 1].provider}`);
    }
  }

  // Unreachable (chain always has at least `primary`), but keeps TypeScript
  // happy about the function always returning or throwing.
  throw new LLMError("No provider configured");
}

export interface LoggedCall {
  ts: string;
  durationMs: number;
  provider: Provider;
  label: string;
  sessionId: string | null;
  model: string;
  messageCount: number;
  ok: boolean;
  status: number | null;
  error: string | null;
  usage: unknown;
  providerRequestId: string | null;
}

/**
 * Reads back every logged call for a session, across all daily log files (a
 * resumed session can span days) — powers the in-app call-log view so which
 * model actually answered/evaluated a session is visible without grepping
 * files on disk.
 */
export async function getSessionCallLogs(sessionId: string): Promise<LoggedCall[]> {
  let files: string[];
  try {
    files = await fs.readdir(LOG_DIR);
  } catch {
    return [];
  }

  const logFiles = files.filter((f) => f.startsWith("llm-") && f.endsWith(".jsonl"));
  const rows: LoggedCall[] = [];

  for (const file of logFiles) {
    try {
      const raw = await fs.readFile(path.join(LOG_DIR, file), "utf-8");
      for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        const entry = JSON.parse(line) as LoggedCall;
        if (entry.sessionId === sessionId) rows.push(entry);
      }
    } catch {
      // Skip unreadable/corrupt files rather than failing the whole view.
    }
  }

  return rows.sort((a, b) => a.ts.localeCompare(b.ts));
}

/** Strips ```json fences (if present) and parses. Returns null on any failure. */
export function parseJsonObject<T = unknown>(raw: string): T | null {
  try {
    const stripped = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "");
    return JSON.parse(stripped) as T;
  } catch {
    return null;
  }
}
