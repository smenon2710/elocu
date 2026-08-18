import Link from "next/link";
import { notFound } from "next/navigation";
import { listAttemptsForGoal } from "@/lib/store";
import { MODE_LABELS } from "@/lib/progress";
import { TrendLineChart } from "@/app/components/charts/TrendLineChart";
import type { FeedbackSection, FeedbackSections } from "@/lib/types";

function sectionAverage(sections: FeedbackSections): number {
  const scores = Object.values(sections)
    .filter((s): s is FeedbackSection => !!s)
    .map((s) => s.score);
  return scores.reduce((sum, n) => sum + n, 0) / scores.length;
}

/**
 * Every graded attempt at the same named thing ("Pitch to Dale Carnegie"),
 * oldest first — the answer to "am I actually getting better at THIS," which
 * the global /app/insights trend (averaged across every topic) can't show.
 */
export default async function GoalPage({ params }: { params: Promise<{ label: string }> }) {
  const { label: encodedLabel } = await params;
  const label = decodeURIComponent(encodedLabel);
  const attempts = await listAttemptsForGoal(label);

  if (attempts.length === 0) notFound();

  const trend = attempts.map((a) => ({
    sessionId: a.sessionId,
    createdAt: a.createdAt,
    average: sectionAverage(a.sections),
  }));
  const first = trend[0].average;
  const latest = trend[trend.length - 1].average;
  const overallChange = latest - first;

  return (
    <main className="mx-auto max-w-2xl p-8">
      <p className="font-mono text-xs tracking-[0.25em] text-verdigris-400 uppercase">Practice goal</p>
      <h1 className="mt-2 font-display text-3xl text-parchment-100">{label}</h1>
      <p className="mt-1 text-parchment-500">
        {attempts.length} graded attempt{attempts.length === 1 ? "" : "s"}
        {attempts.length > 1 && (
          <>
            {" "}
            — {overallChange > 0 ? "+" : ""}
            {overallChange.toFixed(1)} from first to latest
          </>
        )}
      </p>

      {trend.length >= 2 ? (
        <section className="mt-8">
          <h2 className="font-display text-lg text-parchment-100">Score over time</h2>
          <div className="mt-3 rounded-xl border border-hairline bg-ink-800 p-4">
            <TrendLineChart points={trend} />
          </div>
        </section>
      ) : (
        <p className="mt-8 font-mono text-sm text-parchment-500/70">
          Practice this goal again to start seeing a trend.
        </p>
      )}

      <section className="mt-8">
        <h2 className="font-display text-lg text-parchment-100">Every attempt</h2>
        <div className="mt-3 space-y-2">
          {[...attempts].reverse().map((a) => (
            <Link
              key={a.sessionId}
              href={`/session/${a.sessionId}/feedback`}
              className="flex items-center justify-between rounded-lg border border-hairline bg-ink-800 px-4 py-3 transition hover:border-verdigris-500/50"
            >
              <div>
                <span className="text-sm text-parchment-100">{new Date(a.createdAt).toLocaleDateString()}</span>
                <span className="ml-2 font-mono text-xs text-parchment-500 uppercase">{MODE_LABELS[a.mode]}</span>
              </div>
              <span className="font-mono text-sm text-ember-400" style={{ fontVariantNumeric: "tabular-nums" }}>
                {sectionAverage(a.sections).toFixed(1)} / 5
              </span>
            </Link>
          ))}
        </div>
      </section>

      <Link
        href="/app"
        className="mt-8 inline-block font-mono text-xs tracking-wide text-verdigris-400 uppercase underline decoration-verdigris-500/40 underline-offset-2 hover:text-verdigris-300"
      >
        Start a new session
      </Link>
    </main>
  );
}
