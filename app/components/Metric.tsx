"use client";

import { useState, type ReactNode } from "react";

const TOOLTIP_WIDTH = 208; // px
const VIEWPORT_MARGIN = 12; // px, keeps the box off the screen edge
const GAP = 8; // px, space between trigger and tooltip
const MIN_HEIGHT = 60; // px, floor so the box is never unusably short

interface Position {
  left: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

/**
 * A raw number like "113 wpm" doesn't tell you whether that's good — wraps a
 * metric in a small hover/focus definition (what it measures, and a target
 * or research-backed reference point where one genuinely exists).
 *
 * Positioned via `position: fixed`, computed from the trigger's real
 * `getBoundingClientRect()` on hover/focus, rather than CSS anchoring
 * (`absolute` + `bottom-full`). Two real clipping bugs showed up with the
 * CSS-only version: horizontally, a tooltip centered under the trigger
 * overflows the viewport whenever the trigger sits near a screen edge
 * (confirmed on mobile); vertically, a trigger near the top of the page
 * sits inside the app shell's scrollable `overflow-y-auto` content pane,
 * and `absolute` content that extends above that pane's own top edge gets
 * clipped by it — visually indistinguishable from "the header cut it off,"
 * which is exactly how it read. `position: fixed` escapes that container's
 * overflow entirely (fixed positioning is relative to the viewport, not the
 * nearest scrolling ancestor) and flips below the trigger when there isn't
 * enough room above — decided from the *actual* space available in each
 * direction, not a guessed tooltip height (an earlier version guessed, and
 * guessed wrong for this component's longer tooltip strings, which grew
 * upward past the top of the viewport anyway). `maxHeight` + `overflow-y`
 * is a second safety net on top of that: even if a tooltip is long enough
 * to not fully fit the space it's given, it scrolls instead of spilling
 * off-screen.
 */
export function Metric({ children, tooltip }: { children: ReactNode; tooltip: string }) {
  const [pos, setPos] = useState<Position | null>(null);

  function show(e: { currentTarget: HTMLSpanElement }) {
    if (typeof window === "undefined") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const center = rect.left + rect.width / 2;

    let left = center - TOOLTIP_WIDTH / 2;
    left = Math.max(VIEWPORT_MARGIN, Math.min(left, window.innerWidth - TOOLTIP_WIDTH - VIEWPORT_MARGIN));

    const spaceAbove = rect.top - GAP - VIEWPORT_MARGIN;
    const spaceBelow = window.innerHeight - rect.bottom - GAP - VIEWPORT_MARGIN;
    const placement: "above" | "below" = spaceAbove >= spaceBelow ? "above" : "below";
    const maxHeight = Math.max(MIN_HEIGHT, placement === "above" ? spaceAbove : spaceBelow);

    setPos({
      left,
      maxHeight,
      top: placement === "below" ? rect.bottom + GAP : undefined,
      bottom: placement === "above" ? window.innerHeight - rect.top + GAP : undefined,
    });
  }

  function hide() {
    setPos(null);
  }

  return (
    <span
      tabIndex={0}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      className="cursor-help border-b border-dotted border-parchment-500/50 outline-none"
    >
      {children}
      {pos && (
        <span
          role="tooltip"
          style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: TOOLTIP_WIDTH, maxHeight: pos.maxHeight }}
          className="pointer-events-none fixed z-50 overflow-y-auto rounded-lg border border-hairline bg-ink-900 p-3 font-sans text-xs leading-relaxed normal-case text-parchment-300 shadow-lg"
        >
          {tooltip}
        </span>
      )}
    </span>
  );
}
