import Link from "next/link";
import { listAllFeedback } from "@/lib/store";
import { computeProgressStats, MODE_LABELS } from "@/lib/progress";
import { CategoryBarChart } from "@/app/components/charts/CategoryBarChart";
import { TrendLineChart } from "@/app/components/charts/TrendLineChart";

function StatTile({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <div className="rounded-xl border border-hairline bg-ink-800 p-5">
      <p className="font-mono text-xs tracking-[0.15em] text-parchment-500 uppercase">{label}</p>
      <p
        className="mt-2 font-display text-3xl text-parchment-100"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </p>
      {caption && <p className="mt-1 text-xs text-parchment-500">{caption}</p>}
    </div>
  );
}

export default async function ProgressPage() {
  const rows = await listAllFeedback();
  const stats = computeProgressStats(rows);

  if (stats.totalCompleted === 0) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <p className="font-mono text-xs tracking-[0.25em] text-verdigris-400 uppercase">Progress</p>
        <h1 className="mt-2 font-display text-3xl text-parchment-100">Your progress</h1>
        <p className="mt-2 text-parchment-500">
          Finish a practice session to start seeing your progress here — scores, trends, and which
          modes you&apos;re strongest in.
        </p>
        <Link
          href="/app"
          className="mt-4 inline-block text-verdigris-400 underline decoration-verdigris-500/40 underline-offset-2 hover:text-verdigris-300"
        >
          Start a session
        </Link>
      </main>
    );
  }

  const excludedCount = stats.totalCompleted - stats.validCount;
  const topMode = stats.modeAverages[0];

  return (
    <main className="mx-auto max-w-3xl p-8">
      <p className="font-mono text-xs tracking-[0.25em] text-verdigris-400 uppercase">Progress</p>
      <h1 className="mt-2 font-display text-3xl text-parchment-100">Your progress</h1>
      <p className="mt-2 text-parchment-500">
        Across {stats.validCount} graded session{stats.validCount === 1 ? "" : "s"}
        {excludedCount > 0
          ? ` (${excludedCount} more excluded — grading didn't fully succeed for ${excludedCount === 1 ? "it" : "them"})`
          : ""}
        .
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatTile
          label="Overall average"
          value={stats.overallAverage !== null ? `${stats.overallAverage.toFixed(1)} / 5` : "—"}
        />
        <StatTile label="Sessions completed" value={String(stats.totalCompleted)} />
        <StatTile
          label="Strongest mode"
          value={topMode ? MODE_LABELS[topMode.key as keyof typeof MODE_LABELS] : "—"}
          caption={topMode ? `${topMode.average.toFixed(1)} / 5 avg` : undefined}
        />
      </div>

      {stats.trend.length >= 2 ? (
        <section className="mt-10">
          <h2 className="font-display text-lg text-parchment-100">Score over time</h2>
          <div className="mt-3 rounded-xl border border-hairline bg-ink-800 p-4">
            <TrendLineChart points={stats.trend} />
          </div>
        </section>
      ) : (
        <p className="mt-10 font-mono text-sm text-parchment-500/70">
          Complete a few more sessions to see your trend over time.
        </p>
      )}

      <section className="mt-10">
        <h2 className="font-display text-lg text-parchment-100">Average score by section</h2>
        <div className="mt-3 rounded-xl border border-hairline bg-ink-800 p-4">
          <CategoryBarChart data={stats.sectionAverages} />
        </div>
      </section>

      {stats.modeAverages.length > 1 && (
        <section className="mt-10">
          <h2 className="font-display text-lg text-parchment-100">Average score by mode</h2>
          <div className="mt-3 rounded-xl border border-hairline bg-ink-800 p-4">
            <CategoryBarChart data={stats.modeAverages} />
          </div>
        </section>
      )}

      <Link
        href="/app"
        className="mt-10 inline-block font-mono text-xs tracking-wide text-verdigris-400 uppercase underline decoration-verdigris-500/40 underline-offset-2 hover:text-verdigris-300"
      >
        Start a new session
      </Link>
    </main>
  );
}
