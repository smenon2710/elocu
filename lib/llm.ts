import { asc, eq } from "drizzle-orm";
import { db, schema } from "./db";
import { fetchWithTimeout } from "./fetchWithTimeout";

// Every call is recorded in the llm_call_logs table (lib/db/schema.ts) — a
// structured record independent of any provider's own dashboard, so
// call-volume/cost/latency regressions can be traced back to a session and a
// call site (conversation vs grading) after the fact. (Was one JSONL file
// per day under data/logs/, which can't be written on Vercel's read-only
// filesystem.)

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export class LLMError extends Error {
  /** HTTP status, when the provider answered with one. */
  status?: number;
  /** For a 429: how long the provider said to wait, when it said. */
  retryAfterMs?: number;
  constructor(message: string, extra: { status?: number; retryAfterMs?: number } = {}) {
    super(message);
    this.status = extra.status;
    this.retryAfterMs = extra.retryAfterMs;
  }
}

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
  /**
   * Output-token ceiling for this call. Left unset, the provider's default
   * applies — and for a reasoning model that default is shared between its
   * hidden reasoning and the visible answer (see lib/grading.ts for the real
   * failure that caused).
   */
  maxTokens?: number;
  /** Only sent to models that take it (Groq's openai/gpt-oss-*); ignored elsewhere. */
  reasoningEffort?: "low" | "medium" | "high";
}

// Groq documents `reasoning_effort` for the gpt-oss models only — sending it
// to anything else is a 400, so it's gated on the model name rather than
// trusted to whatever GROQ_MODEL_* happens to be overridden to.
function supportsReasoningEffort(choice: ModelChoice): boolean {
  return choice.provider === "groq" && choice.model.includes("gpt-oss");
}

function outputLimitParams(choice: ModelChoice): Record<string, unknown> {
  return {
    ...(choice.maxTokens
      ? choice.provider === "groq"
        ? { max_completion_tokens: choice.maxTokens }
        : { max_tokens: choice.maxTokens }
      : {}),
    ...(choice.reasoningEffort && supportsReasoningEffort(choice) ? { reasoning_effort: choice.reasoningEffort } : {}),
  };
}

/** `Retry-After` in seconds (Groq sends fractional ones) → ms, or undefined if absent/unparseable. */
function retryAfterMsFrom(res: Response): number | undefined {
  const sec = Number(res.headers.get("retry-after"));
  return Number.isFinite(sec) && sec > 0 ? Math.ceil(sec * 1000) : undefined;
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
    await db()
      .insert(schema.llmCallLogs)
      .values({
        ts: new Date(entry.startedAt),
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
  } catch (err) {
    // Logging must never break the actual LLM call path — but say so in the
    // server log (captured by Vercel) rather than failing silently.
    console.log(`[llm] failed to record call log: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function callOnce(
  choice: ModelChoice,
  messages: ChatMessage[],
  opts: { temperature?: number; timeoutMs?: number; label?: string; sessionId?: string; rejectTruncated?: boolean }
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
    | { ok: false; error: string; status?: number; retryAfterMs?: number };

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
          ...outputLimitParams(choice),
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
          return {
            ok: false,
            error: `${choice.provider} request failed (${res.status}): ${body.slice(0, 500)}`,
            status: res.status,
            retryAfterMs: res.status === 429 ? retryAfterMsFrom(res) : undefined,
          };
        }
        const data = await res.json();
        const content = data?.choices?.[0]?.message?.content;
        // "length" = the model ran into its output-token ceiling. A reasoning
        // model can spend the whole ceiling thinking and return no content at
        // all, or return an answer cut off mid-way — say which, since "no
        // content" alone gives nothing to act on.
        const finishReason = data?.choices?.[0]?.finish_reason;
        const truncated = finishReason === "length";
        if (typeof content !== "string" || content.length === 0) {
          return {
            ok: false,
            error: `${choice.provider} response had no message content${truncated ? " (hit the output-token limit before answering)" : ""}`,
          };
        }
        if (truncated && opts.rejectTruncated) {
          return { ok: false, error: `${choice.provider} response was cut off at the output-token limit` };
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
    throw new LLMError(outcome.error, { status: outcome.status, retryAfterMs: outcome.retryAfterMs });
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
 *
 * `rejectTruncated`: treat an answer cut off at the output-token limit as a
 * failure (and move down the chain) — for callers that need the whole
 * response, like grading's JSON. A conversation reply is still usable cut
 * short, so it's off by default.
 *
 * `rateLimitWaitMs`: if the whole chain fails and a provider said "rate
 * limited, retry in N ms" with N inside this budget, wait and try that
 * provider once more. Off by default (0).
 */
export async function chatCompletion(
  messages: ChatMessage[],
  opts: {
    temperature?: number;
    timeoutMs?: number;
    label?: string;
    sessionId?: string;
    rejectTruncated?: boolean;
    rateLimitWaitMs?: number;
    primary: ModelChoice;
    fallbacks?: ModelChoice[];
  }
): Promise<string> {
  const chain = [opts.primary, ...(opts.fallbacks ?? [])];
  // The first provider (in chain order) that was rate-limited with a wait
  // short enough to sit out.
  let retryable: { choice: ModelChoice; waitMs: number } | null = null;
  let lastError: unknown = new LLMError("No provider configured");

  for (let i = 0; i < chain.length; i++) {
    try {
      return await callOnce(chain[i], messages, opts);
    } catch (err) {
      lastError = err;
      if (
        !retryable &&
        err instanceof LLMError &&
        err.status === 429 &&
        err.retryAfterMs !== undefined &&
        err.retryAfterMs <= (opts.rateLimitWaitMs ?? 0)
      ) {
        retryable = { choice: chain[i], waitMs: err.retryAfterMs };
      }
      const reason = err instanceof Error ? err.message : "unknown error";
      if (i < chain.length - 1) {
        console.log(`[llm] ${chain[i].provider} failed (${reason}) — falling back to ${chain[i + 1].provider}`);
      }
    }
  }

  if (retryable) {
    // A little past what the provider asked for, so the retry doesn't land
    // on the boundary of the same window.
    const waitMs = retryable.waitMs + 500;
    console.log(`[llm] every provider failed; ${retryable.choice.provider} was rate-limited — retrying it in ${waitMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    return callOnce(retryable.choice, messages, opts);
  }

  throw lastError;
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
 * Every logged call for a session, oldest first — powers the in-app call-log
 * view so which model actually answered/evaluated a session is visible
 * without querying the database by hand. Callers must check the session
 * belongs to the current user first (lib/store.ts's getSession) — log rows
 * aren't user-scoped themselves.
 */
export async function getSessionCallLogs(sessionId: string): Promise<LoggedCall[]> {
  const rows = await db()
    .select()
    .from(schema.llmCallLogs)
    .where(eq(schema.llmCallLogs.sessionId, sessionId))
    .orderBy(asc(schema.llmCallLogs.ts));
  return rows.map((r) => ({
    ts: r.ts.toISOString(),
    durationMs: r.durationMs,
    provider: r.provider as Provider,
    label: r.label,
    sessionId: r.sessionId,
    model: r.model,
    messageCount: r.messageCount,
    ok: r.ok,
    status: r.status,
    error: r.error,
    usage: r.usage,
    providerRequestId: r.providerRequestId,
  }));
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
