import type { StrengthSummary } from "@/lib/progress";

/**
 * The identity-style framing for lib/progress.ts's getStrengthSummary — pure
 * display, no interactivity needed, so this stays a plain Server Component
 * like the rest of the insights page.
 */
export function StrengthCallout({ summary, modeContext }: { summary: StrengthSummary; modeContext?: string | null }) {
  return (
    <div className="rounded-xl border border-ember-500/30 bg-ember-500/5 p-5">
      <p className="font-mono text-xs tracking-[0.15em] text-ember-400 uppercase">Your strength</p>
      <h2 className="mt-1 font-display text-xl text-parchment-100">{summary.title}</h2>
      <p className="mt-1 text-sm text-parchment-300">{summary.headline}</p>
      {modeContext && <p className="mt-1 text-sm text-parchment-500">{modeContext}</p>}
      {summary.growthLine && <p className="mt-2 text-sm text-parchment-500">{summary.growthLine}</p>}
    </div>
  );
}
