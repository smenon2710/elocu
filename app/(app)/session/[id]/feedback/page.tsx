import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Metric } from "@/app/components/Metric";
import { RetryGradingButton } from "@/app/components/RetryGradingButton";
import { computeContentMetrics } from "@/lib/contentMetrics";
import { computeConversationMetrics } from "@/lib/conversationMetrics";
import { computeDeliveryMetrics } from "@/lib/deliveryMetrics";
import { computePitchTiming } from "@/lib/pitchMetrics";
import { METRIC_TOOLTIPS } from "@/lib/metricDefinitions";
import { getFeedback, getPreviousAttemptForGoal, getSession } from "@/lib/store";
import type { FeedbackSection, FeedbackSections, Session } from "@/lib/types";

const SECTION_LABELS: Record<string, string> = {
  structure: "Structure",
  delivery: "Delivery",
  content: "Content",
  engagement: "Engagement",
  contextFit: "Context Fit",
  argumentation: "Argumentation",
};

function formatClock(ms: number): string {
  const totalSec = Math.round(Math.max(ms, 0) / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Derived straight from the turn's real startTs/endTs (see
 * app/api/sessions/[id]/messages/route.ts), not from the LLM's grading pass —
 * so this stays accurate even when grading fails or falls back to
 * placeholders.
 */
function PitchTiming({ session }: { session: Session }) {
  const timing = computePitchTiming(session);
  if (!timing) return null;
  const { actualSec, targetSec, diffSec } = timing;
  const tone = diffSec > 0 ? "text-rust-400" : diffSec < 0 ? "text-verdigris-400" : "text-ember-400";
  const note = diffSec > 0 ? `${diffSec}s over` : diffSec < 0 ? `${-diffSec}s under` : "right on target";

  return (
    <p className="mt-3 font-mono text-sm text-parchment-500">
      Delivered in{" "}
      <Metric tooltip={METRIC_TOOLTIPS.pitchTiming}>
        <span className={tone}>
          {formatClock(actualSec * 1000)} / {formatClock(targetSec * 1000)}
        </span>{" "}
        — {note}
      </Metric>
    </p>
  );
}

/**
 * Real pace, filler-word, and hedging-word density, aggregated across every
 * user turn (see lib/deliveryMetrics.ts) — same measured data handed to the
 * grading prompt, shown here directly so it's visible even when grading
 * fails or a section falls back to a placeholder score.
 */
function DeliveryMetrics({ session }: { session: Session }) {
  const { wpm, fillerCount, fillerPct, hedgeCount, hedgePct } = computeDeliveryMetrics(session);
  if (wpm === null && fillerPct === null && hedgePct === null) return null;

  const parts: ReactNode[] = [];
  if (wpm !== null) {
    parts.push(
      <Metric key="wpm" tooltip={METRIC_TOOLTIPS.wpm}>
        {`${wpm} wpm`}
      </Metric>
    );
  }
  if (fillerPct !== null) {
    parts.push(
      <Metric key="filler" tooltip={METRIC_TOOLTIPS.filler}>
        {`${fillerCount} filler word${fillerCount === 1 ? "" : "s"} (${fillerPct.toFixed(1)}%)`}
      </Metric>
    );
  }
  if (hedgePct !== null) {
    parts.push(
      <Metric key="hedge" tooltip={METRIC_TOOLTIPS.hedge}>
        {`${hedgeCount} hedge word${hedgeCount === 1 ? "" : "s"} (${hedgePct.toFixed(1)}%)`}
      </Metric>
    );
  }

  return (
    <p className="mt-1 font-mono text-sm text-parchment-500">
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && " · "}
          {part}
        </span>
      ))}
    </p>
  );
}

/** Vocabulary diversity (see lib/contentMetrics.ts) — same always-accurate pattern as DeliveryMetrics above. */
function ContentMetrics({ session }: { session: Session }) {
  const { ttrPct } = computeContentMetrics(session);
  if (ttrPct === null) return null;
  return (
    <p className="mt-1 font-mono text-sm text-parchment-500">
      <Metric tooltip={METRIC_TOOLTIPS.ttr}>{`${ttrPct.toFixed(0)}% vocabulary diversity`}</Metric>
    </p>
  );
}

