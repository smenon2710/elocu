"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { METRIC_OPTIONS, MODE_OPTIONS, SECTION_OPTIONS, metricOption } from "@/app/components/objectiveTargetOptions";
import { TrendArrow } from "@/app/components/TrendArrow";
import type { ObjectiveProgress, ObjectiveTargetProgress } from "@/lib/objectives";
import type { ObjectiveSuggestion } from "@/lib/objectiveSuggestion";
import type { Objective, ObjectiveMetric, ObjectiveTarget, SessionMode } from "@/lib/types";

interface RawTarget {
  id?: string;
  metric: ObjectiveMetric;
  mode: SessionMode | null;
  sectionKey: string | null;
  targetValue: number;
}

function formatValue(value: number, unit: "score" | "wpm" | "%"): string {
  if (unit === "score") return `${value.toFixed(1)}/5`;
  if (unit === "wpm") return `${Math.round(value)} wpm`;
  return `${value.toFixed(0)}%`;
}

const METRIC_LABELS: Record<string, string> = {
  overallScore: "Overall score",
  wpm: "Speaking pace",
  fillerPct: "Filler words",
  hedgePct: "Hedging words",
  ttrPct: "Vocabulary diversity",
  talkTimePct: "Talk time",
  questionRatePct: "Asking a question back",
  pitchOnTargetPct: "Landing Pitch on time",
};
const SECTION_LABELS: Record<string, string> = {
  structure: "Structure",
  delivery: "Delivery",
  content: "Content",
  engagement: "Engagement",
  contextFit: "Context Fit",
  argumentation: "Argumentation",
};
const MODE_LABELS: Record<string, string> = {
  interview: "Interview",
  conversation: "Conversation",
  speech: "Speech",
  orator: "Orator",
  debate: "Debate",
  pitch: "Pitch",
};

// Always states the mode explicitly — including "(any mode)" when there
// isn't one — rather than omitting it when unscoped. Leaving it blank meant
// the card never actually answered "which mode should I be practicing this
// in," which was the whole point of showing a mode at all.
function targetLabel(t: { metric: ObjectiveMetric; mode: SessionMode | null; sectionKey: string | null }): string {
  const metricLabel = t.metric === "sectionScore" && t.sectionKey ? SECTION_LABELS[t.sectionKey] : METRIC_LABELS[t.metric];
  const modeSuffix = t.mode ? ` in ${MODE_LABELS[t.mode]}` : " (any mode)";
  return `${metricLabel}${modeSuffix}`;
}

function suggestionLabel(s: ObjectiveSuggestion): string {
  return `${targetLabel(s)} → ${formatValue(s.targetValue, s.metric === "overallScore" || s.metric === "sectionScore" ? "score" : s.metric === "wpm" ? "wpm" : "%")}`;
}

/** Same underlying thing being tracked, regardless of targetValue — used to keep a suggestion from showing again once it's already a real target. */
function sameShape(
  a: { metric: ObjectiveMetric; mode: SessionMode | null; sectionKey: string | null },
  b: { metric: ObjectiveMetric; mode: SessionMode | null; sectionKey: string | null }
): boolean {
  return a.metric === b.metric && a.mode === b.mode && a.sectionKey === b.sectionKey;
}

