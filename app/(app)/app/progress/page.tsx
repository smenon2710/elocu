import Link from "next/link";
import { listAllFeedback } from "@/lib/store";
import { computeProgressStats, MODE_LABELS } from "@/lib/progress";
import { CategoryBarChart } from "@/app/components/charts/CategoryBarChart";
import { TrendLineChart } from "@/app/components/charts/TrendLineChart";

function StatTile({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <div className="rounded-xl border p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-gray-900" style={{ fontVariantNumeric: "tabular-nums" }}>
        {value}
      </p>
      {caption && <p className="mt-1 text-xs text-gray-400">{caption}</p>}
    </div>
  );
}

export default async function ProgressPage() {
  const rows = await listAllFeedback();
  const stats = computeProgressStats(rows);

  if (stats.totalCompleted === 0) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <h1 className="text-2xl font-semibold">Your progress</h1>
        <p className="mt-2 text-gray-600">
          Finish a practice session to start seeing your progress here — scores, trends, and which
          modes you&apos;re strongest in.
        </p>
        <Link href="/app" className="mt-4 inline-block text-blue-600 underline">
          Start a session
        </Link>
      </main>
    );
  }

  const excludedCount = stats.totalCompleted - stats.validCount;
  const topMode = stats.modeAverages[0];

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">Your progress</h1>
      <p className="mt-1 text-gray-600">
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
        <section className="mt-8">
          <h2 className="font-medium text-gray-900">Score over time</h2>
          <div className="mt-3 rounded-xl border p-4">
            <TrendLineChart points={stats.trend} />
          </div>
        </section>
      ) : (
        <p className="mt-8 text-sm text-gray-400">
          Complete a few more sessions to see your trend over time.
        </p>
      )}

      <section className="mt-8">
        <h2 className="font-medium text-gray-900">Average score by section</h2>
        <div className="mt-3 rounded-xl border p-4">
          <CategoryBarChart data={stats.sectionAverages} />
        </div>
      </section>

      {stats.modeAverages.length > 1 && (
        <section className="mt-8">
          <h2 className="font-medium text-gray-900">Average score by mode</h2>
          <div className="mt-3 rounded-xl border p-4">
            <CategoryBarChart data={stats.modeAverages} />
          </div>
        </section>
      )}

      <Link href="/app" className="mt-8 inline-block text-blue-600 underline">
        Start a new session
      </Link>
    </main>
  );
}
