"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/app/progress", label: "Progress" },
  { href: "/app", label: "New session" },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="flex shrink-0 items-center justify-between border-b border-hairline bg-ink-900 px-4 py-3 sm:px-6">
      <Link href="/" className="font-display text-lg text-parchment-100 transition hover:text-ember-400">
        Elocu
      </Link>
      <nav className="flex items-center gap-5 font-mono text-xs tracking-[0.15em] uppercase">
        {NAV_LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`transition ${active ? "text-ember-400" : "text-parchment-500 hover:text-verdigris-400"}`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
