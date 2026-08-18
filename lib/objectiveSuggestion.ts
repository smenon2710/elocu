import { chatCompletion, parseJsonObject, type ModelChoice } from "./llm";
import { VALID_METRICS, VALID_MODES, VALID_SECTION_KEYS, parseObjectiveTarget } from "./objectives";
import type { FeedbackSections, ObjectiveMetric, ObjectiveTarget, SessionMode } from "./types";

// OpenRouter primary, local Ollama fallback — deliberately no Groq in this
// chain (explicit user instruction). Benchmarked head-to-head against three
// real free-text goals ("get better at negotiating," a Google-interview
// goal, "become a more confident public speaker") before picking: both
// produced syntactically valid JSON every time, but llama3.2 (3B, local)
// was semantically weak on the actual mapping — it missed the obvious
// negotiating -> Argumentation/Debate connection entirely, and suggested
// "contextFit" (job-description/resume alignment) for a pure confidence
// goal, which isn't related at all. OpenRouter's gemma-4-26b-a4b-it
// correctly picked Argumentation/Debate for negotiating, correctly used
// Speech mode (not a generic Conversation default) for "public speaker,"
// and picked up on situational detail ("backend engineering role") for the
// interview goal. This is a one-time, on-demand, user-triggered call (not
// the hot conversation/grading path), so the accuracy gap mattered more
// than shaving latency by defaulting to local — hence OpenRouter primary
// here, the reverse of conversation/grading's Groq-first ordering.
const SUGGESTION_PRIMARY: ModelChoice = {
  provider: "openrouter",
  model: process.env.OPENROUTER_MODEL_SUGGESTION || "google/gemma-4-26b-a4b-it:free",
};
const SUGGESTION_FALLBACKS: ModelChoice[] = [
  {
    provider: "ollama",
    model: process.env.OLLAMA_MODEL_SUGGESTION || "llama3.2",
  },
];

const METRIC_DESCRIPTIONS: Record<ObjectiveMetric, string> = {
  overallScore: 'overall session score, 1-5 scale, any mode',
  sectionScore: 'score for one specific section, 1-5 scale — requires a sectionKey (see below)',
  wpm: "speaking pace in words/minute (natural conversational pace is ~130-160)",
  fillerPct: "filler-word percentage of total words (lower is better, well-prepared speech is usually under ~5%)",
  hedgePct: 'hedging-word percentage (lower is better, e.g. "I think", "just", "kind of")',
  ttrPct: "vocabulary diversity, unique words / total words as a percentage (higher is better, ~50-60% is typical)",
  talkTimePct: "share of words spoken by the user vs. the AI, Conversation mode ONLY (a balanced back-and-forth is ~40-55%)",
  questionRatePct: "percent of the user's turns that asked a question back, Conversation mode ONLY (higher is better)",
  pitchOnTargetPct: "percent of Pitch-mode attempts landing within the time budget, Pitch mode ONLY (higher is better)",
};

const SECTION_DESCRIPTIONS: Record<keyof FeedbackSections, string> = {
  structure: "clear shape to an answer, strong opening, landing a clear takeaway",
  delivery: "pace, filler/hedge words, use of pauses",
  content: "specificity, relevance, conciseness",
  engagement: "hook strength, emotional variation, awareness of the listener",
  contextFit: "alignment with a job description/resume (interview mode only)",
  argumentation: "building a claim with evidence, addressing counterarguments, composure under pushback (debate mode only)",
};

function describeExistingTarget(t: ObjectiveTarget): string {
  const scope = t.sectionKey ? ` (sectionKey "${t.sectionKey}")` : "";
  const modeScope = t.mode ? `, scoped to mode "${t.mode}"` : "";
  return `metric "${t.metric}"${scope}${modeScope}, current target ${t.targetValue}`;
}

function existingTargetsBlock(existingTargets: ObjectiveTarget[]): string {
  if (existingTargets.length === 0) return "";
  const lines = existingTargets.map((t) => `- ${describeExistingTarget(t)}`).join("\n");
  return `\n\nThe user is already tracking these targets for this same goal — do NOT suggest any of
these again. Suggest different metrics or scopes that would add genuinely new signal instead:
${lines}`;
}

