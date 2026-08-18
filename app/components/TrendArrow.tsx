import type { TrendDirection } from "@/lib/progress";

/**
 * Green up / red down / neutral flat — but the color always means "trending
 * the way this specific metric's own guidance says is good" (see
 * lib/progress.ts's `Goodness` type), never just "the raw number went up."
 * A rising filler-word% or a pitch drifting further from its time budget
 * both render as a red down-pointing arrow, not a green up one.
 */
export function TrendArrow({ trend }: { trend: TrendDirection | null | undefined }) {
  if (!trend || trend === "flat") {
    return (
      <span className="font-mono text-xs text-parchment-500/60" title="No meaningful change recently" aria-label="No change">
        ±0
      </span>
    );
  }
  const up = trend === "up";
  return (
    <span
      className={`font-mono text-xs ${up ? "text-verdigris-400" : "text-rust-400"}`}
      title={up ? "Trending in the right direction" : "Trending the wrong way"}
      aria-label={up ? "Improving" : "Worsening"}
    >
      {up ? "▲" : "▼"}
    </span>
  );
}
