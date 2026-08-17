"use client";

import { useRef, useState } from "react";

const TOOLTIP_WIDTH = 208; // px, matches w-52
const VIEWPORT_MARGIN = 12; // px, keeps the box off the screen edge

/**
 * A raw number like "113 wpm" doesn't tell you whether that's good — wraps a
 * metric in a small hover/focus definition (what it measures, and a target
 * or research-backed reference point where one genuinely exists).
 *
 * CSS-only centered positioning (`left-1/2 -translate-x-1/2`) overflows the
 * viewport whenever the trigger word sits near a screen edge — confirmed
 * live on mobile for both the first metric in a line (tooltip clipped off
 * the left) and a later one (clipped off the right). This measures the
 * trigger's real position on hover/focus and nudges the tooltip's transform
 * just enough to stay on-screen, rather than a fixed CSS anchor that's only
 * correct for some trigger positions.
 */
export function Metric({ children, tooltip }: { children: string; tooltip: string }) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);

  function clampToViewport() {
    const el = triggerRef.current;
    if (!el || typeof window === "undefined") return;
    const rect = el.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    const halfWidth = TOOLTIP_WIDTH / 2;

    let next = 0;
    if (center - halfWidth < VIEWPORT_MARGIN) {
      next = VIEWPORT_MARGIN - (center - halfWidth);
    } else if (center + halfWidth > window.innerWidth - VIEWPORT_MARGIN) {
      next = window.innerWidth - VIEWPORT_MARGIN - (center + halfWidth);
    }
    setShift(next);
  }

  return (
    <span
      ref={triggerRef}
      tabIndex={0}
      onMouseEnter={clampToViewport}
      onFocus={clampToViewport}
      className="group relative cursor-help border-b border-dotted border-parchment-500/50 outline-none"
    >
      {children}
      <span
        style={{ width: TOOLTIP_WIDTH, transform: `translateX(calc(-50% + ${shift}px))` }}
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 rounded-lg border border-hairline bg-ink-900 p-3 font-sans text-xs leading-relaxed normal-case text-parchment-300 opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus:opacity-100"
      >
        {tooltip}
      </span>
    </span>
  );
}
