"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DocSlot } from "@/app/components/DocSlot";
import {
  DEFAULT_PITCH_TIME_LIMIT_SEC,
  PITCH_TIME_LIMITS_SEC,
  type DocumentKind,
  type DocumentRef,
  type SessionMode,
} from "@/lib/types";

interface ModeConfig {
  label: string;
  tagline: string;
  headline: string;
  subcopy: string;
  placeholder: string;
  starters: string[];
  topicOptional?: boolean;
}

// Taglines echo the landing page's "Five rooms to practice in" section
// verbatim — the same line that sold the mode on the way in is the line that
// labels the room once you've walked through the door.
const MODE_CONFIG: Record<SessionMode, ModeConfig> = {
  interview: {
    label: "Interview",
    tagline: "Real questions, tailored to the role.",
    headline: "What's the interview about?",
    subcopy:
      "No setup needed — tell me the role or topic, and we'll start talking. Add a job description or resume below to tailor it further.",
    placeholder: "e.g. A backend engineering interview",
    starters: [
      "Tell me about a time you solved a hard problem.",
      "Walk me through a decision you're proud of.",
      "Tell me about a time you disagreed with someone.",
      "What's a project you'd want to talk about in depth?",
    ],
  },
  conversation: {
    label: "Conversation",
    tagline: "Talk through anything, casually.",
    headline: "What do you want to talk about?",
    subcopy: "No setup needed — just tell me what you want to practice, and we'll start talking.",
    placeholder: "e.g. Tell me about a time you solved a hard problem",
    starters: [
      "Tell me about a time you solved a hard problem.",
      "Pitch me an idea you're excited about.",
      "Walk me through a decision you're proud of.",
      "Tell me about a time you disagreed with someone.",
    ],
  },
  speech: {
    label: "Speech",
    tagline: "Deliver a talk. We get out of the way.",
    headline: "What's your speech about?",
    subcopy:
      "Practice delivering a prepared talk out loud — I'll stay quiet and listen, then give you feedback afterward.",
    placeholder: "e.g. A toast for my sister's wedding",
    starters: [
      "A toast for a friend's wedding.",
      "A pitch for a new product idea.",
      "A farewell speech for a coworker.",
      "Opening remarks for a conference talk.",
    ],
  },
  orator: {
    label: "Orator",
    tagline: "No topic? We'll hand you one.",
    headline: "Give yourself an impromptu topic",
    subcopy: "Practice persuasive speaking on the spot. Leave it blank and I'll hand you a surprise topic.",
    placeholder: "e.g. Remote work is better than office work — or leave blank for a surprise",
    starters: [
      "Cities should ban cars from downtown areas.",
      "Every student should learn to code.",
      "Social media does more harm than good.",
    ],
    topicOptional: true,
  },
  debate: {
    label: "Debate",
    tagline: "State a position. Get argued with.",
    headline: "What position do you want to argue?",
    subcopy: "State your position — I'll argue the opposing side and push back on your reasoning.",
    placeholder: "e.g. Remote work is better than office work",
    starters: [
      "Remote work is better than office work.",
      "Standardized testing should be abolished.",
      "AI will create more jobs than it destroys.",
    ],
  },
  pitch: {
    label: "Pitch",
    tagline: "One shot, the clock's running.",
    headline: "What's your elevator pitch?",
    subcopy: "Pick a time budget below, then deliver it in one go — I'll stay quiet and listen, then react.",
    placeholder: "e.g. My startup idea, in one sentence",
    starters: [
      "Pitch your startup idea to an investor.",
      "Introduce yourself at a networking event.",
      "Pitch a new feature to your manager.",
      "Pitch yourself for a role you want.",
    ],
  },
};

// Ordered cheapest to priciest: Orator/Speech/Pitch are capped at 1 exchange
// each (bounded, non-quadratic); Conversation/Debate/Interview share a
// 12-exchange cap and resend the full growing transcript every turn, with
// Interview last since an attached resume/JD/question-list resends on every
// turn too.
const MODES: SessionMode[] = ["orator", "speech", "pitch", "conversation", "debate", "interview"];

function formatLimit(sec: number): string {
  return sec < 60 ? `${sec}s` : `${sec / 60}m`;
}

const DOC_SLOTS: { kind: DocumentKind; label: string }[] = [
  { kind: "job_description", label: "Job description" },
  { kind: "resume", label: "Resume" },
  { kind: "question_list", label: "Question list" },
];

const EMPTY_DOCS: Record<DocumentKind, DocumentRef[]> = {
  job_description: [],
  resume: [],
  question_list: [],
  other: [],
};

