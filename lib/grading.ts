import { promises as fs } from "fs";
import path from "path";
import { chatCompletion, parseJsonObject, type ModelChoice } from "./llm";
import type { Feedback, FeedbackSection, FeedbackSections, QuotedMoment, Session } from "./types";

const LOG_DIR = path.join(process.cwd(), "data", "logs");

/**
 * The one thing lib/llm.ts's call log can't tell you: WHY a successful call
 * (ok: true, valid content) still failed grading — that only happens above
 * it, when this file tries to parse/validate the response as the expected
 * JSON shape. Without logging the raw content here, a failure like that is
 * an unsolvable mystery after the fact (confirmed: this happened for a real
 * session — the call succeeded per the llm log, but nothing recorded what
 * the model actually returned, so the specific parse failure couldn't be
 * diagnosed). This closes that gap.
 */
async function logParseFailure(sessionId: string, reason: string, raw: string): Promise<void> {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    const file = path.join(LOG_DIR, `grading-failures-${day}.jsonl`);
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      sessionId,
      reason,
      raw: raw.slice(0, 4000),
    });
    await fs.appendFile(file, line + "\n");
  } catch {
    // Logging must never break the actual grading path.
  }
}

export interface ParseFailure {
  ts: string;
  sessionId: string;
  reason: string;
  raw: string;
}

/** Reads back any logged parse/validation failures for a session — the "why did grading fail" detail lib/llm.ts's call log alone can't answer. */
export async function getSessionParseFailures(sessionId: string): Promise<ParseFailure[]> {
  let files: string[];
  try {
    files = await fs.readdir(LOG_DIR);
  } catch {
    return [];
  }

  const logFiles = files.filter((f) => f.startsWith("grading-failures-") && f.endsWith(".jsonl"));
  const rows: ParseFailure[] = [];

  for (const file of logFiles) {
    try {
      const raw = await fs.readFile(path.join(LOG_DIR, file), "utf-8");
      for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        const entry = JSON.parse(line) as ParseFailure;
        if (entry.sessionId === sessionId) rows.push(entry);
      }
    } catch {
      // Skip unreadable/corrupt files rather than failing the whole view.
    }
  }

  return rows.sort((a, b) => a.ts.localeCompare(b.ts));
}

// Groq primary: was openai/gpt-oss-20b (picked for its advertised
// structured_outputs support), but real usage caught it generating
// syntactically malformed JSON twice — missing the comma between sibling
// section keys (e.g. "structure":{...},{"delivery":{...} instead of
// "structure":{...},"delivery":{...}) — once on OpenRouter's free tier and
// again on Groq. Two confirmed occurrences of the same model doing the same
// thing is a pattern, not noise. Switched to llama-3.1-8b-instant (same
// model already used for conversation), which has been reliable in every
// observed case across both providers. Fallback chain: OpenRouter/Gemma
// (proven fast+reliable earlier this session), then local Ollama/llama3.2 as
// a last resort — the only local model benchmarked that returned valid JSON
// in a reasonable time (~5.2s; qwen3:8b/deepseek-r1's reasoning overhead and
// mistral's slowness ruled them out). validateQuotedMoment() below still
// guards against any model misattributing a quote to the wrong speaker.
const GRADING_PRIMARY: ModelChoice = {
  provider: "groq",
  model: process.env.GROQ_MODEL_GRADING || "llama-3.1-8b-instant",
};
const GRADING_FALLBACKS: ModelChoice[] = [
  {
    provider: "openrouter",
    model: process.env.OPENROUTER_MODEL_GRADING || "google/gemma-4-26b-a4b-it:free",
  },
  {
    provider: "ollama",
    model: process.env.OLLAMA_MODEL_GRADING || "llama3.2",
  },
];

type SectionKey = "structure" | "delivery" | "content" | "engagement" | "contextFit" | "argumentation";

