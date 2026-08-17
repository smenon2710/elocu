import { promises as fs } from "fs";
import path from "path";
import { computeContentMetrics } from "./contentMetrics";
import { computeConversationMetrics } from "./conversationMetrics";
import { computeDeliveryMetrics } from "./deliveryMetrics";
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

// Groq primary: was llama-3.1-8b-instant (switched to after gpt-oss-20b
// twice produced malformed JSON — see the note on validateQuotedMoment()
// below, which was itself added after gpt-oss-20b misattributed a quote).
// llama-3.1-8b-instant was then fully removed from Groq's catalog at some
// point after that — every call was 404ing with model_not_found (see
// plan.md §22). Re-benchmarked live against Groq's current model list: no
// candidate is risk-free, so this is gpt-oss-20b again, deliberately —
// fastest (~0.3s vs. 2-3s for gpt-oss-120b), valid JSON in 6/6 live test
// runs today, and clearly the most rubric-accurate of the options tested
// (gpt-oss-120b and groq/compound-mini both graded the AI's own opening
// line instead of the user's turn; allam-2-7b's fixes were vaguer and its
// scores less sensitive to actual filler-heavy delivery). Its two known
// failure modes — malformed JSON, misattributed quotes — are exactly what
// the parse-validation fallback below and validateQuotedMoment() exist to
// catch gracefully, which is the real reason it's an acceptable choice
// again rather than a repeat of the original mistake. Fallback chain
// unchanged: OpenRouter/Gemma, then local Ollama/llama3.2.
const GRADING_PRIMARY: ModelChoice = {
  provider: "groq",
  model: process.env.GROQ_MODEL_GRADING || "openai/gpt-oss-20b",
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
    "Pace/rhythm, filler words, hedging language, use of pauses. Objective words-per-minute pace, filler-word counts, and hedging-word counts are provided separately below as measured data (not inferred) — ground the score/fix in those directly. Rhythm and pauses still have to be inferred from phrasing since no audio is available.",
  content:
    "Specificity vs. vague generality, relevance to the question asked, conciseness. A vocabulary-diversity figure (type-token ratio) is provided separately below as measured data where there's enough text for it to mean anything — use it as one input, not the whole judgment (a low ratio in a short answer is normal, not necessarily weak).",
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
 * Pitch mode's time-budget framing: target vs. actual seconds, grounded in
 * the turn's real startTs/endTs (see app/api/sessions/[id]/messages/route.ts
 * — the client sends actual elapsed time instead of a same-instant
 * double-stamp). Word count/pace come from computeDeliveryMetrics, shared
 * with deliveryMetricsBlock below rather than recomputed here.
 */
function pitchTimingBlock(session: Session): string {
  if (session.mode !== "pitch" || !session.pitchTimeLimitSec) return "";
  const turn = session.turns.find((t) => t.speaker === "user");
  if (!turn) return "";

  const durationSec = Math.max(0, Math.round((turn.endTs - turn.startTs) / 1000));
  const targetSec = session.pitchTimeLimitSec;
  const diff = durationSec - targetSec;
  const { totalWords, wpm } = computeDeliveryMetrics(session);

  return `

Objective pacing data for the Delivery section (measured, not inferred — use it
directly rather than guessing pace from phrasing): the pitch had a ${targetSec}s
time budget and actually ran ${durationSec}s (${diff > 0 ? `${diff}s over` : diff < 0 ? `${-diff}s under` : "right on target"}).
${totalWords} words${wpm !== null ? ` at ~${wpm} words/minute (conversational speech is typically 130-160 wpm)` : ""}.
Ground the Delivery fix in this — e.g. name what to cut if they ran over, or
note if they rushed/dragged relative to a natural pace.`;
}

/**
 * General-purpose delivery data for every mode, not just Pitch: aggregate
 * words/minute across all user turns and filler-word density (see
 * lib/deliveryMetrics.ts). Pitch mode's pace is already covered by
 * pitchTimingBlock's target-vs-actual framing above, so this only adds pace
 * for every other mode — but filler-word density runs everywhere, since
 * pitchTimingBlock doesn't compute it.
 */