function buildPrompt(title: string, note: string | null, existingTargets: ObjectiveTarget[]): string {
  const metricLines = VALID_METRICS.map((m) => `- "${m}": ${METRIC_DESCRIPTIONS[m]}`).join("\n");
  const sectionLines = VALID_SECTION_KEYS.map((s) => `- "${s}": ${SECTION_DESCRIPTIONS[s]}`).join("\n");

  return `
You are helping someone turn a vague, free-text self-improvement goal into a specific, measurable
target inside a speaking-practice app.

Available metrics (pick from these exact keys only):
${metricLines}

sectionKey (only used when metric is "sectionScore"), pick from exactly these:
${sectionLines}

mode (optional scope, pick from exactly these or null for "all modes"):
${VALID_MODES.map((m) => `"${m}"`).join(", ")}

The user's goal:
Title: "${title}"
Note: "${note ?? ""}"${existingTargetsBlock(existingTargets)}

Suggest 2-3 concrete targets that would genuinely help track progress toward this goal. For each,
pick the metric that best matches what the goal is actually about, an appropriate mode scope if one
mode is clearly more relevant than others (or null if the goal applies broadly), a sensible numeric
target given the metric's typical range described above, and a one-sentence rationale explaining why
this target reflects the stated goal.

Return ONLY a JSON object, no markdown fences, no commentary, with exactly this shape:
{"suggestions": [{"metric": "<metric key>", "mode": "<mode or null>", "sectionKey": "<sectionKey or null>", "targetValue": <number>, "rationale": "<one sentence>"}]}
`.trim();
}

export interface ObjectiveSuggestion {
  metric: ObjectiveMetric;
  mode: SessionMode | null;
  sectionKey: keyof FeedbackSections | null;
  targetValue: number;
  rationale: string;
}

/**
 * Drops anything that doesn't fit the known enum/shape rather than trusting
 * the model's output verbatim — reuses lib/objectives.ts's
 * `parseObjectiveTarget` for the metric/mode/sectionKey/targetValue
 * validation and clamping (same rules the manual goal-editing form enforces,
 * one source of truth), then attaches the rationale text separately since
 * a suggestion isn't a real ObjectiveTarget yet — it only becomes one if the
 * user chooses to apply it.
 */
function validateSuggestion(raw: unknown): ObjectiveSuggestion | null {
  const target = parseObjectiveTarget(raw);
  if (!target) return null;

  const rationale =
    raw && typeof raw === "object" && typeof (raw as Record<string, unknown>).rationale === "string"
      ? (raw as Record<string, string>).rationale.trim().slice(0, 300)
      : "";

  return { metric: target.metric, mode: target.mode, sectionKey: target.sectionKey, targetValue: target.targetValue, rationale };
}

function sameShape(
  a: { metric: ObjectiveMetric; mode: SessionMode | null; sectionKey: keyof FeedbackSections | null },
  b: { metric: ObjectiveMetric; mode: SessionMode | null; sectionKey: keyof FeedbackSections | null }
): boolean {
  return a.metric === b.metric && a.mode === b.mode && a.sectionKey === b.sectionKey;
}

/**
 * Suggests 1-3 concrete metric+target combinations for a free-text goal —
 * an on-demand, user-triggered call (the "Suggest targets" button on an
 * Objective card), not part of the live conversation/grading path.
 * `existingTargets` (the goal's current `Objective.targets`) both steers the
 * prompt away from re-suggesting what's already tracked and, more
 * importantly, is filtered against afterward unconditionally — the app
 * can't rely on the model actually honoring that instruction every time, so
 * a duplicate is dropped here even if the LLM ignores it. Returns an empty
 * array on total failure rather than throwing, so the UI can show a plain
 * "couldn't generate suggestions" message.
 */
export async function suggestObjectiveTargets(
  title: string,
  note: string | null,
  existingTargets: ObjectiveTarget[] = []
): Promise<ObjectiveSuggestion[]> {
  try {
    const raw = await chatCompletion([{ role: "user", content: buildPrompt(title, note, existingTargets) }], {
      temperature: 0.3,
      label: "objective-suggestion",
      primary: SUGGESTION_PRIMARY,
      fallbacks: SUGGESTION_FALLBACKS,
    });
    const parsed = parseJsonObject<{ suggestions?: unknown[] }>(raw);
    if (!parsed || !Array.isArray(parsed.suggestions)) return [];

    return parsed.suggestions
      .map(validateSuggestion)
      .filter((s): s is ObjectiveSuggestion => s !== null)
      .filter((s) => !existingTargets.some((t) => sameShape(s, t)))
      .slice(0, 3);
  } catch {
    return [];
  }
}
