"use client";

import { useState } from "react";

export interface TrendPoint {
  sessionId: string;
  createdAt: number;
  average: number;
}

const WIDTH = 600;
const HEIGHT = 180;
const PAD_X = 16;
const PAD_Y = 16;
const MAX_SCORE = 5;
// Tailwind blue-600 — same hue used everywhere else scores appear in this app.
const LINE_COLOR = "#2563eb";
const GRID_COLOR = "#e5e7eb";

/**
 * Change over time is exactly the job a line chart is for. Single series, so
 * no legend (the "Score over time" heading names it) — direct labels only
 * where they help (hover), never on every point, per the anti-patterns this
 * skill flags.
 */
export function TrendLineChart({ points }: { points: TrendPoint[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (points.length === 0) return null;

  const innerWidth = WIDTH - PAD_X * 2;
  const innerHeight = HEIGHT - PAD_Y * 2;

  const xFor = (i: number) =>
    points.length === 1 ? PAD_X + innerWidth / 2 : PAD_X + (i / (points.length - 1)) * innerWidth;
  const yFor = (score: number) => PAD_Y + innerHeight - (score / MAX_SCORE) * innerHeight;

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(p.average).toFixed(1)}`).join(" ");

  const hovered = hoverIdx !== null ? points[hoverIdx] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label="Average score over time">
        {[1, 2, 3, 4, 5].map((n) => (
          <line key={n} x1={PAD_X} x2={WIDTH - PAD_X} y1={yFor(n)} y2={yFor(n)} stroke={GRID_COLOR} strokeWidth={1} />
        ))}
        {points.length > 1 && <path d={pathD} fill="none" stroke={LINE_COLOR} strokeWidth={2} />}
        {points.map((p, i) => (
          <circle
            key={p.sessionId}
            cx={xFor(i)}
            cy={yFor(p.average)}
            r={hoverIdx === i ? 6 : 4}
            fill={LINE_COLOR}
            style={{ cursor: "pointer" }}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
          />
        ))}
      </svg>
      {hovered && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs whitespace-nowrap shadow-sm"
          style={{
            left: `${(xFor(hoverIdx!) / WIDTH) * 100}%`,
            top: `${(yFor(hovered.average) / HEIGHT) * 100}%`,
          }}
        >
          <div className="font-medium text-gray-900">{hovered.average.toFixed(1)} / 5</div>
          <div className="text-gray-400">{new Date(hovered.createdAt).toLocaleDateString()}</div>
        </div>
      )}
    </div>
  );
}