function deliveryMetricsBlock(session: Session): string {
  if (!session.turns.some((t) => t.speaker === "user")) return "";

  const { totalWords, wpm, fillerCount, fillerPct, fillerBreakdown, hedgeCount, hedgePct, hedgeBreakdown } =
    computeDeliveryMetrics(session);
  const parts: string[] = [];

  if (wpm !== null && session.mode !== "pitch") {
    parts.push(
      `Speaking pace across the session: ~${wpm} words/minute (typical conversational pace is 130-160 wpm; faster is normal for debate).`
    );
  }

  if (fillerPct !== null) {
    const breakdown = fillerBreakdown.map(([w, c]) => `"${w}" x${c}`).join(", ");
    parts.push(
      `Filler word count: ${fillerCount} across ${totalWords} words (${fillerPct.toFixed(1)}%)${breakdown ? ` — ${breakdown}` : ""}.`
    );
  }

  if (hedgePct !== null) {
    const breakdown = hedgeBreakdown.map(([w, c]) => `"${w}" x${c}`).join(", ");
    parts.push(
      `Hedging-word count: ${hedgeCount} across ${totalWords} words (${hedgePct.toFixed(1)}%)${breakdown ? ` — ${breakdown}` : ""}. These are heuristic word-list counts, not a precise linguistic classifier — use judgment on which instances actually read as hedging vs. normal use.`
    );
  }

  if (parts.length === 0) return "";
  return `

Objective delivery data for the Delivery section (measured, not inferred —
ground the score/fix in this rather than guessing pace or filler/hedge use
from phrasing alone):
${parts.join("\n")}`;
}

/**
 * Vocabulary diversity (type-token ratio) for the Content section — see
 * lib/contentMetrics.ts for why this only fires above a minimum word count.
 */
function contentMetricsBlock(session: Session): string {
  const { totalWords, uniqueWords, ttrPct } = computeContentMetrics(session);
  if (ttrPct === null) return "";

  return `

Objective vocabulary data for the Content section (measured, not inferred):
${uniqueWords} unique words out of ${totalWords} total (${ttrPct.toFixed(1)}% type-token ratio).
Note this drops naturally as a session runs longer even with no change in
actual vocabulary richness — weigh it lightly, don't treat it as a precise
sophistication score.`;
}

/**
 * Talk-time ratio and question rate for the Engagement section, Conversation
 * mode only — the back-and-forth shape that makes these meaningful doesn't
 * exist in Pitch/Speech (a single monologue) or map cleanly onto
 * Interview/Debate's different turn-taking norms.
 */
function conversationMetricsBlock(session: Session): string {
  if (session.mode !== "conversation") return "";
  const { talkTimePct, questionRatePct, userTurnCount } = computeConversationMetrics(session);
  if (talkTimePct === null || userTurnCount === 0) return "";

  return `

Objective conversation-dynamics data for the Engagement section (measured,
not inferred): you accounted for ${talkTimePct.toFixed(0)}% of the words spoken
(a healthy back-and-forth is roughly 45-55% — well above suggests dominating
the conversation, well below suggests under-participating).${
    questionRatePct !== null
      ? ` You asked a question back in ${questionRatePct.toFixed(0)}% of your turns (asking
nothing back across many turns can read as low awareness of the other
person, not just low curiosity).`
      : ""
  }`;
}

/**
 * Interview mode's Structure check, made explicit: not a computed metric
 * like the blocks above — a grading-instruction refinement so the model
 * checks a concrete framework (Situation/Task/Action/Result) instead of a
 * generic "clear shape" judgment.
 */
function interviewStructureNote(session: Session): string {
  if (session.mode !== "interview") return "";
  return `

For the Structure section specifically, evaluate against the STAR method:
does the answer establish the Situation, the Task, the Action taken, and the
Result? Name in the fix which STAR component was weakest or missing, not a
generic structure comment.`;
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
${deliveryMetricsBlock(session)}
${contentMetricsBlock(session)}
${conversationMetricsBlock(session)}
${interviewStructureNote(session)}

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
