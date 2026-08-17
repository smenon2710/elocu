import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Metric } from "@/app/components/Metric";
import { computeContentMetrics } from "@/lib/contentMetrics";
import { computeConversationMetrics } from "@/lib/conversationMetrics";
import { computeDeliveryMetrics } from "@/lib/deliveryMetrics";
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

const METRIC_TOOLTIPS = {
  wpm: "Words per minute. Comprehension research (Univ. of Michigan; Univ. of Missouri) points to ~150–160 wpm as the clearest pace to listen to — noticeably faster measurably hurts comprehension. Slower (130–140) suits dense material; faster (150–165) suits persuasive contexts like debate.",
  filler:
    "Vocalized fillers like \"um\" and \"like.\" Occasional ones are natural and rarely hurt you — a high density is what tends to read as unprepared. There's no universal target; fewer is simply better.",
  hedge:
    "Words that soften a claim's confidence (\"I think,\" \"just,\" \"kind of\"). Used rarely they're normal — used often they can undercut a strong point even when the underlying content is solid.",
  ttr: "Unique words ÷ total words. This drops naturally the longer you talk, even with no real change in vocabulary richness — read it as a same-session signal, not a score to chase.",
  talkTime:
    "Your share of words spoken vs. the AI's. Conversation-analysis research (e.g. Gong's study of 100,000+ sales calls) found the best-received two-way conversations cluster around 40–55% — well above that tends to mean not leaving room for the other person.",
  questionRate:
    "Share of your turns that asked something back. Rarely asking anything across many turns can read as low engagement with what they said, not just low curiosity.",
} as const;

/**
 * Derived straight from the turn's real startTs/endTs (see
 * app/api/sessions/[id]/messages/route.ts), not from the LLM's grading pass —
 * so this stays accurate even when grading fails or falls back to
 * placeholders.
 */
function PitchTiming({ session }: { session: Session }) {
  if (session.mode !== "pitch" || !session.pitchTimeLimitSec) return null;
  const turn = session.turns.find((t) => t.speaker === "user");
  if (!turn) return null;

  const actualMs = turn.endTs - turn.startTs;
  const targetMs = session.pitchTimeLimitSec * 1000;
  const diffSec = Math.round((actualMs - targetMs) / 1000);
  const tone = diffSec > 0 ? "text-rust-400" : diffSec < 0 ? "text-verdigris-400" : "text-ember-400";
  const note = diffSec > 0 ? `${diffSec}s over` : diffSec < 0 ? `${-diffSec}s under` : "right on target";

  return (
    <p className="mt-3 font-mono text-sm text-parchment-500">
      Delivered in{" "}
      <span className={tone}>
        {formatClock(actualMs)} / {formatClock(targetMs)}
      </span>{" "}
      — {note}
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

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex gap-1" aria-label={`Score ${score} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <div key={n} className={`h-2 w-6 rounded-full ${n <= score ? "bg-ember-500" : "bg-ink-700"}`} />
      ))}
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

  return (
    <main className="mx-auto max-w-2xl p-8">
      <p className="font-mono text-xs tracking-[0.25em] text-verdigris-400 uppercase">
        {stillOpen ? "Feedback so far" : "Session feedback"}
      </p>
      <h1 className="mt-2 font-display text-3xl text-parchment-100">{session.topic}</h1>
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
        <p className="mt-4 rounded-lg border border-gold-500/30 bg-gold-500/10 p-3 text-sm text-gold-500">
          Grading didn&apos;t fully succeed for this session — scores below are placeholders.
        </p>
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
