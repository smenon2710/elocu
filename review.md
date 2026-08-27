# Elocu — Improvement Review

**Date:** 2026-08-27
**Scope:** Whole app — functionality, accessibility, visual design, performance,
code correctness, security posture.
**Method:** Full read of `lib/`, `app/` (routes, pages, components), config, and
`globals.css`; ran the app (`npm run dev`) and exercised session create → turn →
grade → feedback via the API. `npx tsc --noEmit` and `npm run lint` both pass
clean at time of review.

This is a backlog document in the same spirit as `plan.md` — findings and
suggested fixes, not decisions already made. Nothing here is required; it's
ordered by impact so the top of each section is where the leverage is.

---

## Note on "mobile"

Elocu is a Next.js web app, not a native app. "Mobile" throughout this document
means **the app viewed in a phone-sized browser viewport** (~375–430px wide),
which is exactly what the existing responsive CSS (`sm:` breakpoints,
`flex-wrap`, the `hidden … sm:flex` sidebar) is written for. The app already
targets phone widths; it just has gaps there. It is not "local only" by design —
it has no infrastructure dependency except the file-based `data/` directory, so
it can be deployed or reached over the LAN today (see `README` / `saas-plan.md`
for the persistence caveat on serverless hosts). Running it on a phone means
opening its URL in the phone's browser.

---

## Priority order

1. Mobile: restore history access + fix the session action-bar layout.
2. `aria-live` on the live transcript + label the unlabeled `<select>`s. — **done 2026-08-27**
3. STT review-before-send step (largest single lever on feedback quality).
4. Stream the conversation reply + honest fallback-provider messaging.
5. Retry-grading button on ended sessions; confirm-on-discard. — **done 2026-08-27**
6. Contrast / micro-text pass; tooltip association + touch support.
7. Unit tests around the metric / parsing / trend functions.
8. `listAllFeedback` caching before session count makes it matter.

> **Batch 1 (2026-08-27)** — items 2 and 5 above, plus the stale error strings,
> are implemented. See `plan.md` §40. Individual findings below are annotated
> _(done)_ where addressed.

---

## 1. Functionality & UX

### High impact

- **Mobile has no access to session history.**
  `HistorySidebar.tsx:303` is `hidden … sm:flex`; the header
  (`Header.tsx:212`) only has "Insights" and "New session". On a phone there is
  no way to resume an in-progress session or reopen feedback — a core flow
  disappears. Add a header menu / drawer, or a `/app/history` route rendering the
  same list.

- **The session action bar overflows on mobile.**
  `app/(app)/session/[id]/page.tsx:316` — `<form className="flex gap-2">` holds a
  text input plus three buttons ("Send", "Pause & get feedback", "End session")
  with no wrap and no responsive stacking. Unusable below ~500px. Make it
  `flex-wrap`, move Pause/End into an overflow menu, or stack them under the
  input.

- **STT output goes straight into the transcript and into grading with no
  review step.** `useSpeech.ts:148` finalizes the buffer on mic-tap and
  `page.tsx:61` submits it immediately. Recognition errors (homophones, dropped
  words) are then quoted back at the user as their own words and scored — the app
  grades the recognizer as much as the speaker. Add an editable "review before
  send" state on the interim text.

- **No streaming anywhere.** Every turn blocks on the full LLM round-trip (up to
  the 45s ceiling in `llm.ts:139` on a slow fallback) behind a static "Thinking…"
  label. Session creation blocks on the opening line (`api/sessions/route.ts:57`).
  Token-stream the reply, or at minimum show elapsed time and a "trying backup
  provider" message when the fallback chain engages.

- **Auto-end at 12 exchanges is abrupt.** `conversation.ts:76` ends the session
  and navigates to feedback with no warning. Surface "1 exchange left" on the
  penultimate turn.

- **A permanently-ended session with `gradingFailed` can't be regraded from the
  UI.** _(done — `POST /api/sessions/[id]/regrade` + a "Retry grading" button on
  the failure banner; regrades only a genuine `gradingFailed` placeholder.)_
  `/pause` retries failed grading, but once `endedAt` is set the feedback
  page (`feedback/page.tsx`) offered no retry — the user was stuck with
  placeholder 3/3/3 scores.

### Medium impact

- **Discarding a session is one mis-tap from permanent loss.** _(done — the "×"
  now arms an inline `delete` / `keep` confirm, one row at a time.)_
  `HistorySidebar.tsx` — it previously deleted session + feedback on the first
  click with no undo. A soft-delete + undo toast would still be a further
  improvement.
