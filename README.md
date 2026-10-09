# Elocu

Practice storytelling, interviews, speeches, and debate by talking it out loud with an AI. No
setup screen — pick a mode, say what you want to talk about, and start talking (voice or text).
When you're done, you get per-section feedback (Structure, Delivery, Content, Engagement, plus
Context Fit or Argumentation where relevant) with a quoted moment from your own transcript and one
concrete fix per section — not generic advice.

`/` is the marketing landing page; the app itself lives at `/app` (mode selector, and everything
flows from there — sessions, feedback, call logs).

See `plan.md` for the full design rationale and decision history (why things are built the way
they are, bugs found along the way, and what was tried and rejected). This README is the practical
"how do I run and use this" doc. See `saas-plan.md` for the plan to turn this into a multi-tenant,
paid product — Postgres storage, Clerk sign-in, rate limits, and the private-beta deploy are done
(`plan.md` §44–47); a custom domain and billing are next.

## Modes

| Mode | Shape |
|---|---|
| **Conversation** | Casual peer-to-peer chat — the zero-friction default |
| **Interview** | Back-and-forth Q&A; tailors to a role if you attach a job description/resume |
| **Debate** | State a position — the AI argues the *opposing* side with real counterarguments |
| **Speech** | Deliver a prepared talk; the AI stays silent, then gives one brief reaction |
| **Orator** | Impromptu persuasive speaking; leave the topic blank for a surprise prompt |
| **Pitch** | Elevator pitch against a real countdown (30s/60s/90s/3min); feedback is grounded in your actual delivery time, not guesswork |

Interview mode is the only one with document upload (job description / resume / question list,
multiple per category, paste or file) — attach as many as you want, it folds them all into the
interviewer's context, and the grader reads them too when scoring Context Fit.

## Practicing the same thing over and over

If you're rehearsing one specific thing — an actual pitch, a real interview, a speech for a
specific meeting — name it as a **practice goal** when you start a session (or pick a goal you've
used before). Every session under that goal groups together: the feedback page shows how this
attempt compares to your last one on the same goal ("+2.3 from your last attempt"), and
`/app/goals/[label]` shows every attempt with a score-over-time trend scoped to just that goal —
answering "am I actually getting better at *this*," not just the global average across everything
you've ever practiced.

## Setup

```bash
npm install
cp .env.example .env.local
```

Then fill in `.env.local`. You need a Postgres database and at least one working LLM provider —
see below.

### Database

Everything — sessions, feedback, goals, and the LLM call logs — lives in Postgres (`lib/db/`,
Drizzle ORM). Every row is owned by a user id and every query is scoped to it (`lib/store.ts`), so
one user can never read or change another's data.

Local Postgres via Docker (data persists in the `elocu-pg` volume):

```bash
docker run -d --name elocu-pg -e POSTGRES_PASSWORD=elocu -e POSTGRES_DB=elocu \
  -v elocu-pg:/var/lib/postgresql/data -p 5432:5432 postgres:17
```

That matches the `DATABASE_URL` default in `.env.example`. Then create the tables:

```bash
npm run db:migrate
```

Coming from the old file store? `npm run db:import-local` copies `data/sessions`, `data/objectives`
and `data/logs` into the database (safe to re-run — existing rows are skipped; files are left
alone).

After changing `lib/db/schema.ts`, run `npm run db:generate` to write a new migration into
`drizzle/` (commit it), then `npm run db:migrate`.

**Production:** see "Deployment" below.

### Sign-in (Clerk)

Every page past the landing page and every API route requires a signed-in user (Clerk). Create an
application at https://dashboard.clerk.com (name it "Elocu" — that's what the sign-in card shows),
enable the sign-in methods you want (e.g. Google + email), and put its keys in `.env.local`:

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

Sign-in/up live at the app's own `/sign-in` and `/sign-up`; the account menu is in the header.

How it's enforced — the redirect is just the front door; the isolation is in the data layer:
- `app/(app)/layout.tsx` sends signed-out visitors on any app page to `/sign-in`.
- Every API route starts with `lib/auth.ts`'s `getApiUserId()` and answers a signed-out call with
  `401` before doing anything (this also keeps strangers from spending your LLM budget).
- `lib/store.ts` scopes every query to that user id, so one user's sessions, feedback, goals, and
  Insights are invisible to another — another user's session id reads as `404`.