const SECTION_DESCRIPTIONS: Record<SectionKey, string> = {
  structure:
    "Clear shape to the answer (setup -> tension -> resolution), strong opening line vs. throat-clearing, landing on a clear takeaway.",
  delivery:
    "Pace/rhythm, filler words & hedging language, use of pauses. Infer this from phrasing and word choice in the transcript text (fillers like 'um', 'like', 'I guess', repeated hedges) since no audio is available.",
  content: "Specificity vs. vague generality, relevance to the question asked, conciseness.",
  engagement: "Hook strength of the opening, emotional variation vs. flatness, awareness of the listener/context.",
  contextFit: "Alignment with the provided job description/resume, coverage of the provided question bank.",
  argumentation:
    "Building a claim with real evidence/reasoning (not just assertion), anticipating and directly addressing the opponent's actual counterarguments (not a strawman), staying composed and persuasive under pushback.",
};

/**
 * Models don't always follow the "only quote a USER turn" instruction —
 * observed gpt-oss-20b quoting the AI's own argument verbatim in a debate
 * session and attributing it to the user. Rather than trust an LLM's claim
 * about its own output, verify the quoted turn actually exists, is a user
 * turn, and the text actually appears there. Strips just the quote on
 * failure (keeps the score/fix, which are usually still reasonable) instead
 * of discarding the whole section.
 */
function validateQuotedMoment(session: Session, raw: unknown): QuotedMoment | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as { text?: unknown; turnIndex?: unknown };
  if (typeof candidate.text !== "string" || typeof candidate.turnIndex !== "number") return null;

  const turn = session.turns[candidate.turnIndex];
  if (!turn || turn.speaker !== "user") return null;
  if (!turn.text.toLowerCase().includes(candidate.text.trim().toLowerCase())) return null;

  return { text: candidate.text, turnIndex: candidate.turnIndex };
}

function transcriptForPrompt(session: Session): string {
  return session.turns
    .map((t, i) => `[${i}] ${t.speaker === "user" ? "USER" : "AI"}: ${t.text}`)
    .join("\n");
}

/**
 * Objective pacing data for pitch mode, grounded in the turn's real
 * startTs/endTs (see app/api/sessions/[id]/messages/route.ts — the client
 * now sends actual elapsed time instead of a same-instant double-stamp) —
 * handed to the model as fact rather than left to guess pace from word
 * choice alone, the way every other mode's Delivery score has to.
 */
function pitchTimingBlock(session: Session): string {
  if (session.mode !== "pitch" || !session.pitchTimeLimitSec) return "";
  const turn = session.turns.find((t) => t.speaker === "user");
  if (!turn) return "";

  const durationSec = Math.max(0, Math.round((turn.endTs - turn.startTs) / 1000));
  const targetSec = session.pitchTimeLimitSec;
  const diff = durationSec - targetSec;
  const wordCount = turn.text.trim().split(/\s+/).filter(Boolean).length;
  const wpm = durationSec > 0 ? Math.round((wordCount / durationSec) * 60) : 0;

  return `

Objective pacing data for the Delivery section (measured, not inferred — use it
directly rather than guessing pace from phrasing): the pitch had a ${targetSec}s
time budget and actually ran ${durationSec}s (${diff > 0 ? `${diff}s over` : diff < 0 ? `${-diff}s under` : "right on target"}).
Roughly ${wordCount} words at ~${wpm} words/minute (conversational speech is
typically 130-160 wpm). Ground the Delivery fix in this — e.g. name what to cut
if they ran over, or note if they rushed/dragged relative to a natural pace.`;
}

function fallbackSection(): FeedbackSection {
  return {
    score: 3,
    quotedMoment: null,
    fix: "Grading was unavailable for this session (the model call failed or returned an unusable response). Try starting a new session.",
  };
}

function emptySection(): FeedbackSection {
  return {
    score: 3,
    quotedMoment: null,
    fix: "The session ended before you answered, so there's nothing to grade yet — start a new session and give it a try.",
  };
}

/**
 * The session ended with no user turns at all (e.g. ended right after the
 * opening question, before an answer was given). Nothing to grade — return
 * accurate placeholder feedback without spending an LLM call on an empty
 * transcript, and without the "grading was unavailable" wording, which would
 * wrongly imply a technical failure.
 */
