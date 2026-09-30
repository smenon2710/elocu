# Elocu — Multi-Tenancy & Monetization Plan

Planning document only — nothing in here is built yet. Written to be picked up and executed against
directly when the time comes, not a vague roadmap. Assumes the product stays what it is today (an
individual practicing alone against an AI), so the target shape is **per-user SaaS accounts**, not
multi-user organizations/teams — see "Explicitly out of scope for now" below for why, and what would
change if that assumption turns out to be wrong.

---

## 1. Where the app actually stands today

Worth being precise about this before planning changes, since some of it is better-prepared for this
than it looks, and one part of it is a real, live security gap, not just a scaling limitation.

- **No auth exists.** `lib/types.ts`'s `LOCAL_USER_ID = "local-user"` is a single hardcoded constant.
  Every session is created with `userId: LOCAL_USER_ID` (`app/api/sessions/route.ts`) — but that field
  is **write-only**. Nothing anywhere in the codebase ever reads it back to check who's allowed to see
  a session. `getSession(id)` returns any session by id, full stop, no ownership check. In a
  multi-tenant world where session ids might be enumerable or simply shared, **that's a real
  authorization hole to close, not just a "no login screen" gap** — closing it is part of "add auth,"
  not a separate follow-up.
- **Storage is flat files, not a database.** `lib/store.ts` reads/writes `data/sessions/{id}.json` and
  `{id}.feedback.json` directly via `fs`, and every list/aggregate function (`listSessions`,
  `listAllFeedback`, `listGoalLabels`, `computeProgressStats`, etc.) works by reading every file in the
  directory and filtering in memory. This is the real blocker for a public deployment at all (Vercel's
  filesystem is ephemeral per invocation — see `plan.md` §22), separate from multi-tenancy.