- `proxy.ts` runs Clerk on every request; it deliberately doesn't gate by URL pattern (Clerk
  deprecated that in favor of the per-resource checks above).

**Bringing over pre-sign-in history:** after importing (`npm run db:import-local`), sign up in the
app, then hand the imported rows to your account:

```bash
npm run db:claim-local -- you@example.com   # or your Clerk user_… id
```

### Rate limits

Every route that calls an LLM — starting a session, each reply, retry, pause/end grading, regrade,
and "Suggest targets" — draws from one per-user budget: **20 calls a minute and 300 a day** by
default (a full session is about 15), set with `RATE_LIMIT_PER_MINUTE` / `RATE_LIMIT_PER_DAY`.
Over the limit, the route returns `429` with a readable message and `Retry-After`, and nothing is
half-done: a limited reply isn't saved (the session page puts the text back in the input), a limited
End leaves the session open, and a limited start creates no session. Anything that doesn't reach a
model (a cached pause, a retry with nothing pending) isn't counted. Counters live in the
`rate_limits` table (`lib/rateLimit.ts`); windows are fixed (per UTC minute / UTC day).

### LLM providers

Elocu calls out to an LLM for two things: the live conversation loop and the post-session grading
pass (`lib/conversation.ts`, `lib/grading.ts`, both going through `lib/llm.ts`). Each has its own
**primary → fallback → fallback** chain, tried in order, stopping at the first success:

| | Primary | Fallback | Last resort |
|---|---|---|---|
| Conversation | Groq `openai/gpt-oss-20b` | OpenRouter (free Gemma) | Ollama |
| Grading | OpenRouter `anthropic/claude-haiku-5.5` | Groq `openai/gpt-oss-20b` | Ollama |

- **Groq** — get a key at https://console.groq.com/keys. Fastest (~1s), which is what the live
  conversation needs. Its free tier allows 8,000 tokens a minute; grading waits out a short
  rate-limit once rather than failing.
- **OpenRouter** — get a key at https://openrouter.ai/keys. Grading uses a paid model there (about
  a tenth of a cent per graded session, ~8s), chosen for feedback quality over speed — see
  `plan.md` §52 for the comparison. The account needs credit; without it grading falls back to Groq.
