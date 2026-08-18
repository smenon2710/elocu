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
