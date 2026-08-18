"use client";

import type { CategoryAverage } from "@/lib/progress";
import { TrendArrow } from "@/app/components/TrendArrow";

/**
 * One measure (an average score) across named categories — a single
 * consistent hue for every bar, not one color per category, since there's no
 * identity to distinguish here (see dataviz skill: color follows the job it
 * does, and a magnitude-only comparison needs none). Matches the app's
 * existing score color (blue-600) rather than a separate chart palette.
 */
export function CategoryBarChart({ data, max = 5 }: { data: CategoryAverage[]; max?: number }) {
  if (data.length === 0) return null;

  return (
    <div className="space-y-3">
      {data.map((d, i) => (
        <div key={d.key} className="group flex items-center gap-3">
          <span className="w-5 shrink-0 text-right font-mono text-xs text-parchment-500/60">#{i + 1}</span>
          <span className="w-28 shrink-0 truncate text-sm text-parchment-500">{d.label}</span>
          <div className="relative h-3 flex-1 rounded-full bg-ink-900">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-ember-500"
              style={{ width: `${Math.max((d.average / max) * 100, 4)}%` }}
            />
          </div>
          <span
            className="w-10 shrink-0 text-right font-mono text-sm text-parchment-100"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {d.average.toFixed(1)}
          </span>
          <span className="w-6 shrink-0 text-center">
            <TrendArrow trend={d.trend} />
          </span>
          <span className="w-16 shrink-0 font-mono text-xs text-parchment-500/70 opacity-0 transition-opacity group-hover:opacity-100">
            {d.count} sess.
          </span>
        </div>
      ))}
    </div>
  );
}
