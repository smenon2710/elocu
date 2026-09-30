"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { HistoryList } from "@/app/components/HistorySidebar";

const NAV_LINKS = [
  { href: "/app/insights", label: "Insights" },
  { href: "/app", label: "New session" },
];

/**
 * The history sidebar is `hidden … sm:flex` — there's no room for it at phone
 * width — so below `sm` the header grows a "History" button that opens the
 * same list (HistoryList) in a slide-over drawer. Without it, a phone had no
 * way to resume an in-progress session or reopen past feedback at all.
 */
function HistoryDrawer({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 sm:hidden" role="dialog" aria-modal="true" aria-label="Session history">
      <button
        type="button"
        aria-label="Close history"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-ink-950/70"
      />
      <div className="absolute inset-y-0 left-0 flex w-[85%] max-w-xs flex-col border-r border-hairline bg-ink-900 p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-mono text-[11px] tracking-[0.2em] text-verdigris-400 uppercase">History</p>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="-mr-2 px-2 py-1 font-mono text-lg leading-none text-parchment-500 hover:text-parchment-100"
            aria-label="Close history"
          >
            ×
          </button>
        </div>
        <div className="scroll-quiet scroll-fade -mr-3 flex-1 overflow-y-auto pt-2 pr-1 pb-8">
          <HistoryList onNavigate={onClose} />
        </div>
      </div>
    </div>
  );
}

export function Header() {
  const pathname = usePathname();
  const [historyOpen, setHistoryOpen] = useState(false);
  const closeHistory = useCallback(() => setHistoryOpen(false), []);

  return (
    <header className="flex shrink-0 items-center justify-between border-b border-hairline bg-ink-900 px-4 py-3 sm:px-6">
      <Link href="/" className="font-display text-lg text-parchment-100 transition hover:text-ember-400">
        Elocu
      </Link>
      <nav
        aria-label="Main"
        className="flex items-center gap-4 font-mono text-xs tracking-[0.1em] uppercase sm:gap-5 sm:tracking-[0.15em]"
      >
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          aria-expanded={historyOpen}
          className="text-parchment-500 uppercase transition hover:text-verdigris-400 sm:hidden"
        >
          History
        </button>
        {NAV_LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`transition ${active ? "text-ember-400" : "text-parchment-500 hover:text-verdigris-400"}`}
            >
              {link.label}
            </Link>
          );
        })}
        {/* Account menu (profile, sign out). Everything under the app shell is
            signed-in only (proxy.ts), so there's no signed-out state to handle here. */}
        <UserButton />
      </nav>
      {historyOpen && <HistoryDrawer onClose={closeHistory} />}
    </header>
  );
}
