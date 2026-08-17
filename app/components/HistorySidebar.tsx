"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import type { SessionMode } from "@/lib/types";

interface SessionSummary {
  id: string;
  mode: SessionMode;
  topic: string;
  createdAt: number;
  endedAt: number | null;
  turnCount: number;
  documentsUsed: boolean;
  hasFeedback: boolean;
  goalLabel: string | null;
}

const MODE_LABELS: Record<SessionMode, string> = {
  interview: "Interview",
  conversation: "Conversation",
  speech: "Speech",
  orator: "Orator",
  debate: "Debate",
  pitch: "Pitch",
};

function relativeTime(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function HistorySidebar() {
  const pathname = usePathname();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  useEffect(() => {
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.sessions)) setSessions(data.sessions);
      })
      .catch(() => {});
    // Refetch on every route change (e.g. ending a session and landing on its
    // feedback page) so the list stays in sync without polling.
  }, [pathname]);

  async function discard(id: string) {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    await fetch(`/api/sessions/${id}`, { method: "DELETE" }).catch(() => {});
  }

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-hairline bg-ink-900 p-4 sm:flex">
      <p className="mb-3 font-mono text-[11px] tracking-[0.2em] text-verdigris-400 uppercase">History</p>
      <div className="flex-1 space-y-0.5 overflow-y-auto">
        {sessions.length === 0 && (
          <p className="font-mono text-xs text-parchment-500">No sessions yet</p>
        )}
        {sessions.map((s) => {
          const live = s.endedAt === null;
          const href = live ? `/session/${s.id}` : `/session/${s.id}/feedback`;
          const active = pathname.includes(s.id);
          const paused = live && s.hasFeedback; // has a feedback snapshot but still resumable
          return (
            <div
              key={s.id}
              className={`group relative flex items-start justify-between gap-1 rounded-lg py-2 pr-1 pl-3 transition ${
                active ? "bg-ink-800" : "hover:bg-ink-800/60"
              }`}
            >
              {active && <span className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-ember-500" />}
              <div className="min-w-0 flex-1">
                <Link href={href}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm text-parchment-100">
                      {s.topic || "(impromptu)"}
                    </span>
                    <span
                      className={`shrink-0 font-mono text-[10px] tracking-wide uppercase ${
                        live ? (paused ? "text-gold-500" : "text-ember-400") : "text-parchment-500"
                      }`}
                    >
                      {live ? (paused ? "paused" : "live") : "done"}
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-[11px] text-parchment-500">
                    {MODE_LABELS[s.mode]} · {relativeTime(s.createdAt)}
                  </p>
                  {s.goalLabel && (
                    <p className="mt-0.5 truncate font-mono text-[10px] text-verdigris-400">↳ {s.goalLabel}</p>
                  )}
                </Link>
                {paused && (
                  <Link
                    href={`/session/${s.id}/feedback`}
                    className="font-mono text-[11px] text-verdigris-400 underline decoration-verdigris-500/40 underline-offset-2 hover:text-verdigris-300"
                  >
                    view feedback
                  </Link>
                )}
              </div>
              <button
                type="button"
                onClick={() => discard(s.id)}
                className="shrink-0 px-1 text-parchment-500/60 opacity-0 transition group-hover:opacity-100 hover:text-rust-400"
                aria-label="Discard session"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
