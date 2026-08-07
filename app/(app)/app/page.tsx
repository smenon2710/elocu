"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DocSlot } from "@/app/components/DocSlot";
import type { DocumentKind, DocumentRef, SessionMode } from "@/lib/types";

interface ModeConfig {
  label: string;
  headline: string;
  subcopy: string;
  placeholder: string;
  starters: string[];
  topicOptional?: boolean;
}

const MODE_CONFIG: Record<SessionMode, ModeConfig> = {
  interview: {
    label: "Interview",
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
    headline: "What position do you want to argue?",
    subcopy: "State your position — I'll argue the opposing side and push back on your reasoning.",
    placeholder: "e.g. Remote work is better than office work",
    starters: [
      "Remote work is better than office work.",
      "Standardized testing should be abolished.",
      "AI will create more jobs than it destroys.",
    ],
  },
};

// Ordered cheapest to priciest: Orator/Speech are capped at 1 exchange each
// (bounded, non-quadratic); Conversation/Debate/Interview share a 12-exchange
// cap and resend the full growing transcript every turn, with Interview last
// since an attached resume/JD/question-list resends on every turn too.
const MODES: SessionMode[] = ["orator", "speech", "conversation", "debate", "interview"];

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
        body: JSON.stringify({ mode, topic: topic.trim(), documentRefs }),
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
    <main className="mx-auto flex min-h-full max-w-xl flex-col justify-center p-6">
      <div className="flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => selectMode(m)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              mode === m ? "bg-blue-600 text-white" : "border text-gray-700 hover:bg-gray-50"
            }`}
          >
            {MODE_CONFIG[m].label}
          </button>
        ))}
      </div>

      <h1 className="mt-6 text-3xl font-semibold">{config.headline}</h1>
      <p className="mt-2 text-gray-600">{config.subcopy}</p>

      <textarea
        className="mt-6 w-full rounded-xl border p-3 text-sm"
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
            className="rounded-full border px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
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
            className="mt-6 text-left text-sm text-blue-600 underline"
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

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={start}
        disabled={!canStart || starting}
        className="mt-6 rounded-full bg-blue-600 px-6 py-3 text-white disabled:opacity-50"
      >
        {starting ? "Starting…" : "Start"}
      </button>
    </main>
  );
}