- **The one thing already done right:** `lib/store.ts` is a genuinely clean persistence boundary — it
  was deliberately built that way in Phase 1 (`plan.md` §5: "Swapping to a real DB later is contained
  to this one file") and it held. Every page/route already goes through `lib/store.ts`'s exported
  functions rather than touching `fs` directly. That means the database migration below is a
  **rewrite of one file's internals**, not a hunt-and-replace across the app — the bet made on day one
  paid off exactly as intended.
- **LLM cost is the real variable cost driver.** Every conversation turn and every grading call is a
  paid API call (Groq primary, OpenRouter/Ollama fallback — `lib/llm.ts`). `lib/llm.ts` already logs
  `usage` (token counts) and `providerRequestId` per call to `data/logs/llm-*.jsonl` — a real foundation
  for cost tracking, just not yet queryable or scoped per user.
- **No billing, no plans, no usage limits of any kind.** Every session is unlimited today.

---

## 2. What "multi-tenancy" actually requires here

### 2.1 Authentication
Don't build this from scratch — password hashing, session/token management, email verification, and
password reset are all security-sensitive, well-solved problems. Use a managed provider:

- **Recommended: [Clerk](https://clerk.com)** or **[Supabase Auth](https://supabase.com/docs/guides/auth)**
  — both are Next.js-native, both ship prebuilt sign-in/sign-up UI (saves real time), both have
  generous free tiers that comfortably cover an early-stage product.
- **Alternative: [Auth.js](https://authjs.dev)** (formerly NextAuth) if avoiding a third-party auth
  dependency matters more than saving UI-building time — free, self-hosted, well-integrated with
  Next.js, but you build the sign-in/sign-up screens yourself.
- Either way: the output is a real `userId` (replacing `LOCAL_USER_ID`) available in every API route
  via the provider's session-reading helper.

### 2.2 Database migration (Postgres)
- **Recommended: Postgres** (via [Neon](https://neon.tech), [Supabase](https://supabase.com), or
  Vercel Postgres) over a KV/NoSQL store — the data is genuinely relational (users → sessions →
  feedback → goals), and several things `lib/store.ts` currently does by scanning every file in a
  directory (`listGoalLabels`, `computeProgressStats`'s per-mode/per-section aggregation) become
  trivial indexed SQL queries instead.
- **ORM: [Drizzle](https://orm.drizzle.team) or [Prisma](https://www.prisma.io)** — either is a
  reasonable Next.js-native choice; Drizzle is lighter/closer to raw SQL, Prisma has more mature
  migration tooling. Not a decision that needs to be litigated far in advance.
- **Schema sketch** (not final, but the shape):
  - `users` (id, email, created_at, plan, stripe_customer_id, ...)
  - `sessions` — the existing `Session` shape (`lib/types.ts`), plus `user_id` FK. `turns` and
    `documentRefs` can stay as JSONB columns rather than fully normalizing — they're always read/written
    as a whole per session, never queried by turn, so JSONB avoids pointless join complexity.
  - `feedback` — the existing `Feedback` shape, `session_id` FK, `sections` as JSONB (same reasoning).
  - `usage_events` (new) — one row per billable action (a conversation turn, a grading call), for the
    metering work in §3. `lib/llm.ts`'s existing per-call logging is the template for what this needs
    to capture; the difference is it needs to be queryable per-user, not just per-day JSONL files.
- **Migration mechanics:** `lib/store.ts`'s exported function *signatures* mostly stay the same shape
  (`getSession`, `saveSession`, `listAllFeedback`, ...) — only the implementation changes from `fs`
  calls to SQL queries, and every function gains a `userId` parameter for scoping. Every caller
  (API routes, Server Component pages) needs that one added — mechanical, but touches every file that
  currently imports from `lib/store.ts`.

### 2.3 Row-level tenant isolation (the part that's easy to get wrong)
Two distinct things, both required, easy to do only one of and call it done:
1. **Authentication** — knowing who's making the request (§2.1).
2. **Authorization** — checking that the thing they're asking for actually belongs to them. This is
   the part `getSession(id)` skips entirely today. Every read/write in every API route needs an
   explicit `WHERE user_id = $currentUser.id` (or equivalent ownership check before acting), not just
   "logged in or not." This includes `data/logs/` (call logs, grading-failure logs) — currently scoped
   only by `sessionId`, which needs the same ownership check before being served back to a request.

### 2.4 Existing dev data
The sessions already in `data/sessions/` (all under `LOCAL_USER_ID`) are real accumulated local
practice data, not synthetic — worth a deliberate decision, not an accident, about whether to (a)
treat it as throwaway dev data and start clean in production, or (b) write a one-time migration
script to import it under a real seed account. Either is fine; just shouldn't be a default that
happens by not thinking about it.

---

## 3. What "monetization" actually requires here

### 3.1 Billing
- **Stripe** — the standard choice, no real reason to consider alternatives at this scale. Stripe
  Checkout for the upgrade flow, the Stripe Customer Portal for self-serve plan management
  (upgrade/downgrade/cancel — don't build this UI yourself, Stripe's hosted portal covers it), and
  webhooks (`checkout.session.completed`, `customer.subscription.updated`,
  `customer.subscription.deleted`) to keep each user's `plan`/`status` in the database in sync.

### 3.2 Pricing model
The real cost driver is LLM calls, so the plan should be shaped around that, not invented in a vacuum:
- **Recommended starting shape: one free tier + one paid tier**, not a multi-tier ladder — there's no
  usage data yet to justify more complexity than that, and a simple "free vs. paid" choice converts
  better than a confusing tier matrix for a product this early.
  - **Free**: a capped number of sessions/month (e.g. 3-5) — enough to genuinely try every mode once,
    capped enough to bound free-tier LLM cost exposure.
  - **Paid**: unlimited (or a much higher cap) sessions/month, single price point, monthly + annual
    options once there's any signal on willingness to pay.
- Gating by **session count**, not raw token/cost usage, for the user-facing limit — "5 free sessions"
  is legible in a way "10,000 tokens" isn't. Token/cost tracking still matters, just as an *internal*
  ops metric (see §3.4), not the customer-facing number.
- Explicitly **not recommended for v1**: per-mode paywalls (e.g. "Interview free, Debate paid") — adds
  real complexity to the mode selector and persona logic for a pricing distinction that has no evidence
  behind it yet. Revisit once there's usage data showing which modes people actually value most.

### 3.3 Usage metering & entitlement enforcement
- A `usage_events` row (or a simpler running counter) per session created, scoped to the user's current
  billing period.
- `POST /api/sessions` (session creation) is the one enforcement point that matters — check the
  requesting user's current-period count against their plan's limit *before* creating a session (and
  before spending an LLM call on the opening line), redirect to upgrade if over. Every other route
  operates on an already-created session, so it doesn't need its own separate limit check.

### 3.4 Cost management
- `lib/llm.ts`'s existing per-call `usage` logging is the right foundation — once on Postgres, log
  every call's token usage against the acting `userId`, not just to a JSONL file, so "which users/plans
  are actually costing the most" is a queryable question, not a `grep` exercise.
- **The Ollama fallback tier needs a decision, not silent inheritance.** In production, `localhost:11434`
  simply isn't reachable — if Groq *and* OpenRouter both fail for a request, there's currently nothing
  left in the chain to fall back to, and the user gets a hard error. Either accept that (rare enough
  given both are paid, monitored providers) or add a second paid fallback provider for the production
  deployment specifically. This is a real production-readiness question, not a nice-to-have.
- Set up basic cost alerting (Groq/OpenRouter dashboard alerts, or a scheduled job querying the new
  `usage_events` table) before opening signups publicly — a runaway loop or an abuse pattern
  shouldn't be discovered via the bill.

### 3.5 Legal basics
Terms of Service and a Privacy Policy become real requirements once handling real user accounts and
payments, not optional polish. Worth flagging specifically for this product: sessions can contain
resumes, job descriptions, and fairly personal practice content (mock interviews, debate positions,
pitches) — a privacy policy addressing retention and deletion isn't boilerplate here, it's something
users will reasonably want to know before they upload a resume to practice against.

---

## 4. Explicitly out of scope for now

- **Teams/organizations.** If this ever needs "a coaching business manages multiple clients" or "a
  company buys seats for its employees," that's a materially different data model (orgs, roles, seat
  management, shared billing) layered on top of the per-user model above, not a variation of it. Not
  worth designing preemptively without a concrete need driving it — the per-user model doesn't block
  adding this later, it just doesn't try to anticipate it now.
- **Usage-based (metered) billing.** Charging per-session or per-minute instead of a flat subscription
  is possible with Stripe but adds real complexity (metered billing API, more complex webhook handling,
  harder-to-predict bills for users) for a product that doesn't yet know its own cost-per-user well
  enough to price that way credibly.
- **Multi-region / data residency.** Not a real requirement until there's a specific customer or
  regulatory reason for one; a single-region Postgres deployment is the right default.

---

## 5. Phased rollout

Each phase is independently shippable and de-risks the next one, rather than one large-bang rewrite.

**Phase 0 — Storage migration (no user-facing change)**
Move `lib/store.ts` off the filesystem onto Postgres while still single-tenant (`LOCAL_USER_ID`
stays as the only user). Validates the schema and query patterns in isolation from auth/billing risk.
This phase alone also unblocks a public *demo* deployment (Vercel-compatible storage), even before
real accounts exist.

**Phase 1 — Auth & multi-tenancy**
Integrate the auth provider; replace `LOCAL_USER_ID` with real `userId` everywhere; add the
authorization checks flagged in §2.3 to every route. Decide on the existing dev-data question (§2.4).
Exit criterion: two different real accounts can use the app simultaneously and never see each other's
sessions.

**Phase 2 — Monetization**
Stripe integration, the free/paid plan model, `usage_events` + the one enforcement point in
§3.3, the Customer Portal for self-serve management.

**Phase 3 — Production hardening**
Rate limiting/abuse prevention (materially more important once real money is on the line per abusive
request), the Ollama-fallback decision from §3.4, cost alerting, error tracking (e.g. Sentry), ToS/
Privacy Policy, and the actual Vercel deployment + production env var/secrets setup.

---

## 6. Open decisions for whoever picks this up

Flagging these explicitly rather than silently picking defaults, since they're genuinely judgment
calls, not technical questions with one right answer:

1. **Auth provider** — Clerk/Supabase (faster, prebuilt UI, third-party dependency) vs. Auth.js (more
   setup work, no new vendor). Recommendation above; not a foregone conclusion.
2. **Free tier session cap** — 3? 5? Depends on wanting the free tier to feel generous enough to
   convert vs. cost exposure per free signup; needs at least a rough LLM-cost-per-session number
   (derivable from the existing `lib/llm.ts` usage logs) before picking a number with confidence.
   worth computing before committing to a cap.
3. **Price point** — no data yet to anchor this; competitive interview-prep/coaching tools are the
   closest reference point, not generic SaaS pricing benchmarks.
4. **Whether to preserve existing local dev-session data** into the first production database, or
   start clean (§2.4).

---

## 7. Deploying to Vercel: what actually breaks, and the minimum to fix it

> **Deployed 2026-09-30** — https://elocu-six.vercel.app, private beta (Clerk invite-only). What was
> actually done, and the two surprises (Clerk production keys need a custom domain; Neon's variables
> can't be pulled locally), are in `plan.md` §46 and README "Deployment".

The near-term intent is a Vercel deploy — a **private demo first**, not a public or paid launch.
This section is §5's Phase 0 made concrete for that target, plus the Vercel-specific gotchas that
aren't obvious from the phased plan.

### 7.1 The hard blocker: the filesystem is read-only on Vercel
`lib/store.ts` writes under `path.join(process.cwd(), "data", "sessions")`. On Vercel `process.cwd()`
resolves to `/var/task`, which is **read-only** — the first `POST /api/sessions` hits
`fs.mkdir(...)` / `fs.writeFile(...)` and throws `EROFS`, and the route 500s. This is not "data is
lost on redeploy" — nothing works from the first write. The same applies to the JSONL log writes in
`lib/llm.ts` (`fs.appendFile`, ~line 79) and `lib/grading.ts` (~line 32). `/tmp` is the only writable
path, and it's per-instance and wiped constantly, not shared across concurrent invocations —
repointing `data/` there gets a demo where a session vanishes between being created and the first
message being posted. Not worth doing. **Phase 0 (Postgres) is a hard prerequisite for any Vercel
deploy, not an optimization.**

### 7.2 Minimum to make a Vercel deploy work
This is Phase 0 scoped down to exactly what Vercel forces. **Items 1–3, 5 and 7 are done
(2026-09-30, `plan.md` §44)** — storage is on Postgres with every query user-scoped, logs are
tables, LLM routes set `maxDuration`, and the local data has an import script. What's left to go
live is creating the Neon database, running the migration + import against it, and item 4.

1. **Postgres** — Vercel Postgres or Neon (both Neon-backed, both have a free tier). Use the
   **pooled** connection string; serverless opens a connection per invocation. `DATABASE_URL` goes
   in Vercel project env vars.
2. **Rewrite `lib/store.ts` internals** — all 14 exported persistence functions, signatures unchanged, `fs` → SQL
   (Drizzle or Prisma per §6 item 1). Tables: `sessions`, `feedback`, `objectives`; keep
   `turns` / `documentRefs` / `sections` / `targets` as JSONB (read/written whole, never queried by
   element); seed one `local-user` row. The directory-scan functions (`listSessions`,
   `listGoalLabels`, `listAllFeedback`, `listAttemptsForGoal`) become indexed queries — which also
   fixes `review.md` §4's "O(n) file reads per page view" finding for free.
3. **Log writers** — move `llm_call_logs` / `grading_failures` to Postgres tables, or (faster for a
   demo) guard the `fs.appendFile` calls to no-op on failure and rely on the existing structured
   `console.log` lines (Vercel captures stdout in its function logs). `/session/[id]/logs` degrades
   to "no logs" if the tables are skipped — acceptable for a demo.
4. **Env vars** — copy `.env.local` (gitignored, won't ship) into Vercel project settings:
   `GROQ_API_KEY`, `OPENROUTER_API_KEY`, any model overrides, `DATABASE_URL`.
5. **Function duration** — grading (`/end`, `/pause`) is a full LLM round trip with a 45s ceiling in
   `lib/llm.ts`, and the fallback chain stacks (~90s worst case). ~~Hobby caps execution at 10s, so
   Pro is required~~ — **corrected 2026-09-30:** with Fluid compute (on by default for new projects)
   Vercel's docs put Hobby's maximum at 300s, so Hobby is enough for a demo. The LLM routes now set
   `maxDuration = 120` explicitly. Pro is still needed once it's commercial — Hobby is for personal,
   non-commercial use.
6. **The Ollama tier is dead on Vercel** — `localhost:11434` is unreachable (already flagged §3.4).
   A Groq + OpenRouter double failure becomes a hard user-facing error with no third fallback.
   Acceptable for a demo; revisit for public per §3.4.
7. **Existing data** — decide import-vs-clean (§2.4): 14 real sessions (each with a feedback file) + 1 objective
   sit on disk under `LOCAL_USER_ID` today.

### 7.3 Protect the deploy
~~There is no auth yet~~ — **Phase 1 sign-in is built (2026-09-30, `plan.md` §45):** every page and
API route needs a Clerk sign-in, and every query is scoped to the user (§2.3 done). What's still
open: anyone can *sign up* and spend LLM budget, and there's no per-user rate limit (`review.md` §6)
— **rate limits done too (`plan.md` §47).**
For a private beta, restrict sign-ups in the Clerk dashboard (allowlist or invitation-only) rather
than relying on Deployment Protection. **Done — Access mode is Restricted (invite-only).** Public =
rate limits + Phase 3.

### 7.4 Smaller Vercel notes
- Set the Vercel function **region** near the Postgres region — grading latency is user-facing.
- Run `npm run build` locally first — the modified Next.js (`AGENTS.md`) may not match Vercel's
  framework auto-detection.
- Verify `lib/documents.ts` PDF extraction runs under Vercel's Node runtime (some `pdf-parse` builds
  touch disk).

---

## 8. Mobile app / Google Play: deferred, and the path if it's picked up

Asked directly how to get Elocu onto the Play Store. **Conclusion: defer entirely until web
monetization is working.** Recorded here so the analysis isn't lost.

**Why defer:** a Play Store app needs a hosted backend (so it's gated on Phase 0/1 regardless), and
Google Play billing takes a 15–30% cut and is a *second* billing integration on top of Stripe — not
worth it for demand that hasn't been proven on the web first.

**If/when picked up, three packaging options:**
- **TWA** (Bubblewrap / PWA Builder) — *recommended*. Runs the deployed site in real Chrome, so the
  Web Speech API (`webkitSpeechRecognition` STT + `speechSynthesis` TTS — the whole voice layer in
  `lib/useSpeech.ts`) keeps working with **no rewrite**. Needs: a public HTTPS domain, a PWA manifest
  (`app/manifest.ts`), `/.well-known/assetlinks.json` with the app's signing-key fingerprint (Digital
  Asset Links), a Play Console account ($25 one-time), a **privacy policy URL** (mandatory — mic
  recording plus transcripts/resumes sent to third-party LLMs; already flagged §3.5), and the Play
  Data Safety declaration.
- **Capacitor** — medium effort. Android System WebView does **not** implement
  `webkitSpeechRecognition`, so STT breaks; `lib/useSpeech.ts` would need rewriting against
  `@capacitor-community/speech-recognition` + `text-to-speech`. Only worth it if a more native shell
  or offline capability becomes a real requirement.
- **React Native / Expo** — a full rewrite, not a conversion.

**Interim option:** ship the web **PWA** (manifest + installable, no store listing, no review
process) — same voice support as TWA, zero billing complications.

**Mobile-web gaps to close first regardless** — all three done 2026-09-30 (`plan.md` §43):
- ~~History sidebar is `hidden … sm:flex` — phones have no way back to past sessions.~~ The header
  now opens the same list in a drawer below `sm`.
- ~~The 4-control session action bar overflows a narrow viewport.~~ Pause/End moved to their own row.
- ~~The curated voice allowlist matches nothing on Android.~~ Picker and `speak()` now share
  `selectableVoices()`: curated voices, else a short English fallback (list kept small per §39).

Still unverified on a real device: iOS/Android speech playback and mic-permission behavior (the new
fallbacks for both are in `lib/useSpeech.ts`).

---

## 9. Sequencing refinements and open questions before starting

### 9.1 Two refinements to §5's phasing
1. **Before Phase 0, compute LLM cost per session** from the existing `data/logs/llm-*.jsonl`
   token-usage data (§1 notes it's already logged per call). It's the direct input to the free-tier
   cap and price point in §6 items 2–3 — picking those numbers without it is a guess. Small analysis,
   high leverage. **Now measured by `npm run beta:report` (`plan.md` §49): ~7,400 tokens/session
   across the owner's 15 sessions as of 2026-09-30** — re-run as beta users add real usage.
2. **Insert a private free beta between Phase 1 and Phase 2** — Vercel Deployment Protection, ~10–20
   real users, a few weeks, no billing. It's the only way to get real usage signal (which modes
   matter, real cost per user, willingness to pay) before committing to a pricing structure. §6 items
   2–3 can't be answered credibly without it.
3. Streaming (`review.md` item 4) — and the mobile-web fixes (§8, now done) — should land **before any public
   launch** — they're conversion-critical — but not before a private beta.

### 9.2 Cheap and worth doing now
The real USPTO trademark search + domain / app-store availability check on "Elocu" (`plan.md` §1
flags it as never properly cleared) — before a domain, a Stripe product, and any store listing are
all named after it.

### 9.3 Open questions needing the product owner's answers (extends §6)
- **Target user** — job seekers / students / working professionals? Sets the price anchor
  (interview-prep tools $20–50/mo vs. practice-habit apps $7–13/mo).
- **Any B2B / institutional angle** (career centers, universities, bootcamps buying seats)? That's
  the teams/orgs data model §4 scoped out — if it's real, it should shape the Phase 0 schema *now*,
  not be retrofitted. (The repo path is `AGS_Purdue`, so worth asking explicitly.)
- **Model shape** — flat monthly subscription (§3.2's recommendation), pay-per-session credits, or
  one-time? Any price point already in mind?
- **Timeline / context** — a launch date, demo day, class, or accelerator this is tied to?
- **Infra budget** — Vercel Pro (~$20/mo) + auth provider + Postgres + carrying LLM cost through a
  free beta; solo-bootstrapped or funded?
- ~~**Auth provider**~~ — **decided 2026-09-30: Clerk + Neon.**
- ~~**ORM**~~ — **Drizzle** (Phase 0, `plan.md` §44).
- ~~**Existing sessions**~~ — **import** (`npm run db:import-local`); they land under `local-user` and
  get reassigned to the owner's Clerk account when sign-in lands.

### 9.4 Next step when work resumes
Phase 0 (`plan.md` §44), Phase 1 sign-in (`plan.md` §45), and the private-beta deploy (`plan.md`
§46) are done. Next, roughly in order:
1. **Invite beta users** and run §9.1's free beta — the real-usage data billing decisions need.
2. ~~**Per-user rate limiting on the LLM routes**~~ — **done** (`plan.md` §47): 20/min and 300/day
   per user by default. Revisit the numbers with real beta usage (§9.1 item 1).
3. **A custom domain** — needed for Clerk production keys (drops the "Development mode" badge and
   the dev instance's limits) and settles the naming question in §9.2.
4. Target-user and B2B answers, then Phase 2 (billing).