- **Ollama, local** — optional. If you have [Ollama](https://ollama.com) running
   locally with a model pulled (`ollama pull llama3.2` is the one benchmarked and wired in by
   default), it's used as a last resort if both of the above fail. No API key needed. Free, fully
   private, no network dependency — but noticeably slower than the hosted options, which is why
   it's last in the chain, not first.

You technically only need Groq to run the app — without OpenRouter, grading simply uses its Groq
fallback. See `.env.example` for all the model-override env vars
(`GROQ_MODEL_CONVERSATION`, `OPENROUTER_MODEL_GRADING`, etc.) if you want to point any tier at a
different model.

## Running

```bash
npm run dev
```

Open http://localhost:3000 for the landing page, or go straight to http://localhost:3000/app — you'll
be asked to sign in first (needs Postgres running and the Clerk keys set; see Setup).

```bash
npm run build   # production build
npx tsc --noEmit   # type-check
npm run lint
```

## Deployment

Live at **https://elocu-six.vercel.app** — a private beta: Clerk's Access mode is **invite-only**,
so new people join only by invitation.

**Inviting a tester** — use the script:

```bash
npm run beta:invite -- someone@example.com            # send an invitation
npm run beta:invite -- someone@example.com --resend   # revoke the pending one and send a fresh one
```

It creates the invitation through Clerk's API with its redirect set to the live app's `/sign-up`,
where the app's own `<SignUp>` consumes the invitation — something the Clerk dashboard can't do
(dashboard invites carry no redirect and go through Clerk's hosted sign-up page). It won't invite an
address that already has an account, and won't double-invite without `--resend`; Clerk has no
resend call, so `--resend` revokes the pending invitation (its link stops working — the tester must
use the newest email) and issues a new one. `ELOCU_APP_URL` overrides the live URL.

Dashboard invites (Users → Invite) still work: the Clerk instance's development origin is set to
`https://elocu-six.vercel.app` (via the backend API — `PATCH /v1/instance`, `development_origin`;
the dashboard doesn't expose it), so after signing up on Clerk's hosted page the tester is sent to
the live site. It was empty before, which left hosted-page sign-ups with nowhere to return to. If
the site moves to a new URL, update it the same way.

| Piece | Where |
|---|---|
| App | Vercel project `elocu`, connected to GitHub — every push to `main` deploys to production, other branches get preview URLs. Functions run in `iad1` (Washington, D.C.). |
| Database | Neon Postgres (us-east-1), added through Vercel's Neon integration, which sets `DATABASE_URL` (pooled — what the app uses) and `DATABASE_URL_UNPOOLED` (direct) on the project. |
| Sign-in | Clerk **development** keys. Clerk production keys can't run on a `*.vercel.app` domain — they need a domain you own — so the sign-in card shows a "Development mode" badge until one is added. |
| Env vars | `GROQ_API_KEY`, `OPENROUTER_API_KEY`, the model overrides, and both Clerk keys, set for Production and Preview. No Ollama — a local model isn't reachable from Vercel, so a Groq + OpenRouter double failure is a user-facing error there. |

**Schema changes.** Vercel doesn't run migrations. The Neon variables are marked sensitive, so
`vercel env pull` returns them blank — copy `DATABASE_URL_UNPOOLED` from the Vercel dashboard
(Storage → the database → `.env.local` tab) into your `.env.local` under that same name (the app
ignores it), then, before pushing the change:

```bash
npm run db:generate                                           # writes drizzle/NNNN_*.sql — commit it
DATABASE_URL="$(grep '^DATABASE_URL_UNPOOLED=' .env.local | cut -d= -f2-)" npm run db:migrate
```

Preview deployments share the production database (the integration set the same variables for
both), so test destructive changes locally first.

**Beta report.** Clerk holds who's invited and who has an account; the database holds what they
do. One read-only command joins the two:

```bash
npm run beta:report -- --prod   # production (uses DATABASE_URL_UNPOOLED); omit --prod for local
```

It lists invitations (pending/accepted/expired — revoked ones aren't shown), and per account: joined, last active, sessions (and how
many ended), graded sessions and average score, modes used, AI calls (all-time and last 7 days),
failed calls, tokens, today's usage against the daily cap, and last session — plus any data under a
user id Clerk doesn't know (e.g. unclaimed `local-user` imports), and totals with tokens per session.

**First-time setup, for the record:** `vercel link` + `vercel git connect`; Neon via the Vercel
dashboard (Storage → Neon, accept terms, connect to the project); `vercel env add` for each key;
`db:migrate` → `db:import-local` → deploy → sign up on the live site → `db:claim-local -- <email>`
(all against the unpooled Neon URL); then Clerk → Configure → Access mode → Restricted.

## Architecture

- **`lib/llm.ts`** — provider-agnostic chat-completion wrapper (Groq/OpenRouter/Ollama are all
  OpenAI-compatible APIs, so one implementation covers all three) with automatic fallback chaining,
  a 45s per-call timeout that guards the *whole* round trip (not just headers), and structured
  logging. A model choice can carry an output-token ceiling and a reasoning effort; callers can
  reject an answer cut off at that ceiling, and wait out a short provider rate limit once.
- **`lib/persona.ts`** — builds the system prompt per mode; same engine, different prompt/rubric
  inputs depending on mode and whether documents were attached. The debate opponent is told it
  can't look anything up: it argues from reasoning and must not state statistics, studies, or
  named sources as fact (it used to invent them — `plan.md` §53).
- **`lib/conversation.ts`** — the live turn-taking loop. Fully decoupled from grading, which runs
  as a separate call after the session ends (or is paused) — the conversation stays fast, grading
  can afford to be more careful.
- **`lib/grading.ts`** — rubric-driven structured JSON output, with `validateQuotedMoment()`
  guarding against a model quoting the wrong speaker (verified this happens in practice — the
  guard strips just the bad quote, keeps the score/fix). When documents were attached, they're
  included in the grading prompt so Context Fit is judged against the actual job description and
  resume; if that larger prompt gets no usable answer, grading runs once more from the transcript
  alone. Every turn now carries its *real* elapsed
  duration (see below), and for Pitch mode that real duration is handed to the grading prompt as
  objective pacing data (target vs. actual time, words/minute) so the Delivery fix can say "you ran
  12 seconds over" instead of guessing pace from word choice alone.
- **`lib/deliveryMetrics.ts`** — words-per-minute, filler-word density (`um`, `like`, `you know`,
  etc.), and hedging-word density (`i think`, `just`, `kind of`, etc.), computed deterministically
  from real turn duration + transcript text for every mode, not just Pitch. Feeds `lib/grading.ts`'s
  Delivery prompt as measured fact and shows as an always-accurate stat line on the feedback page
  independent of whether grading itself succeeds.
- **`lib/contentMetrics.ts`** — vocabulary diversity (type-token ratio), feeding the Content section.
- **`lib/conversationMetrics.ts`** — talk-time ratio and question-asking rate, Conversation mode
  only (the back-and-forth shape that makes these meaningful doesn't apply to a Pitch/Speech
  monologue or Interview/Debate's different turn-taking norms). Feeds the Engagement section.
- Interview mode's Structure section is graded explicitly against the **STAR method**
  (Situation/Task/Action/Result) — not a computed metric, a grading-prompt refinement in
  `lib/grading.ts`'s `interviewStructureNote()`.
- **`lib/auth.ts`** + **`proxy.ts`** — Clerk sign-in. `getCurrentUserId()` (pages; redirects to
  `/sign-in`) and `getApiUserId()` (API routes; `401` when signed out) are the only ways code gets a
  user id. See "Sign-in (Clerk)" above.
- **`lib/store.ts`** — persistence, on Postgres (`lib/db/schema.ts`). Every function takes the
  caller's user id (from `lib/auth.ts`'s `getCurrentUserId()`) and filters on it; a row owned by
  someone else reads as not found and can't be overwritten or deleted.
- **Voice settings** (`/app/voice`, `lib/useVoiceSettings.ts`) — pick the AI's voice (female/male,
  from the curated set) and delivery style up front, each with a spoken sample; the start page has
  a quick Female / Male choice. Saved in `localStorage`. The session page has no picker.
- **`lib/useSpeech.ts`** — browser Web Speech API wrapper. Push-to-talk-until-you're-done: the mic
  stays open across pauses (not silence-triggered), tapping it again is how you signal "I'm done."
  A finished spoken turn then lands in an editable **review box** before it's sent
  (`app/(app)/session/[id]/page.tsx`), so a mis-heard word or dropped phrase can be corrected before
  it's quoted back and counted toward the delivery/content metrics — the real speaking duration is
  captured at the moment the mic stops, so time spent reviewing never skews pace or pitch timing.
  Replies are spoken in the voice and delivery-style preset (Neutral/Soft/Persuasive/Harsh/Bossy,
  via pitch/rate) chosen on the Voice settings page, persisted in `localStorage`. Voices are grouped by a best-effort gender guess from the voice name
  (`lib/voiceCategories.ts`) — the Web Speech API exposes no gender/personality field at all — and
  restricted to a small cross-platform curated allowlist (`isCuratedVoice()`) rather than every voice
  the OS happens to expose (macOS alone can list ~180, including novelty/effect voices like Zarvox or
  Bubbles that sound garbled, not natural). Enforced in two places: the picker only ever lists curated
  voices, and `speak()` will only match a `voiceURI` against the curated subset, so a stale
  `localStorage` value pointing at an uncurated voice can never actually be spoken.
- **Turn duration is real, not a same-instant double timestamp.** The session page
  (`app/(app)/session/[id]/page.tsx`) tracks the moment the floor becomes the user's — a mic tap, or
  the AI's previous line finishing — and sends the real elapsed time to
  `POST /api/sessions/[id]/messages`, which stamps the turn's `startTs`/`endTs` from it instead of
  calling `Date.now()` twice back to back. This is what makes Pitch mode's live countdown and its
  grading feedback honest, and it applies to every mode, not just Pitch.
- **Sessions can be paused** (`/api/sessions/[id]/pause`) to get feedback on the conversation so
  far without ending it — the session stays resumable, unlike `/api/sessions/[id]/end` (permanent).
  Both routes are idempotent about the grading LLM call itself, keyed on `Feedback.gradedTurnCount`
  (`lib/types.ts`): `/pause` skips the call (returns the cached feedback) whenever nothing's changed
  since the last pause, and `/end` reuses cached feedback on repeat calls or revisits — but both
  regrade for real when turns were added since that feedback was generated (pause → keep talking →
  end), or when an un-ended session's last attempt actually failed. `/api/sessions/[id]/regrade` is the
  escape hatch for a session that already ended with `gradingFailed` (a parse failure or a provider
  outage): it re-runs grading in place, but only when the cached feedback is a genuine failure
  placeholder, so a good result can't be spent on another call. The feedback page surfaces it as a
  "Retry grading" button on the failure banner.
- **History sidebar** (`app/components/HistorySidebar.tsx`) lists every session, in-progress and
  completed, linking to the right place (resume vs. view feedback) for each. At phone width the
  sidebar is hidden and the header's "History" button opens the same list (`HistoryList`) in a
  drawer. Discarding a session
  (which deletes its transcript and feedback, no undo) arms an inline confirm first rather than
  deleting on the first click.
- **Insights dashboard** (`/app/insights`) — overall average, per-section breakdown, and a
  score-over-time trend, aggregated across every graded session (`lib/progress.ts`). Only counts
  sessions where grading actually succeeded toward the averages. Filterable per mode (`?mode=X`,
  tabs only shown for modes you've actually practiced) — an unfiltered view also shows the
  cross-mode breakdown; a filtered one swaps that for a "best section" callout. Also aggregates the
  real, deterministic metrics from `lib/deliveryMetrics.ts`/`contentMetrics.ts`/
  `conversationMetrics.ts`/`pitchMetrics.ts` — average pace, filler/hedge density, vocabulary
  diversity everywhere; talk-time ratio and question-asking rate for Conversation; time-budget
  adherence for Pitch. A "Your strength" callout (`lib/progress.ts`'s `getStrengthSummary()`) names
  your top-scoring section instead of leaving it as a bar to interpret, and the section/mode
  breakdowns are explicitly numbered (`#1`/`#2`/...). Beside it, a "Focus next" callout
  (`getFocusArea()`) names the lowest section, whether it's a recurring pattern across your last 5
  sessions, and the latest real grading fix for it, linked back to that session; the Delivery
  section lists the specific filler/hedge words you've used most lately (`getRecentWordHabits()`).
  Both are deterministic over existing feedback — no extra LLM call. Metric tiles carry the same
  hover/tap definitions as the feedback page (`lib/metricDefinitions.ts`).
- **Goals** (also on `/app/insights`, via `app/components/ObjectiveForm.tsx`) — an optional, freely
  addable `Objective` (`lib/types.ts`, `lib/objectives.ts`) tracked against your *entire* session
  history, not one session, with a free-text note and **zero or more independent numeric targets**
  (`Objective.targets`) — each its own metric (a score, pace, filler/hedge %, vocabulary diversity,
  talk-time, question rate, or pitch timing accuracy, optionally scoped to one mode), each individually
  addable, editable, and removable (`app/components/ObjectiveCard.tsx`'s inline `TargetEditor`, shared
  option list in `app/components/objectiveTargetOptions.ts`), always shown with its mode scope stated
  explicitly (including `(any mode)` when there isn't one). Distinct from a session's `goalLabel`
  above, which just groups repeated attempts at one specific thing. Progress advice is never a new LLM
  call: for `overallScore`/`sectionScore` it's the real, most-recently-generated grading fix for that
  exact section; for every other metric it's computed deterministically from the real counted data in
  the most recent qualifying session (`lib/objectives.ts`'s `deterministicAdviceFor()` — e.g. names the
  actual filler/hedge words and counts) rather than reusing a whole-section fix that might be about
  something else within the same section. A goal can request **"Suggest targets for me"** at any time
  (`lib/objectiveSuggestion.ts`) — a one-off LLM call (OpenRouter primary, local Ollama fallback,
  deliberately no Groq — benchmarked for accuracy on this specific mapping task, not speed, since it's a
  user-triggered click, not something blocking the live conversation) that proposes concrete
  metric+target options with a rationale; each can be added alongside whatever targets already exist,
  not just swapped in for a single one.

## Logs

Every LLM call — which provider/model actually handled it, latency, token usage, success/failure —
is recorded in the `llm_call_logs` table, independent of any provider's own dashboard. Each entry also carries a `providerRequestId`: for OpenRouter this can be looked up
directly via `GET https://openrouter.ai/api/v1/generation?id=<id>` for full cost/token stats on
that exact call. Grading responses that fail to parse are separately logged (with the raw model
output) to the `grading_failures` table. Both are also echoed to the server log.

**In-app**: open any session's feedback screen → "View call log" (`/session/[id]/logs`) to see
which model answered each conversation turn and which one evaluated the session, with timing and
status, without touching the terminal.

```bash
psql "$DATABASE_URL" -c "select ts, provider, model, label, ok, duration_ms from llm_call_logs order by ts desc limit 20"
```
