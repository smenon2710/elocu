import Link from "next/link";
import { notFound } from "next/navigation";
import { getFeedback, getSession } from "@/lib/store";
import type { FeedbackSection } from "@/lib/types";

const SECTION_LABELS: Record<string, string> = {
  structure: "Structure",
  delivery: "Delivery",
  content: "Content",
  engagement: "Engagement",
  contextFit: "Context Fit",
  argumentation: "Argumentation",
};

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex gap-1" aria-label={`Score ${score} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <div key={n} className={`h-2 w-6 rounded-full ${n <= score ? "bg-blue-600" : "bg-gray-200"}`} />
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
        <h1 className="text-2xl font-semibold">Feedback isn&apos;t ready yet</h1>
        <p className="mt-2 text-gray-600">
          This session hasn&apos;t been graded. Go back and either pause (get feedback so far,
          keep the session open) or end it (get final feedback).
        </p>
        <Link href={`/session/${id}`} className="mt-4 inline-block text-blue-600 underline">
          Back to session
        </Link>
      </main>
    );
  }

  const stillOpen = session.endedAt === null;
  const entries = Object.entries(feedback.sections) as [string, FeedbackSection][];

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">
        {stillOpen ? "Feedback so far" : "Session feedback"}
      </h1>
      <p className="mt-1 text-gray-600">Topic: {session.topic}</p>
      {stillOpen && (
        <p className="mt-1 text-sm text-gray-500">
          This session is still open — pick up where you left off whenever you&apos;re ready.
        </p>
      )}

      {feedback.emptyTranscript && (
        <p className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
          This session ended before you answered, so there&apos;s nothing to grade yet — scores
          below are placeholders.
        </p>
      )}
      {feedback.gradingFailed && !feedback.emptyTranscript && (
        <p className="mt-4 rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800">
          Grading didn&apos;t fully succeed for this session — scores below are placeholders.
        </p>
      )}

      <div className="mt-6 space-y-6">
        {entries.map(([key, section]) => (
          <section key={key} className="rounded-xl border p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">{SECTION_LABELS[key] ?? key}</h2>
              <ScoreBar score={section.score} />
            </div>
            {section.quotedMoment && (
              <blockquote className="mt-3 border-l-2 border-gray-300 pl-3 text-sm italic text-gray-600">
                &ldquo;{section.quotedMoment.text}&rdquo;
              </blockquote>
            )}
            <p className="mt-3 text-sm text-gray-800">
              <span className="font-medium">Try this: </span>
              {section.fix}
            </p>
          </section>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap gap-4">
        {stillOpen && (
          <Link href={`/session/${id}`} className="text-blue-600 underline">
            Resume this session
          </Link>
        )}
        <Link href={`/session/${id}/logs`} className="text-blue-600 underline">
          View call log
        </Link>
        <Link href="/app" className="text-blue-600 underline">
          Start a new session
        </Link>
      </div>
    </main>
  );
}