export default function HomePage() {
  const router = useRouter();
  const [mode, setMode] = useState<SessionMode>("conversation");
  const [topic, setTopic] = useState("");
  const [pitchLimit, setPitchLimit] = useState<number>(DEFAULT_PITCH_TIME_LIMIT_SEC);
  const [showDocs, setShowDocs] = useState(false);
  const [docs, setDocs] = useState<Record<DocumentKind, DocumentRef[]>>(EMPTY_DOCS);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config = MODE_CONFIG[mode];
  const canStart = config.topicOptional || topic.trim().length > 0;
  // Only Interview mode has a real use for a job description/resume/question
  // bank — showing this for Conversation/Speech/Orator/Debate never made sense.
  const docsAvailable = mode === "interview";

  function selectMode(next: SessionMode) {
    setMode(next);
    setTopic("");
    setError(null);
  }

  function setDocsForKind(kind: DocumentKind, list: DocumentRef[]) {
    setDocs((prev) => ({ ...prev, [kind]: list }));
  }

  async function start() {
    if (!canStart || starting) return;
    setStarting(true);
    setError(null);
    try {
      const documentRefs = docsAvailable
        ? [...docs.job_description, ...docs.resume, ...docs.question_list, ...docs.other]
        : [];
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          topic: topic.trim(),
          documentRefs,
          ...(mode === "pitch" ? { pitchTimeLimitSec: pitchLimit } : {}),
        }),
      });
      const data = await res.json();
      if (data.session) {
        router.push(`/session/${data.session.id}`);
      } else {
        setError(data.error || "Couldn't start session");
        setStarting(false);
      }
    } catch {
      setError("Couldn't reach the server.");
      setStarting(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
      <p className="font-mono text-xs tracking-[0.25em] text-verdigris-400 uppercase">Choose a room</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MODES.map((m) => {
          const selected = mode === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => selectMode(m)}
              aria-pressed={selected}
              className={`rounded-xl border p-4 text-left transition ${
                selected
                  ? "border-ember-500 bg-ember-500/10"
                  : "border-hairline bg-ink-800 hover:border-verdigris-500/50"
              }`}
            >
              <span className={`font-display text-lg ${selected ? "text-ember-400" : "text-parchment-100"}`}>
                {MODE_CONFIG[m].label}
              </span>
              <p className="mt-1 text-sm text-parchment-500">{MODE_CONFIG[m].tagline}</p>
            </button>
          );
        })}
      </div>

      <div key={mode} className="transcript-line mt-10">
        <h1 className="font-display text-3xl text-parchment-100">{config.headline}</h1>
        <p className="mt-2 text-parchment-500">{config.subcopy}</p>
      </div>

      {mode === "pitch" && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs tracking-wide text-parchment-500 uppercase">Time budget</span>
          {PITCH_TIME_LIMITS_SEC.map((sec) => (
            <button
              key={sec}
              type="button"
              onClick={() => setPitchLimit(sec)}
              aria-pressed={pitchLimit === sec}
              className={`rounded-full border px-3 py-1 font-mono text-xs transition ${
                pitchLimit === sec
                  ? "border-ember-500 bg-ember-500/10 text-ember-400"
                  : "border-hairline text-parchment-500 hover:border-verdigris-500/50"
              }`}
            >
              {formatLimit(sec)}
            </button>
          ))}
        </div>
      )}

      <textarea
        className="mt-6 w-full rounded-xl border border-hairline bg-ink-800 p-3 text-sm text-parchment-100 placeholder:text-parchment-500/60 focus:border-ember-500"
        rows={3}
        placeholder={config.placeholder}
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
      />

      <div className="mt-3 flex flex-wrap gap-2">
        {config.starters.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setTopic(s)}
            className="rounded-full border border-hairline px-3 py-1 font-mono text-xs text-parchment-500 transition hover:border-verdigris-500/60 hover:text-verdigris-400"
          >
            {s}
          </button>
        ))}
      </div>

      {docsAvailable && (
        <>
          <button
            type="button"
            onClick={() => setShowDocs((v) => !v)}
            className="mt-6 text-left text-sm text-verdigris-400 underline decoration-verdigris-500/40 underline-offset-2 hover:text-verdigris-300"
          >
            {showDocs ? "Hide" : "Add context — job description, resume, questions (optional)"}
          </button>

          {showDocs && (
            <div className="mt-3 space-y-3">
              {DOC_SLOTS.map((slot) => (
                <DocSlot
                  key={slot.kind}
                  kind={slot.kind}
                  label={slot.label}
                  docs={docs[slot.kind]}
                  onChange={setDocsForKind}
                />
              ))}
            </div>
          )}
        </>
      )}

      {error && <p className="mt-4 text-sm text-rust-400">{error}</p>}

      <button
        type="button"
        onClick={start}
        disabled={!canStart || starting}
        className="mt-8 rounded-full bg-ember-500 px-6 py-3 font-medium text-ink-950 transition hover:bg-ember-400 disabled:opacity-40"
      >
        {starting ? "Starting…" : "Start talking →"}
      </button>
    </main>
  );
}
