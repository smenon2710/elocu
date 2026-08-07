import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/store";
import { getSessionCallLogs, type LoggedCall } from "@/lib/llm";
import { getSessionParseFailures } from "@/lib/grading";

const LABEL_TITLES: Record<string, string> = {
  conversation: "Conversation — which LLM answered",
  grading: "Grading — which LLM evaluated",
};

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
      }`}
    >
      {ok ? "ok" : "failed"}
    </span>
  );
}

export default async function SessionLogsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [session, calls, parseFailures] = await Promise.all([
    getSession(id),
    getSessionCallLogs(id),
    getSessionParseFailures(id),
  ]);

  if (!session) notFound();

  const grouped: Record<string, LoggedCall[]> = {};
  for (const c of calls) {
    (grouped[c.label] ??= []).push(c);
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">Call log</h1>
      <p className="mt-1 text-gray-600">Topic: {session.topic}</p>

      <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
        <span className="font-medium">Speech capture: </span>
        your browser&apos;s built-in Speech Recognition (Web Speech API) converts spoken input to
        text entirely on your device — it never goes through our servers, so there&apos;s nothing
        to log there. Everything below is what happened once your (spoken or typed) text left your
        browser.
      </div>

      {calls.length === 0 && (
        <p className="mt-6 text-sm text-gray-400">No LLM calls logged for this session yet.</p>
      )}

      {Object.entries(grouped).map(([label, entries]) => (
        <section key={label} className="mt-6">
          <h2 className="font-medium text-gray-900">{LABEL_TITLES[label] ?? label}</h2>
          <div className="mt-2 space-y-2">
            {entries.map((c, i) => (
              <div key={i} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-gray-800">{c.provider}</span>
                  <span className="text-gray-400">·</span>
                  <span className="text-gray-600">{c.model}</span>
                  <StatusBadge ok={c.ok} />
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  {new Date(c.ts).toLocaleString()} · {c.durationMs}ms
                </p>
                {c.error && <p className="mt-1 text-xs text-red-600">{c.error}</p>}
              </div>
            ))}
          </div>
        </section>
      ))}

      {parseFailures.length > 0 && (
        <section className="mt-6">
          <h2 className="font-medium text-gray-900">Grading parse failures</h2>
          <p className="mt-1 text-xs text-gray-500">
            The call above succeeded, but the response couldn&apos;t be parsed into the expected
            format — this is why grading fell back to a retry or placeholder scores.
          </p>
          <div className="mt-2 space-y-2">
            {parseFailures.map((f, i) => (
              <details key={i} className="rounded-lg border p-3 text-sm">
                <summary className="cursor-pointer font-medium text-gray-800">
                  {new Date(f.ts).toLocaleString()} — {f.reason}
                </summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded bg-gray-50 p-2 text-xs whitespace-pre-wrap">
                  {f.raw}
                </pre>
              </details>
            ))}
          </div>
        </section>
      )}

      <Link href={`/session/${id}/feedback`} className="mt-8 inline-block text-blue-600 underline">
        Back to feedback
      </Link>
    </main>
  );
}
