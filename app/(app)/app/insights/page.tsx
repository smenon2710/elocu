import Link from "next/link";
import {
  computeConversationDynamicsStats,
  computeDeliveryMetricStats,
  computePitchTimingStats,
  computeProgressStats,
  distinctModes,
  MODE_LABELS,
  type CategoryAverage,
} from "@/lib/progress";
import { listAllFeedback } from "@/lib/store";
import type { SessionMode } from "@/lib/types";
import { CategoryBarChart } from "@/app/components/charts/CategoryBarChart";
import { TrendLineChart } from "@/app/components/charts/TrendLineChart";

const VALID_MODES: SessionMode[] = ["interview", "conversation", "speech", "orator", "debate", "pitch"];

function StatTile({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <div className="rounded-xl border border-hairline bg-ink-800 p-5">
      <p className="font-mono text-xs tracking-[0.15em] text-parchment-500 uppercase">{label}</p>
      <p className="mt-2 font-display text-3xl text-parchment-100" style={{ fontVariantNumeric: "tabular-nums" }}>
        {value}
      </p>
      {caption && <p className="mt-1 text-xs text-parchment-500">{caption}</p>}
    </div>
  );
}

function formatCategoryValue(d: CategoryAverage): string {
  if (d.unit === "wpm") return `${Math.round(d.average)}`;
  if (d.unit === "%") return `${d.average.toFixed(0)}%`;
  return d.average.toFixed(1);
}

/** Small stat-tile row for the delivery/conversation/pitch metric sections — distinct from the /5 score tiles above, since these are rates/counts, not scores. */
function MetricTile({ stat }: { stat: CategoryAverage }) {
  return (
    <div className="rounded-xl border border-hairline bg-ink-800 p-4">
      <p className="font-mono text-xs text-parchment-500">{stat.label}</p>
      <p className="mt-1 font-display text-2xl text-parchment-100" style={{ fontVariantNumeric: "tabular-nums" }}>
        {formatCategoryValue(stat)}
        {stat.unit === "wpm" && <span className="ml-1 text-base text-parchment-500">wpm</span>}
      </p>
      <p className="mt-1 font-mono text-xs text-parchment-500/70">{stat.count} session{stat.count === 1 ? "" : "s"}</p>
    </div>
  );
}

