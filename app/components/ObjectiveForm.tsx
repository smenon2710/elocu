"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { METRIC_OPTIONS, MODE_OPTIONS, SECTION_OPTIONS, metricOption } from "@/app/components/objectiveTargetOptions";
import type { ObjectiveMetric, SessionMode } from "@/lib/types";

/**
 * Creates a new Objective (see lib/types.ts / lib/objectives.ts) — either a
 * hard number to track, a free-text aspiration, or both, per the explicit
 * "user's choice at setup" decision. Lives on /app/insights rather than the
 * session-start flow, so setting a goal stays optional and never adds
 * friction to the app's "no setup screen" identity. Only ever sends 0 or 1
 * initial targets — more can be added, edited, or removed later from the
 * goal's own card (ObjectiveCard.tsx), which is where multi-target editing
 * actually lives.
 */
export function ObjectiveForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [hasTarget, setHasTarget] = useState(true);
  const [metricKey, setMetricKey] = useState<ObjectiveMetric>("overallScore");
  const [mode, setMode] = useState<SessionMode | "">("");
  const [sectionKey, setSectionKey] = useState("structure");
  const [targetValue, setTargetValue] = useState<number>(4);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const metric = metricOption(metricKey);
  const showModePicker = hasTarget && !metric.lockedMode;

  function reset() {
    setTitle("");
    setNote("");
    setHasTarget(true);
    setMetricKey("overallScore");
    setMode("");
    setSectionKey("structure");
    setTargetValue(4);
    setOpen(false);
  }

  async function submit() {
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/objectives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          note: note.trim() || null,
          targets: hasTarget
            ? [
                {
                  metric: metricKey,
                  mode: showModePicker && mode ? mode : null,
                  sectionKey: metricKey === "sectionScore" ? sectionKey : null,
                  targetValue,
                },
              ]
            : [],
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setSubmitting(false);
        return;
      }
      reset();
      setSubmitting(false);
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-hairline px-3 py-1 font-mono text-xs text-parchment-500 transition hover:border-verdigris-500/60 hover:text-verdigris-400"
      >
        + Add a goal
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-hairline bg-ink-800 p-4">
      <input
        autoFocus
        className="w-full rounded-lg border border-hairline bg-ink-900 px-3 py-2 text-sm text-parchment-100 placeholder:text-parchment-500/60 focus:border-ember-500"
        placeholder='Goal title, e.g. "Nail my Google interview"'
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="w-full rounded-lg border border-hairline bg-ink-900 px-3 py-2 text-sm text-parchment-100 placeholder:text-parchment-500/60 focus:border-ember-500"
        rows={2}
        placeholder="Optional note — any extra context (e.g. a deadline)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      <div className="flex flex-wrap gap-2 font-mono text-xs">
        <button
          type="button"
          onClick={() => setHasTarget(false)}
          aria-pressed={!hasTarget}
          className={`rounded-full border px-3 py-1 transition ${!hasTarget ? "border-ember-500 bg-ember-500/10 text-ember-400" : "border-hairline text-parchment-500"}`}
        >
          Just a note, no fixed number
        </button>
        <button
          type="button"
          onClick={() => setHasTarget(true)}
          aria-pressed={hasTarget}
          className={`rounded-full border px-3 py-1 transition ${hasTarget ? "border-ember-500 bg-ember-500/10 text-ember-400" : "border-hairline text-parchment-500"}`}
        >
          Track a number
        </button>
      </div>

      {hasTarget && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={metricKey}
            onChange={(e) => {
              const next = e.target.value as ObjectiveMetric;
              setMetricKey(next);
              setTargetValue(metricOption(next).defaultTarget);
            }}
            className="rounded-full border border-hairline bg-ink-900 px-3 py-1.5 text-xs text-parchment-300 outline-none focus:border-ember-500"
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
              className="rounded-full border border-hairline bg-ink-900 px-3 py-1.5 text-xs text-parchment-300 outline-none focus:border-ember-500"
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
              className="rounded-full border border-hairline bg-ink-900 px-3 py-1.5 text-xs text-parchment-300 outline-none focus:border-ember-500"
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
              className="w-20 rounded-full border border-hairline bg-ink-900 px-2 py-1 text-parchment-100 outline-none focus:border-ember-500"
            />
          </label>
          <span className="font-mono text-[11px] text-parchment-500/70">{metric.targetHint}</span>
        </div>
      )}

      {error && <p className="text-xs text-rust-400">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!title.trim() || submitting}
          className="rounded-full bg-ember-500 px-4 py-1.5 text-xs font-medium text-ink-950 transition hover:bg-ember-400 disabled:opacity-40"
        >
          {submitting ? "Adding…" : "Add goal"}
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded-full border border-hairline px-4 py-1.5 text-xs text-parchment-500 transition hover:border-rust-500/60 hover:text-rust-400"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