- **Mic-permission denial is silent.** `recognition.onerror = () => {}`
  (`useSpeech.ts:146`). Detect `not-allowed` / `service-not-allowed` and show
  "Microphone blocked — enable it in your browser, or type instead."
- **iOS Safari TTS silently no-ops.** The resume effect calls `speech.speak()`
  with no user gesture (`page.tsx:168`); iOS requires one. Gate auto-speak behind
  the first mic tap; keep the AI text prominent (it already is).
- **No transcript export / copy.** Users rehearsing a real speech will want what
  they said. A copy/download button on the feedback or session page is cheap.
- **`extractText` mangles non-PDF/non-text files.** `documents.ts:16` does
  `buffer.toString("utf-8")` for anything not a PDF — a `.docx` resume (common)
  becomes binary garbage fed to the model. Picker is `accept=".txt,.pdf"`
  (`DocSlot.tsx:89`) but paste/drag/rename bypasses it. Reject unknown types
  server-side with a clear message, or add real `.docx` parsing.
- **In-progress sessions never expire.** `data/` grows unbounded; history is
  capped at 50 with no pagination (`store.ts:83`); abandoned "live" sessions sit
  at the top of the list forever.
- **Pause / End are disabled while listening** (`page.tsx:342,350`) with no hint
  the user must tap the mic off first.

---

## 2. Accessibility

### High impact

- **The live transcript is not announced to screen readers.** _(done — the turns
  container is now `role="log"` + `aria-live="polite"`, and the
  Listening/Thinking/Speaking status line is `aria-live="polite"`. `interimText`
  left un-live deliberately — per-partial announcements would be noise.)_
  `app/(app)/session/[id]/page.tsx` — a blind user previously got nothing when
  the AI replied.

- **Unlabeled form controls.** _(done — `aria-label` on all six selects.)_ The
  metric / mode / section `<select>`s in `ObjectiveCard.tsx` (`TargetEditor`)
  and `ObjectiveForm.tsx` had no `<label>` or `aria-label` — announced as bare
  "combobox".