export function emptyTranscriptFeedback(session: Session): Feedback {
  const sectionKeys: SectionKey[] = ["structure", "delivery", "content", "engagement"];
  if (session.documentsUsed) sectionKeys.push("contextFit");
  if (session.mode === "debate") sectionKeys.push("argumentation");

  const sections = sectionKeys.reduce((acc, k) => {
    acc[k] = emptySection();
    return acc;
  }, {} as Record<SectionKey, FeedbackSection>) as FeedbackSections;

  return {
    sessionId: session.id,
    generatedAt: Date.now(),
    sections,
    emptyTranscript: true,
  };
}

function buildPrompt(session: Session, sectionKeys: SectionKey[]): string {
  const shape = sectionKeys
    .map(
      (k) =>
        `  "${k}": { "score": <1-5 integer>, "quotedMoment": { "text": "<verbatim quote from a USER turn>", "turnIndex": <int> }, "fix": "<one concrete, specific fix>" }`
    )
    .join(",\n");

  return `
You are grading a practice conversation for a communication-skills app. Only the
USER's turns should be scored — the AI turns are context for what was asked.

Transcript (each line prefixed with its turn index in brackets):
${transcriptForPrompt(session)}
${pitchTimingBlock(session)}

Score the USER's performance on each section below, on an integer scale of 1
(needs significant work) to 5 (excellent). For each section, quote exactly one
short verbatim moment from a USER turn with its turn index, and give one
concrete, specific fix — never generic advice like "be more concise". Name the
exact sentence or phrase and what to do instead.

Sections to grade:
${sectionKeys.map((k) => `- ${k}: ${SECTION_DESCRIPTIONS[k]}`).join("\n")}

Return ONLY a JSON object, no markdown code fences, no commentary, with exactly
this shape:
{
${shape}
}
`.trim();
}

export async function gradeSession(session: Session): Promise<Feedback> {
  const sectionKeys: SectionKey[] = ["structure", "delivery", "content", "engagement"];
  if (session.documentsUsed) sectionKeys.push("contextFit");
  if (session.mode === "debate") sectionKeys.push("argumentation");

  let sections: FeedbackSections | null = null;
  let gradingFailed = false;

  try {
    const raw = await chatCompletion([{ role: "user", content: buildPrompt(session, sectionKeys) }], {
      temperature: 0,
      timeoutMs: 45000,
      label: "grading",
      sessionId: session.id,
      primary: GRADING_PRIMARY,
      fallbacks: GRADING_FALLBACKS,
    });
    const parsed = parseJsonObject<Record<string, FeedbackSection>>(raw);
    const valid =
      parsed && sectionKeys.every((k) => parsed[k] && typeof parsed[k].score === "number");

    if (parsed && valid) {
      sections = sectionKeys.reduce((acc, k) => {
        acc[k] = {
          score: Math.min(5, Math.max(1, Math.round(parsed[k].score))),
          quotedMoment: validateQuotedMoment(session, parsed[k].quotedMoment),
          fix: parsed[k].fix || "No specific fix returned.",
        };
        return acc;
      }, {} as Record<SectionKey, FeedbackSection>) as FeedbackSections;
    } else {
      const reason = !parsed
        ? "response was not valid JSON"
        : `missing/invalid sections: ${sectionKeys.filter((k) => !parsed[k] || typeof parsed[k].score !== "number").join(", ")}`;
      console.log(`[grading] parse/validation failed for session ${session.id}: ${reason}`);
      await logParseFailure(session.id, reason, raw);
    }
  } catch {
    gradingFailed = true;
  }

  if (!sections) {
    gradingFailed = true;
    sections = sectionKeys.reduce((acc, k) => {
      acc[k] = fallbackSection();
      return acc;
    }, {} as Record<SectionKey, FeedbackSection>) as FeedbackSections;
  }

  return {
    sessionId: session.id,
    generatedAt: Date.now(),
    sections,
    gradingFailed,
  };
}
