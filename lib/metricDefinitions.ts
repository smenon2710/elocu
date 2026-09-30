// Plain-language definitions (and research-backed reference ranges, where
// they genuinely exist) for each measured metric — shown as hover/tap
// tooltips via app/components/Metric.tsx on both the per-session feedback
// page and /app/insights, so the same number is explained the same way in
// both places. Keys match lib/progress.ts's CategoryAverage keys.
export const METRIC_TOOLTIPS: Record<string, string> = {
  pitchTiming:
    "The name comes from fitting a pitch inside a short elevator ride — 30–60s is the common convention for a cold pitch, sometimes 45–60s+ with more context (e.g. an interview). Running under your budget isn't automatically better either: it can mean you left out the value prop or the ask. The goal is landing the full shape — hook, value, ask — inside the time you chose.",
  wpm: "Words per minute. Comprehension research (Univ. of Michigan; Univ. of Missouri) points to ~150–160 wpm as the clearest pace to listen to — noticeably faster measurably hurts comprehension. Slower (130–140) suits dense material; faster (150–165) suits persuasive contexts like debate.",
  filler:
    "Vocalized fillers like \"um\" and \"like.\" Occasional ones are natural and rarely hurt you — a high density is what tends to read as unprepared. There's no universal target; fewer is simply better.",
  hedge:
    "Words that soften a claim's confidence (\"I think,\" \"just,\" \"kind of\"). Used rarely they're normal — used often they can undercut a strong point even when the underlying content is solid.",
  ttr: "Unique words ÷ total words. This drops naturally the longer you talk, even with no real change in vocabulary richness — read it as a same-session signal, not a score to chase.",
  talkTime:
    "Your share of words spoken vs. the AI's. Conversation-analysis research (e.g. Gong's study of 100,000+ sales calls) found the best-received two-way conversations cluster around 40–55% — well above that tends to mean not leaving room for the other person.",
  questionRate:
    "Share of your turns that asked something back. Rarely asking anything across many turns can read as low engagement with what they said, not just low curiosity.",
};
