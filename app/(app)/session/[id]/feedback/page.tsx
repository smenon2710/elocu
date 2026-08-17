import Link from "next/link";
import { notFound } from "next/navigation";
import { computeDeliveryMetrics } from "@/lib/deliveryMetrics";
import { getFeedback, getSession } from "@/lib/store";
import type { FeedbackSection, Session } from "@/lib/types";

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
 * Real pace + filler-word density, aggregated across every user turn (see
 * lib/deliveryMetrics.ts) — same measured data handed to the grading prompt,
 * shown here directly so it's visible even when grading fails or a section
 * falls back to a placeholder score.
 */
function DeliveryMetrics({ session }: { session: Session }) {
  const { wpm, fillerCount, fillerPct } = computeDeliveryMetrics(session);
  if (wpm === null && fillerPct === null) return null;

  const parts: string[] = [];
  if (wpm !== null) parts.push(`${wpm} wpm`);
  if (fillerPct !== null) {
    parts.push(`${fillerCount} filler word${fillerCount === 1 ? "" : "s"} (${fillerPct.toFixed(1)}%)`);
  }

  return <p className="mt-1 font-mono text-sm text-parchment-500">{parts.join(" · ")}</p>;
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

  return (
    <main className="mx-auto max-w-2xl p-8">
      <p className="font-mono text-xs tracking-[0.25em] text-verdigris-400 uppercase">
        {stillOpen ? "Feedback so far" : "Session feedback"}
      </p>
      <h1 className="mt-2 font-display text-3xl text-parchment-100">{session.topic}</h1>
      <PitchTiming session={session} />
      <DeliveryMetrics session={session} />
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
        {entries.map(([key, section]) => (
          <section key={key} className="rounded-2xl border border-hairline bg-ink-800 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg text-parchment-100">{SECTION_LABELS[key] ?? key}</h2>
              <ScoreBar score={section.score} />
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
        ))}
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
