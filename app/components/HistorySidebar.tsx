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
}

const MODE_LABELS: Record<SessionMode, string> = {
  interview: "Interview",
  conversation: "Conversation",
  speech: "Speech",
  orator: "Orator",
  debate: "Debate",
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
    <aside className="hidden w-64 shrink-0 flex-col border-r bg-gray-50 p-4 sm:flex">
      <p className="mb-2 text-xs font-medium tracking-wide text-gray-400 uppercase">History</p>
      <div className="flex-1 space-y-1 overflow-y-auto">
        {sessions.length === 0 && <p className="text-xs text-gray-400">No sessions yet</p>}
        {sessions.map((s) => {
          const live = s.endedAt === null;
          const href = live ? `/session/${s.id}` : `/session/${s.id}/feedback`;
          const active = pathname.includes(s.id);
          const paused = live && s.hasFeedback; // has a feedback snapshot but still resumable
          return (
            <div
              key={s.id}
              className={`group flex items-start justify-between gap-1 rounded-lg px-2 py-1.5 ${
                active ? "bg-blue-100" : "hover:bg-gray-100"
              }`}
            >
              <div className="min-w-0 flex-1">
                <Link href={href}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-gray-800">
                      {s.topic || "(impromptu)"}
                    </span>
                    <span className={`shrink-0 text-[10px] ${live ? "text-green-600" : "text-gray-400"}`}>
                      {live ? (paused ? "paused" : "live") : "done"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">
                    {MODE_LABELS[s.mode]} · {relativeTime(s.createdAt)}
                  </p>
                </Link>
                {paused && (
                  <Link
                    href={`/session/${s.id}/feedback`}
                    className="text-xs text-blue-600 underline"
                  >
                    view feedback
                  </Link>
                )}
              </div>
              <button
                type="button"
                onClick={() => discard(s.id)}
                className="shrink-0 px-1 text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-600"
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
