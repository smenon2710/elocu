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
      className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-medium tracking-wide uppercase ${
        ok ? "bg-verdigris-500/15 text-verdigris-400" : "bg-rust-500/15 text-rust-400"
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
      <p className="font-mono text-xs tracking-[0.25em] text-verdigris-400 uppercase">Call log</p>
      <h1 className="mt-2 font-display text-3xl text-parchment-100">{session.topic}</h1>

      <div className="mt-4 rounded-lg border border-hairline bg-ink-800 p-3 font-mono text-xs leading-relaxed text-parchment-500">
        <span className="text-parchment-300">Speech capture: </span>
        your browser&apos;s built-in Speech Recognition (Web Speech API) converts spoken input to
        text entirely on your device — it never goes through our servers, so there&apos;s nothing
        to log there. Everything below is what happened once your (spoken or typed) text left your
        browser.
      </div>

      {calls.length === 0 && (
        <p className="mt-6 font-mono text-sm text-parchment-500/70">No LLM calls logged for this session yet.</p>
      )}

      {Object.entries(grouped).map(([label, entries]) => (
        <section key={label} className="mt-6">
          <h2 className="font-display text-lg text-parchment-100">{LABEL_TITLES[label] ?? label}</h2>
          <div className="mt-2 space-y-2">
            {entries.map((c, i) => (
              <div key={i} className="rounded-lg border border-hairline bg-ink-800 p-3 font-mono text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-parchment-100">{c.provider}</span>
                  <span className="text-parchment-500">·</span>
                  <span className="text-parchment-500">{c.model}</span>
                  <StatusBadge ok={c.ok} />
                </div>
                <p className="mt-1 text-xs text-parchment-500/70">
                  {new Date(c.ts).toLocaleString()} · {c.durationMs}ms
                </p>
                {c.error && <p className="mt-1 text-xs text-rust-400">{c.error}</p>}
              </div>
            ))}
          </div>
        </section>
      ))}

      {parseFailures.length > 0 && (
        <section className="mt-6">
          <h2 className="font-display text-lg text-parchment-100">Grading parse failures</h2>
          <p className="mt-1 text-xs text-parchment-500">
            The call above succeeded, but the response couldn&apos;t be parsed into the expected
            format — this is why grading fell back to a retry or placeholder scores.
          </p>
          <div className="mt-2 space-y-2">
            {parseFailures.map((f, i) => (
              <details key={i} className="rounded-lg border border-hairline bg-ink-800 p-3 font-mono text-sm">
                <summary className="cursor-pointer text-parchment-100">
                  {new Date(f.ts).toLocaleString()} — {f.reason}
                </summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded bg-ink-900 p-2 text-xs whitespace-pre-wrap text-parchment-500">
                  {f.raw}
                </pre>
              </details>
            ))}
          </div>
        </section>
      )}

      <Link
        href={`/session/${id}/feedback`}
        className="mt-8 inline-block font-mono text-xs tracking-wide text-verdigris-400 uppercase underline decoration-verdigris-500/40 underline-offset-2 hover:text-verdigris-300"
      >
        Back to feedback
      </Link>
    </main>
  );
}