/** Talk-time & question rate, Conversation mode only (see lib/conversationMetrics.ts). */
function ConversationMetricsLine({ session }: { session: Session }) {
  if (session.mode !== "conversation") return null;
  const { talkTimePct, questionRatePct } = computeConversationMetrics(session);
  if (talkTimePct === null) return null;

  const parts: ReactNode[] = [
    <Metric key="talkTime" tooltip={METRIC_TOOLTIPS.talkTime}>
      {`${talkTimePct.toFixed(0)}% talk time`}
    </Metric>,
  ];
  if (questionRatePct !== null) {
    parts.push(
      <Metric key="questionRate" tooltip={METRIC_TOOLTIPS.questionRate}>
        {`asked a question back ${questionRatePct.toFixed(0)}% of turns`}
      </Metric>
    );
  }

  return (
    <p className="mt-1 font-mono text-sm text-parchment-500">
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && " · "}
          {part}
        </span>
      ))}
    </p>
  );
}

// The bar alone relied on color + fill, so the number is shown alongside it
// for anyone who can't easily tell the filled segments apart.
function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2" role="img" aria-label={`Score ${score} out of 5`}>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <div key={n} className={`h-2 w-5 rounded-full sm:w-6 ${n <= score ? "bg-ember-500" : "bg-ink-700"}`} />
        ))}
      </div>
      <span className="font-mono text-xs text-parchment-300 tabular-nums">{score}/5</span>
    </div>
  );
}

/** "+1" / "-1" / "±0" vs. the last graded attempt on the same goal (see lib/store.ts's getPreviousAttemptForGoal). */
function ScoreDelta({ diff }: { diff: number }) {
  if (diff === 0) return <span className="font-mono text-xs text-parchment-500">±0</span>;
  const tone = diff > 0 ? "text-verdigris-400" : "text-rust-400";
  return (
    <span className={`font-mono text-xs ${tone}`}>
      {diff > 0 ? "+" : ""}
      {diff}
    </span>
  );
}

