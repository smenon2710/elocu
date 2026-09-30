"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Retries a failed grading pass from the feedback screen (see
 * app/api/sessions/[id]/regrade/route.ts). For an already-ended session this
 * is the only route back to real scores — /pause won't touch a closed
 * session and /end returns the cached placeholder without regrading. On
 * success the server component re-renders with real sections via
 * router.refresh().
 */
export function RetryGradingButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/regrade`, { method: "POST" });
      const data = await res.json();
      if (data.feedback && !data.feedback.gradingFailed) {
        router.refresh();
      } else {
        setError(data.error ?? "Grading failed again — the provider may still be having trouble. Try once more in a moment.");
        setBusy(false);
      }
    } catch {
      setError("Couldn't reach the server.");
      setBusy(false);
    }
  }

  return (
    <span className="mt-2 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={retry}
        disabled={busy}
        className="rounded-full border border-gold-500/40 px-3 py-1 font-mono text-xs text-gold-500 transition hover:border-gold-500/70 disabled:opacity-40"
      >
        {busy ? "Retrying…" : "Retry grading"}
      </button>
      {error && <span className="text-xs text-rust-400">{error}</span>}
    </span>
  );
}