- **Tooltips aren't associated and aren't reachable on touch.** `Metric.tsx`
  renders `role="tooltip"` but never links it via `aria-describedby`, so screen
  readers get the number with no definition. It's hover/focus-only — no tap
  target on mobile, so the research-backed context (the component's whole point)
  is invisible to touch users. Link it with an id; add a tap toggle.

### Medium impact

- **Focus is never moved on client navigation.** After End →
  `router.push('/feedback')` (`page.tsx:186`) focus stays on a detached button.
  Move focus to the page `<h1>` on route change.
- **No skip link** to main content; no `aria-label` on the `<nav>` / `<aside>`
  landmarks.
- **Low-contrast micro-text.** `text-parchment-500/70`, `/60`, and
  `text-[10px]` / `text-[11px]` are used widely for captions and hints
  (`insights/page.tsx:68`, `HistorySidebar.tsx:329`, `ObjectiveCard.tsx:223`).
  `parchment-500` (#9c9488) on `ink-950` is ~4.7:1 — borderline; at 60–70%
  opacity it fails WCAG AA. Raise the dimmest text and set a 12px floor.
- **Mode grid uses `aria-pressed` buttons** (`app/(app)/app/page.tsx:228`) where
  a `radiogroup` / `radio` is the correct single-choice pattern — arrow-key nav
  comes for free.
- **Forced dark theme** (`globals.css:8`, a deliberate choice). Consider
  honoring `prefers-contrast: more` with a higher-contrast token set.
- **`ScoreBar`** (`feedback/page.tsx:156`) conveys score through color + fill
  only; the `aria-label` covers SR users, but add a visible "3 / 5" for
  colorblind sighted users.
- **`transition-*` utilities aren't gated by `prefers-reduced-motion`** — only
  the keyframe animations are (`globals.css:101`).

---

## 3. Visual & design

The identity is strong — the ink/parchment/ember system, Fraunces + Plex Mono,
the transcript-reveal motif carried from landing into the app. It does not read
as templated. Refinements:

- **The feedback page buries the headline number.** No overall score at the top
  (`feedback/page.tsx:269`) — the user eyeballs 4–6 bars. Lead with a single
  "3.8 / 5" and the goal delta, then the sections.
- **The active session view is a flat scroll box.** No timestamps, no turn
  separation beyond a label color; autoscroll forces the bottom
  (`page.tsx:124`) so you can't read back mid-session. Add subtle per-turn
  separation and a "jump to latest" affordance instead of forced scroll.
- **Landing page bypasses the theme tokens.** `app/page.tsx` hardcodes
  `#14131B`, `#D98E4A`, etc. instead of the `--color-ink-*` / `--color-ember-*`
  vars in `globals.css` — two sources of truth for one palette. The comment near
  `app/(app)/app/page.tsx:24` also still says "Five rooms"; there are six modes.
- **Empty `public/`** — no root favicon, no OG image, no `robots.txt`. Landing
  metadata is only `title` + `description` (`app/layout.tsx:4`). Add
  OpenGraph/Twitter tags and a favicon for shared links.
- **Insights is one long column.** On desktop (`max-w-3xl`) the stat tiles →
  goals → trend → bar charts → metric tiles could use two columns above the
  fold.
- **`TrendLineChart`** (600×180 viewBox) has 1–5 gridlines but no axis labels —
  a reader can't tell 3.2 from 3.8 without hovering. Add a y-axis scale.
- **Charts are `"use client"`** inside otherwise-server pages — a flash of empty
  chart on load. They're pure SVG from props and could be server components.

---

## 4. Performance & architecture

- **`listAllFeedback()` re-reads every session + feedback file on every call**
  (`store.ts:163`) and is called by the insights page, the feedback page (via
  `getPreviousAttemptForGoal` → `listAttemptsForGoal`), and the goal page.
  O(n) disk reads per page view. Add an in-memory cache with mtime
  invalidation, or an index file.
- **Interview mode resends the full JD + resume + question list (up to 60k
  chars) every turn** (`conversation.ts:47` → `buildPersona`), plus the growing
  transcript. A summary/truncation pass on documents after turn 1 would cut this
  substantially.
- **No request cancellation.** Navigating away mid-turn leaves the `fetch` and
  the LLM call running (`page.tsx:74`). Wire an `AbortController` to route
  changes.
- **The grading prompt has no transcript token cap** — a maxed-out interview
  could exceed context on the smaller fallback models, causing the parse
  failures the fallback chain exists to catch.
- **`data/logs/*.jsonl` grow forever;** `getSessionCallLogs` /
  `getSessionParseFailures` scan all daily log files line-by-line for one session
  id (`llm.ts:251`). Add rotation / retention.

---

## 5. Code correctness & quality

- **Stale error strings.** _(done — now `"Failed to reach the AI provider"`.)_
  `api/sessions/route.ts`, `messages/route.ts`, `retry/route.ts` all said
  `"Failed to reach OpenRouter"` when Groq is primary.
- **`handleUserTurn` closes over `speech` before it's declared** (`page.tsx:61`
  vs `:108`). Works only because `useSpeech` routes the callback through
  `onFinalRef` and `speech` resolves by call-time. Fragile to refactoring —
  restructure so `speech` is defined first, or document it.
- **`isCuratedVoice` substring matching is greedy.** `voiceCategories.ts:52`
  uses `lower.includes(name)`, so `"alex"` matches "Alexandra" etc. Low stakes
  (gender guess is explicitly best-effort) but a word-boundary check like
  `guessVoiceGender` already uses would be cleaner.
- **`crypto.randomUUID()` in a client component** (`DocSlot.tsx:23`) throws in
  non-secure contexts (plain-HTTP LAN access). `localhost` is fine; a networked
  demo over `http://` is not.
- **No tests, no CI.** `package.json` has no test runner. The deterministic
  metric functions (`deliveryMetrics`, `contentMetrics`, `pitchMetrics`,
  `progress.computeTrend`) are pure, edge-case-heavy, and the part most likely to
  silently regress — they're begging for unit tests, as are
  `validateQuotedMoment` and `parseJsonObject`.

---

## 6. Security / multi-tenancy

Mostly known and covered by `saas-plan.md`:

- Every API route is unauthenticated and keyed only on a UUID in the URL — any
  caller can `GET` / `DELETE` any session or `PATCH` any objective. Fine for a
  single-user local tool; blocking for anything shared.
- File size (5MB) and text (20k chars) caps are enforced (`api/documents/route.ts`)
  — good. But there's **no rate limiting** on the LLM-backed routes; a loop
  hitting `POST /api/sessions` burns provider quota with no ceiling.
- Passing `user: sessionId` to providers for abuse tracing (`llm.ts:133`) is
  good practice — keep it.