export default async function FeedbackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [session, feedback] = await Promise.all([getSession(id), getFeedback(id)]);

  if (!session) notFound();

  if (!feedback) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <h1 className="font-display text-2xl text-parchment-100">Feedback isn&apos;t ready yet</h1>
        <p className="mt-2 text-parchment-500">
          This session hasn&apos;t been graded. Go back and either pause (get feedback so far,
          keep the session open) or end it (get final feedback).
        </p>
        <Link
          href={`/session/${id}`}
          className="mt-4 inline-block text-verdigris-400 underline decoration-verdigris-500/40 underline-offset-2 hover:text-verdigris-300"
        >
          Back to session
        </Link>
      </main>
    );
  }

  const stillOpen = session.endedAt === null;
  const entries = Object.entries(feedback.sections) as [string, FeedbackSection][];
  const valid = !feedback.gradingFailed && !feedback.emptyTranscript;

  const previousAttempt =
    session.goalLabel && valid
      ? await getPreviousAttemptForGoal(session.goalLabel, session.id, session.createdAt)
      : null;

  const sectionAverage = (sections: FeedbackSections) => {
    const scores = Object.values(sections)
      .filter((s): s is FeedbackSection => !!s)
      .map((s) => s.score);
    return scores.reduce((sum, n) => sum + n, 0) / scores.length;
  };
  const overallDelta = previousAttempt ? sectionAverage(feedback.sections) - sectionAverage(previousAttempt.sections) : null;
  const overall = sectionAverage(feedback.sections);
  // Lowest-scoring section = the one to work on next. Ties go to the first
  // in display order, which puts the core sections ahead of the add-ons.
  const focusEntry = valid ? entries.reduce((lo, e) => (e[1].score < lo[1].score ? e : lo), entries[0]) : null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:p-8">
      <p className="font-mono text-xs tracking-[0.25em] text-verdigris-400 uppercase">
        {stillOpen ? "Feedback so far" : "Session feedback"}
      </p>
      <h1 className="mt-2 font-display text-2xl text-parchment-100 sm:text-3xl">{session.topic || "(impromptu)"}</h1>
      {valid && (
        <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-2xl border border-hairline bg-ink-800 px-5 py-4">
          <p className="font-display text-4xl text-parchment-100 tabular-nums">
            {overall.toFixed(1)}
            <span className="ml-1 font-mono text-sm text-parchment-500">/ 5 overall</span>
          </p>
          {focusEntry && focusEntry[1].score < 5 && (
            <p className="text-sm text-parchment-300">
              Work on next: <span className="text-ember-400">{SECTION_LABELS[focusEntry[0]] ?? focusEntry[0]}</span>
            </p>
          )}
        </div>
      )}
      {session.goalLabel && (
        <p className="mt-1 text-sm text-parchment-500">
          Part of{" "}
          <Link
            href={`/app/goals/${encodeURIComponent(session.goalLabel)}`}
            className="text-verdigris-400 underline decoration-verdigris-500/40 underline-offset-2 hover:text-verdigris-300"
          >
            {session.goalLabel}
          </Link>
          {overallDelta !== null && (
            <>
              {" "}
              — overall{" "}
              <span className={overallDelta > 0 ? "text-verdigris-400" : overallDelta < 0 ? "text-rust-400" : ""}>
                {overallDelta > 0 ? "+" : ""}
                {overallDelta.toFixed(1)}
              </span>{" "}
              from your last attempt
            </>
          )}
        </p>
      )}
      <PitchTiming session={session} />
      <DeliveryMetrics session={session} />
      <ContentMetrics session={session} />
      <ConversationMetricsLine session={session} />
      {stillOpen && (
        <p className="mt-2 text-sm text-parchment-500">
          This session is still open — pick up where you left off whenever you&apos;re ready.
        </p>
      )}

      {feedback.emptyTranscript && (
        <p className="mt-4 rounded-lg border border-verdigris-500/30 bg-verdigris-500/10 p-3 text-sm text-verdigris-300">
          This session ended before you answered, so there&apos;s nothing to grade yet — scores
          below are placeholders.
        </p>
      )}
      {feedback.gradingFailed && !feedback.emptyTranscript && (
        <div className="mt-4 rounded-lg border border-gold-500/30 bg-gold-500/10 p-3 text-sm text-gold-500">
          Grading didn&apos;t fully succeed for this session — scores below are placeholders.
          <RetryGradingButton sessionId={id} />
        </div>
      )}

      <div className="mt-6 space-y-6">
        {entries.map(([key, section]) => {
          const prevSection = previousAttempt?.sections[key as keyof FeedbackSections];
          return (
            <section key={key} className="rounded-2xl border border-hairline bg-ink-800 p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg text-parchment-100">{SECTION_LABELS[key] ?? key}</h2>
                <div className="flex items-center gap-2">
                  {prevSection && <ScoreDelta diff={section.score - prevSection.score} />}
                  <ScoreBar score={section.score} />
                </div>
              </div>
              {section.quotedMoment && (
                <blockquote className="mt-3 border-l-2 border-verdigris-500 pl-3 font-mono text-sm text-parchment-500 italic">
                  &ldquo;{section.quotedMoment.text}&rdquo;
                </blockquote>
              )}
              <p className="mt-3 text-sm text-parchment-300">
                <span className="font-medium text-ember-400">Try this: </span>
                {section.fix}
              </p>
            </section>
          );
        })}
      </div>

      <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs tracking-wide uppercase">
        {stillOpen && (
          <Link
            href={`/session/${id}`}
            className="text-ember-400 underline decoration-ember-500/40 underline-offset-2 hover:text-ember-300"
          >
            Resume this session
          </Link>
        )}
        <Link
          href={`/session/${id}/logs`}
          className="text-parchment-500 underline decoration-parchment-500/30 underline-offset-2 hover:text-verdigris-400"
        >
          View call log
        </Link>
        <Link
          href="/app"
          className="text-parchment-500 underline decoration-parchment-500/30 underline-offset-2 hover:text-verdigris-400"
        >
          Start a new session
        </Link>
      </div>
    </main>
  );
}
