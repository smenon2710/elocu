import Link from "next/link";
import { MODE_LABELS, type FocusArea } from "@/lib/progress";
import { TrendArrow } from "@/app/components/TrendArrow";

/**
 * The counterpart to StrengthCallout: which section to work on next, whether
 * that's a persistent pattern or a one-off, and the last concrete fix the
 * grader wrote for it — with a link back to the session it came from, so the
 * advice can be read next to the moment it's about.
 */
export function FocusCallout({ focus }: { focus: FocusArea }) {
  const persistent = focus.recentWindow >= 3 && focus.recentLowestCount / focus.recentWindow >= 0.6;
  return (
    <div className="rounded-xl border border-verdigris-500/30 bg-verdigris-500/5 p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-xs tracking-[0.15em] text-verdigris-400 uppercase">Focus next</p>
        <TrendArrow trend={focus.trend} />
      </div>
      <h2 className="mt-1 font-display text-xl text-parchment-100">{focus.label}</h2>
      <p className="mt-1 text-sm text-parchment-300">
        Averaging {focus.average.toFixed(1)}/5 — your lowest section.
        {focus.recentWindow > 0 && (
          <>
            {" "}
            {persistent
              ? `It was your lowest in ${focus.recentLowestCount} of your last ${focus.recentWindow} sessions, so this is a pattern, not a one-off.`
              : `Lowest in ${focus.recentLowestCount} of your last ${focus.recentWindow} sessions.`}
          </>
        )}
      </p>
      {focus.latestFix && (
        <div className="mt-3 rounded-lg border border-hairline bg-ink-900/60 p-3 text-sm text-parchment-300">
          <span className="font-medium text-ember-400">Latest advice: </span>
          {focus.latestFix}
          {focus.latestFixSessionId && (
            <Link
              href={`/session/${focus.latestFixSessionId}/feedback`}
              className="mt-2 block font-mono text-xs text-verdigris-400 underline decoration-verdigris-500/40 underline-offset-2 hover:text-verdigris-300"
            >
              See it in context{focus.latestFixMode ? ` (${MODE_LABELS[focus.latestFixMode]} session)` : ""}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