/** Inline editor for one target — used both for adding a new one and editing an existing one. */
function TargetEditor({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: ObjectiveTarget | null;
  onSave: (t: RawTarget) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [metricKey, setMetricKey] = useState<ObjectiveMetric>(initial?.metric ?? "overallScore");
  const [mode, setMode] = useState<SessionMode | "">(initial?.mode ?? "");
  const [sectionKey, setSectionKey] = useState<string>(initial?.sectionKey ?? "structure");
  const [targetValue, setTargetValue] = useState<number>(initial?.targetValue ?? metricOption(metricKey).defaultTarget);

  const metric = metricOption(metricKey);
  const showModePicker = !metric.lockedMode;

  return (
    <div className="space-y-2 rounded-lg border border-verdigris-500/30 bg-ink-900 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={metricKey}
          onChange={(e) => {
            const next = e.target.value as ObjectiveMetric;
            setMetricKey(next);
            setTargetValue(metricOption(next).defaultTarget);
          }}
          className="rounded-full border border-hairline bg-ink-800 px-3 py-1.5 text-xs text-parchment-300 outline-none focus:border-ember-500"
        >
          {METRIC_OPTIONS.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>

        {metric.needsSection && (
          <select
            value={sectionKey}
            onChange={(e) => setSectionKey(e.target.value)}
            className="rounded-full border border-hairline bg-ink-800 px-3 py-1.5 text-xs text-parchment-300 outline-none focus:border-ember-500"
          >
            {SECTION_OPTIONS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        )}

        {showModePicker && (
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as SessionMode | "")}
            className="rounded-full border border-hairline bg-ink-800 px-3 py-1.5 text-xs text-parchment-300 outline-none focus:border-ember-500"
          >
            <option value="">All modes</option>
            {MODE_OPTIONS.map((m) => (
              <option key={m.key} value={m.key}>
                Only {m.label}
              </option>
            ))}
          </select>
        )}

        <label className="flex items-center gap-1.5 font-mono text-xs text-parchment-500">
          Target
          <input
            type="number"
            step="0.1"
            value={targetValue}
            onChange={(e) => setTargetValue(Number(e.target.value))}
            className="w-20 rounded-full border border-hairline bg-ink-800 px-2 py-1 text-parchment-100 outline-none focus:border-ember-500"
          />
        </label>
        <span className="font-mono text-[11px] text-parchment-500/70">{metric.targetHint}</span>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() =>
            onSave({
              id: initial?.id,
              metric: metricKey,
              mode: showModePicker && mode ? mode : null,
              sectionKey: metricKey === "sectionScore" ? sectionKey : null,
              targetValue,
            })
          }
          className="rounded-full bg-ember-500 px-3 py-1 font-mono text-[11px] font-medium text-ink-950 transition hover:bg-ember-400 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-hairline px-3 py-1 font-mono text-[11px] text-parchment-500 transition hover:border-rust-500/60 hover:text-rust-400"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function TargetRow({
  tp,
  onEdit,
  onRemove,
  busy,
}: {
  tp: ObjectiveTargetProgress;
  onEdit: () => void;
  onRemove: () => void;
  busy: boolean;
}) {
  const hasData = tp.currentValue !== null && tp.progressPct !== null;
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-ember-400">{targetLabel(tp.target)}</span>
        <span className="flex items-center gap-2 font-mono text-[11px]">
          <button type="button" onClick={onEdit} disabled={busy} className="text-parchment-500/60 transition hover:text-verdigris-400">
            edit
          </button>
          <button type="button" onClick={onRemove} disabled={busy} className="text-parchment-500/60 transition hover:text-rust-400">
            ×
          </button>
        </span>
      </div>

      {hasData ? (
        <>
          <div className="mt-1 flex items-center justify-between font-mono text-xs text-parchment-500">
            <span>
              {formatValue(tp.currentValue!, tp.unit)} now &rarr; {formatValue(tp.target.targetValue, tp.unit)} goal
            </span>
            <span className="flex items-center gap-1.5 text-parchment-100">
              {Math.round(tp.progressPct!)}%
              <TrendArrow trend={tp.trend} />
            </span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-ink-900">
            <div className="h-2 rounded-full bg-ember-500 transition-all" style={{ width: `${Math.max(tp.progressPct!, 3)}%` }} />
          </div>
          <p className="mt-1 font-mono text-[11px] text-parchment-500/70">
            based on {tp.sampleCount} session{tp.sampleCount === 1 ? "" : "s"}
          </p>
        </>
      ) : (
        <p className="mt-1 font-mono text-xs text-parchment-500/70">No qualifying sessions yet for this target.</p>
      )}

      {tp.advice && (
        <p className="mt-2 text-sm text-parchment-300">
          <span className="font-medium text-ember-400">Move toward it: </span>
          {tp.advice}
        </p>
      )}
    </div>
  );
}

/**
 * One tracked goal (see lib/objectives.ts): zero or more independent
 * targets, each addable, editable, and removable on its own — a suggestion
 * (lib/objectiveSuggestion.ts) is just a pre-filled target that gets added
 * alongside whatever's already there, not a replacement for it. `progress`
 * is computed server-side per target and passed in as plain data.
 */
export function ObjectiveCard({ objective, progress }: { objective: Objective; progress: ObjectiveProgress }) {
  const router = useRouter();
  const [removingGoal, setRemovingGoal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<ObjectiveSuggestion[] | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  // Derived, not stored: re-checked against the real current target list on
  // every render, so a suggestion that was already applied (this session or
  // a prior one — objective.targets is the freshest server data after any
  // router.refresh()) never lingers as "still addable," and there's nothing
  // to keep in sync by hand.
  const visibleSuggestions = suggestions?.filter((s) => !objective.targets.some((t) => sameShape(s, t))) ?? null;

  async function removeGoal() {
    setRemovingGoal(true);
    await fetch(`/api/objectives/${objective.id}`, { method: "DELETE" }).catch(() => {});
    router.refresh();
  }

  function currentRawTargets(): RawTarget[] {
    return progress.targets.map((tp) => ({
      id: tp.target.id,
      metric: tp.target.metric,
      mode: tp.target.mode,
      sectionKey: tp.target.sectionKey,
      targetValue: tp.target.targetValue,
    }));
  }

  async function saveTargets(nextTargets: RawTarget[]) {
    setBusy(true);
    try {
      await fetch(`/api/objectives/${objective.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targets: nextTargets }),
      });
      setEditingId(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function saveEdited(id: string, edited: RawTarget) {
    saveTargets(currentRawTargets().map((t) => (t.id === id ? edited : t)));
  }

  function addTarget(newTarget: RawTarget) {
    saveTargets([...currentRawTargets(), newTarget]);
  }

  function removeTarget(id: string) {
    saveTargets(currentRawTargets().filter((t) => t.id !== id));
  }

  async function fetchSuggestions() {
    setSuggesting(true);
    setSuggestError(null);
    try {
      const res = await fetch("/api/objectives/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: objective.title, note: objective.note, existingTargets: objective.targets }),
      });
      const data = await res.json();
      if (data.error) {
        setSuggestError(data.error);
      } else if (!data.suggestions || data.suggestions.length === 0) {
        setSuggestError("Couldn't generate suggestions right now — try again in a moment.");
      } else {
        setSuggestions(data.suggestions);
      }
    } catch {
      setSuggestError("Couldn't reach the server.");
    } finally {
      setSuggesting(false);
    }
  }

  function applySuggestion(s: ObjectiveSuggestion) {
    addTarget({ metric: s.metric, mode: s.mode, sectionKey: s.sectionKey, targetValue: s.targetValue });
  }

  return (
    <div className="rounded-xl border border-hairline bg-ink-800 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-base text-parchment-100">{objective.title}</h3>
          {objective.note && <p className="mt-0.5 text-xs text-parchment-500">{objective.note}</p>}
        </div>
        <button
          type="button"
          onClick={removeGoal}
          disabled={removingGoal}
          className="shrink-0 font-mono text-[11px] text-parchment-500/60 transition hover:text-rust-400"
          aria-label="Remove goal"
        >
          {removingGoal ? "…" : "×"}
        </button>
      </div>

      {progress.targets.length === 0 && progress.aspiration && (
        <p className="mt-3 font-mono text-xs text-parchment-500/70">
          {progress.aspiration.sampleCount === 0
            ? "No sessions yet — practice a session to start tracking this."
            : `Tracking ${progress.aspiration.sampleCount} session${progress.aspiration.sampleCount === 1 ? "" : "s"} so far — no fixed number yet.`}
        </p>
      )}
      {progress.targets.length === 0 && progress.aspiration?.advice && (
        <p className="mt-3 text-sm text-parchment-300">
          <span className="font-medium text-ember-400">Move toward it: </span>
          {progress.aspiration.advice}
        </p>
      )}

      <div className="mt-3 space-y-3">
        {progress.targets.map((tp) =>
          editingId === tp.target.id ? (
            <TargetEditor
              key={tp.target.id}
              initial={tp.target}
              saving={busy}
              onSave={(edited) => saveEdited(tp.target.id, edited)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div key={tp.target.id} className="border-t border-hairline/60 pt-3 first:border-t-0 first:pt-0">
              <TargetRow tp={tp} busy={busy} onEdit={() => setEditingId(tp.target.id)} onRemove={() => removeTarget(tp.target.id)} />
            </div>
          )
        )}
      </div>

      <div className="mt-3">
        {editingId === "new" ? (
          <TargetEditor initial={null} saving={busy} onSave={addTarget} onCancel={() => setEditingId(null)} />
        ) : (
          <button
            type="button"
            onClick={() => setEditingId("new")}
            className="rounded-full border border-hairline px-3 py-1 font-mono text-xs text-parchment-500 transition hover:border-verdigris-500/60 hover:text-verdigris-400"
          >
            + Add a target
          </button>
        )}
      </div>

      <div className="mt-3">
        {visibleSuggestions === null ? (
          <button
            type="button"
            onClick={fetchSuggestions}
            disabled={suggesting}
            className="rounded-full border border-verdigris-500/40 px-3 py-1 font-mono text-xs text-verdigris-400 transition hover:border-verdigris-500/70 disabled:opacity-40"
          >
            {suggesting ? "Thinking…" : "Suggest targets for me"}
          </button>
        ) : (
          <div className="space-y-2">
            {visibleSuggestions.length === 0 ? (
              <p className="font-mono text-xs text-parchment-500/70">
                All of that batch is already tracked as a target above.
              </p>
            ) : (
              visibleSuggestions.map((s, i) => (
                <div key={i} className="rounded-lg border border-hairline bg-ink-900 p-3">
                  <p className="font-mono text-xs text-ember-400">{suggestionLabel(s)}</p>
                  {s.rationale && <p className="mt-1 text-xs text-parchment-500">{s.rationale}</p>}
                  <button
                    type="button"
                    onClick={() => applySuggestion(s)}
                    disabled={busy}
                    className="mt-2 rounded-full bg-ember-500 px-3 py-1 font-mono text-[11px] font-medium text-ink-950 transition hover:bg-ember-400 disabled:opacity-40"
                  >
                    {busy ? "Adding…" : "Add this target"}
                  </button>
                </div>
              ))
            )}
            <button
              type="button"
              onClick={fetchSuggestions}
              disabled={suggesting}
              className="font-mono text-[11px] text-parchment-500/70 underline decoration-parchment-500/30 underline-offset-2 transition hover:text-verdigris-400 disabled:opacity-40"
            >
              {suggesting ? "Thinking…" : "↻ suggest again"}
            </button>
          </div>
        )}
        {suggestError && <p className="mt-1.5 text-xs text-rust-400">{suggestError}</p>}
      </div>
    </div>
  );
}