function TabLink({ href, active, children }: { href: string; active: boolean; children: string }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 font-mono text-xs transition ${
        active ? "border-ember-500 bg-ember-500/10 text-ember-400" : "border-hairline text-parchment-500 hover:border-verdigris-500/50"
      }`}
    >
      {children}
    </Link>
  );
}

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode: modeParam } = await searchParams;
  const allRows = await listAllFeedback();
  const availableModes = distinctModes(allRows);
  const selectedMode: SessionMode | null =
    modeParam && VALID_MODES.includes(modeParam as SessionMode) && availableModes.includes(modeParam as SessionMode)
      ? (modeParam as SessionMode)
      : null;

  if (allRows.length === 0) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <p className="font-mono text-xs tracking-[0.25em] text-verdigris-400 uppercase">Insights</p>
        <h1 className="mt-2 font-display text-3xl text-parchment-100">Your practice insights</h1>
        <p className="mt-2 text-parchment-500">
          Finish a practice session to start seeing insights here — scores, trends, pace, and which
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

  const rows = selectedMode ? allRows.filter((r) => r.mode === selectedMode) : allRows;
  const stats = computeProgressStats(rows);
  const excludedCount = stats.totalCompleted - stats.validCount;
  const topMode = stats.modeAverages[0];
  const bestSection = stats.sectionAverages[0];

  const deliveryStats = computeDeliveryMetricStats(rows);
  const deliveryTiles = [deliveryStats.wpm, deliveryStats.fillerPct, deliveryStats.hedgePct, deliveryStats.ttrPct].filter(
    (s): s is CategoryAverage => s !== null
  );

  const conversationStats = selectedMode === "conversation" ? computeConversationDynamicsStats(rows) : null;
  const conversationTiles = conversationStats
    ? [conversationStats.talkTimePct, conversationStats.questionRatePct].filter((s): s is CategoryAverage => s !== null)
    : [];

  const pitchStats = selectedMode === "pitch" ? computePitchTimingStats(rows) : null;

  return (
    <main className="mx-auto max-w-3xl p-8">
      <p className="font-mono text-xs tracking-[0.25em] text-verdigris-400 uppercase">Insights</p>
      <h1 className="mt-2 font-display text-3xl text-parchment-100">Your practice insights</h1>
      <p className="mt-1 text-parchment-500">
        Across {stats.validCount} graded session{stats.validCount === 1 ? "" : "s"}
        {excludedCount > 0
          ? ` (${excludedCount} more excluded — grading didn't fully succeed for ${excludedCount === 1 ? "it" : "them"})`
          : ""}
        .
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <TabLink href="/app/insights" active={!selectedMode}>
          All
        </TabLink>
        {availableModes.map((m) => (
          <TabLink key={m} href={`/app/insights?mode=${m}`} active={selectedMode === m}>
            {MODE_LABELS[m]}
          </TabLink>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatTile
          label="Overall average"
          value={stats.overallAverage !== null ? `${stats.overallAverage.toFixed(1)} / 5` : "—"}
        />
        <StatTile label="Sessions completed" value={String(stats.totalCompleted)} />
        {selectedMode ? (
          <StatTile
            label="Best section"
            value={bestSection ? bestSection.label : "—"}
            caption={bestSection ? `${bestSection.average.toFixed(1)} / 5 avg` : undefined}
          />
        ) : (
          <StatTile
            label="Strongest mode"
            value={topMode ? MODE_LABELS[topMode.key as SessionMode] : "—"}
            caption={topMode ? `${topMode.average.toFixed(1)} / 5 avg` : undefined}
          />
        )}
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
          {selectedMode
            ? `Practice ${MODE_LABELS[selectedMode]} a few more times to see a trend for it.`
            : "Complete a few more sessions to see your trend over time."}
        </p>
      )}

      <section className="mt-10">
        <h2 className="font-display text-lg text-parchment-100">Average score by section</h2>
        <div className="mt-3 rounded-xl border border-hairline bg-ink-800 p-4">
          <CategoryBarChart data={stats.sectionAverages} />
        </div>
      </section>

      {!selectedMode && stats.modeAverages.length > 1 && (
        <section className="mt-10">
          <h2 className="font-display text-lg text-parchment-100">Average score by mode</h2>
          <div className="mt-3 rounded-xl border border-hairline bg-ink-800 p-4">
            <CategoryBarChart data={stats.modeAverages} />
          </div>
        </section>
      )}

      {deliveryTiles.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-lg text-parchment-100">Delivery</h2>
          <p className="mt-1 text-sm text-parchment-500">
            Real pace and word-choice data, measured from your actual transcripts — not LLM-judged.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {deliveryTiles.map((stat) => (
              <MetricTile key={stat.key} stat={stat} />
            ))}
          </div>
        </section>
      )}

      {conversationTiles.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-lg text-parchment-100">Conversation dynamics</h2>
          <p className="mt-1 text-sm text-parchment-500">
            How much of the talking was you, and how often you asked something back.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {conversationTiles.map((stat) => (
              <MetricTile key={stat.key} stat={stat} />
            ))}
          </div>
        </section>
      )}

      {pitchStats && pitchStats.avgDiffSec !== null && (
        <section className="mt-10">
          <h2 className="font-display text-lg text-parchment-100">Pitch timing</h2>
          <p className="mt-1 text-sm text-parchment-500">How close your attempts land to the time budget you set.</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-hairline bg-ink-800 p-4">
              <p className="font-mono text-xs text-parchment-500">On average</p>
              <p className="mt-1 font-display text-2xl text-parchment-100">
                {pitchStats.avgDiffSec > 0 ? "+" : ""}
                {Math.round(pitchStats.avgDiffSec)}s
              </p>
              <p className="mt-1 font-mono text-xs text-parchment-500/70">
                {pitchStats.avgDiffSec > 0 ? "over budget" : pitchStats.avgDiffSec < 0 ? "under budget" : "right on budget"}
              </p>
            </div>
            <div className="rounded-xl border border-hairline bg-ink-800 p-4">
              <p className="font-mono text-xs text-parchment-500">Landed on target</p>
              <p className="mt-1 font-display text-2xl text-parchment-100">
                {pitchStats.onTargetRatePct !== null ? `${pitchStats.onTargetRatePct.toFixed(0)}%` : "—"}
              </p>
              <p className="mt-1 font-mono text-xs text-parchment-500/70">{pitchStats.count} pitch{pitchStats.count === 1 ? "" : "es"}</p>
            </div>
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
