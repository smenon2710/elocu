# Elocu — Phase 1 Plan

*Working title. From "elocution" — the art of clear, expressive speech. Not yet cleared for trademark/domain — see note at bottom of this section.*

## Vision & mission

**Help anyone express themselves with clarity, confidence, and genuine connection — through storytelling, conversation, debate, speeches, and oratory.**

The inspiration is Plato's *Republic* — the idea that human beings sharpen their thinking and improve as a society through dialogue and argument. Reasoning tested out loud, against another mind, is what refines it. That's the deeper bet behind this app: it isn't just an interview-prep tool, it's practice ground for the full range of skills that let a person think and connect out loud — telling a story, holding a conversation, making a speech, and *arguing a position well*.

Debate is a first-class use case, not a side mode. It draws on the same core skills as storytelling and interviewing — structure, clarity, delivery, emotional tone, audience awareness — but adds argumentation-specific skills the app should eventually coach on: building a claim with evidence, anticipating and addressing counterarguments, staying composed and persuasive under pushback, and listening well enough to respond to what was actually said rather than a straw man.

Implications for how the app is built:

- **The rubric is a general communication rubric, not an interview rubric.** Structure, delivery, specificity, engagement are the shared spine across storytelling, interviews, speeches, one-on-one conversation, and debate. Each use case is a *context layer* on top of the same core engine (see the two-layer feedback design below) — not a separate product.
- **"Genuine expression" over generic polish.** The goal is to sharpen someone's own voice and reasoning, not to coach them toward a templated "correct" answer — even in debate, where the aim is a sharper, more honest argument, not just a more aggressive one.
- **Confidence and low-stakes reps matter as much as scoring.** A judgment-free space to practice arguing, speaking, and conversing is itself the product, not just a means to a score.
- **Interview prep is the flagship doorway, not the ceiling.** The rubric, persona system, and grading engine should be built generically from day one so speeches, toasts, pitches, everyday conversation, and debate practice can be added later without rework — even though Phase 1 ships interview prep first.
- **The conversation is the practice, not a means to collect data for scoring.** People get better at conversing by conversing — not by reading tips or answering quizzes. The live back-and-forth with the AI must feel like a real, responsive conversation (follow-ups, reactions, occasional pushback) in its own right. Grading exists to make each conversation teach the user something for the next one — it is in service of the conversation, never the other way around. If a design choice would make the conversation feel more like a form to fill out in order to generate a score, it's the wrong choice.

**Note on the name:** "Elocu" cleared an initial web check with no obvious collisions, unlike an earlier candidate ("Agora," which is heavily used in software/communication, including a well-known real-time voice/video API company). Before locking it in, run a proper USPTO trademark search and check domain/app-store availability directly — a web search isn't a substitute for that.

---

## Scope decision

**In scope for Phase 1:** zero-friction conversation, document upload as an optional enhancement, per-session feedback broken into sections.

**Explicitly deferred:** video monitoring, live in-session coaching nudges, longitudinal analytics dashboard, monetization, story library.

**Pulled forward from deferred:** multiple interviewer personas — now shipped as an explicit mode system (see §8) rather than staying implicit in whether documents were uploaded.

Rationale: everything deferred is a layer on top of the conversation + grading engine. Nothing about them changes the core data model if we design the session and feedback schema properly now (see "Data model" below) — so deferring them costs nothing later.

---

## 1. User flow

1. **Open app** — no setup screen. Prompt: *"What do you want to talk about?"* with 3–4 starter suggestions (e.g. "Tell me about a time you solved a hard problem," "Pitch me an idea you're excited about").
2. **Optional enhancement** — a visible but non-blocking option to upload a resume, job description, or question list. Can be done before starting or offered mid-conversation ("Want to upload a JD so I can tailor this?").
3. **Conversation** — voice-based back-and-forth. The AI asks questions, follows up, and responds like an attentive listener/interviewer, not a form.
4. **Session ends** — user ends the conversation manually, or after a set number of exchanges.
5. **Feedback screen** — per-section scores + specific examples + one concrete fix per section (detailed below).
6. **(Later)** — user can start a new session anytime; trend view arrives in a future phase.

---

## 2. Two-layer feedback design

This is the part that makes "no documents needed" actually work end-to-end.

- **General layer (always active)** — storytelling structure, delivery, clarity, engagement. Runs on any conversation, regardless of whether documents were uploaded.
- **Context layer (active only if documents were provided)** — relevance to a specific job description, alignment with resume claims, coverage of a specific question bank.

The interviewer persona itself is generated the same way: no docs → "curious, attentive conversation partner" system prompt; docs present → role/company-flavored interviewer system prompt built from the uploaded context. Same engine, different prompt inputs.

---

## 3. Feedback sections (per-session)

Each section gets its own score, at least one quoted/timestamped moment from the transcript, and one concrete, specific fix (not generic advice).

| Section | What it measures |
|---|---|
| **Delivery** | Pace/rhythm, filler words & hedging language, use of pauses (dead air vs. intentional) |
| **Structure** | Clear shape to the answer (setup → tension → resolution), strong opening line vs. throat-clearing, landing on a clear takeaway |
| **Content** | Specificity vs. vague generality, relevance to the question asked, conciseness |
| **Engagement** | Hook strength of the opening, emotional variation vs. flatness, awareness of the listener/context |
| **Context fit** *(only if docs uploaded)* | Alignment with JD/resume, coverage of the provided question bank |
| **Argumentation** *(Debate mode only)* | Building a claim with real evidence/reasoning, addressing the opponent's actual counterarguments (not a strawman), staying composed and persuasive under pushback |

Example fix format: not *"be more concise"* — instead *"cut the first two sentences and start directly with the moment the deadline moved up."*

---

## 4. System architecture (Phase 1 only)

```
Prep documents (optional)
        │
        ▼
Context builder → interviewer persona + question set (or generic persona if no docs)
        │
        ▼
Live conversation loop: Speech-to-text → LLM interviewer → Text-to-speech
        │
        ▼
Transcript (text + audio, timestamped, stored per session)
        │
        ▼
Grading pass — separate LLM call, rubric-driven, structured JSON output
        │
        ▼
Per-session feedback screen
```

Key principle: **grading is decoupled from the live loop.** The conversation stays fast; grading can afford to take longer and be more thorough, since it runs after the session ends.

---

## 5. Data model (design now, even though later features are deferred)

Design the session/feedback schema so nothing needs restructuring when the dashboard, video, or other features arrive later.

- `session`: id, user_id, timestamp, mode (interview / conversation / speech / orator / debate — an explicit user choice, decoupled from whether documents were uploaded), documents_used (bool + refs), transcript_ref
- `transcript`: turns with speaker, text, audio_ref, start/end timestamps
- `feedback`: session_id, per-section scores (structure/delivery/content/engagement/context_fit), quoted moments per section, fix suggestion per section
- Keep scores **numeric + per-category** from day one (not a single blended score) — this is what makes a future trend dashboard a pure query over existing data rather than a schema change.

---

## 6. Build order

1. **Text-only conversation engine** — get the interviewer persona and follow-up logic right before adding voice. This is where most of the design difficulty lives.
2. **Add voice** — STT in, TTS out, around the same loop. New problems here are latency and turn-taking, not conversation quality.
3. **Grading pass** — build against real transcripts from step 2, structured JSON output per the sections above.
4. **Feedback screen** — turn the grading JSON into the per-section UI.
5. **Optional document upload** — layered in once the general (no-doc) path already works end-to-end.

---

## 7. Open questions to resolve before/while building

- Does the interviewer track lightweight session state (e.g. "already covered: teamwork — still need: weakness question"), or just react to the running transcript?
- Exact rubric definitions and score ranges per section (e.g. 1–5, or qualitative bands) — needs its own pass once this plan is approved.
- How many exchanges constitute a "session" by default, and how the user ends one.

---

## 8. Mode system (post-Phase-1 addition)

Real use surfaced that "interview vs. free-talk, driven by whether docs were uploaded" wasn't enough
— the user wanted explicit modes for the other use cases §"Vision & mission" already named as
first-class. Same engine per mode (persona + rubric), per the two-layer design in §2 — only the
system prompt and the exchange cap change per mode:

| Mode | Shape | Exchange cap |
|---|---|---|
| **Interview** | Back-and-forth Q&A; tailors to a role if docs are uploaded, generic professional questions otherwise | 12 |
| **Conversation** | Casual peer-to-peer chat, no interviewer framing — the original zero-friction default | 12 |
| **Debate** | User states a position; the AI actively argues the *opposing* side with real counterarguments, not a strawman | 12 |
| **Speech** | User delivers a prepared talk (toast, pitch, remarks); AI stays silent through the whole delivery, then gives one brief reaction | 1 |
| **Orator** | Impromptu persuasive speaking; if no topic is given, the AI invents a concrete, debatable one in its opening line; same silent-listener shape as Speech | 1 |

Documents (resume/JD/question list) remain an optional layer on top of any mode — most naturally
Interview — rather than being what determines the mode.

Debate mode adds a 6th rubric section, **Argumentation** (see §3), scored alongside the general four.

---

## 9. STT interaction model

Real testing surfaced a concrete bug: the original implementation used `SpeechRecognition.continuous
= false`, which ends the recognizer as soon as the browser detects *any* pause — including someone
just pausing to think — and sends that partial transcript as if it were the whole answer. This felt
like being cut off mid-conversation, and would have been worse for Speech/Orator modes where someone
needs to talk for a while uninterrupted.

Fixed by moving to a **push-to-talk-until-you're-done** model, used uniformly across every mode:
the mic stays open (continuous + interim results shown live) across pauses, and only the user
tapping the mic again signals "I'm done" and submits the turn. If the browser's recognizer ends on
its own before that (a silence timeout, or an internal cap on long sessions), a fresh instance
starts transparently underneath, carrying the accumulated transcript forward — the user never
notices the handoff. For Speech/Orator, this pairs with the AI staying fully silent through the
whole delivery (see §8), so a monologue is never interrupted from either side.

---

## 10. Resuming an in-progress session

Documents (resume/JD/question list) and the running transcript already lived entirely inside the
session's persisted file — the only missing piece was a way back to it. The home page now lists
unfinished sessions ("Continue where you left off": mode, topic, turn count, how long ago) with a
link straight into `/session/[id]`, which re-hydrates the full transcript and picks the conversation
back up — no re-uploading documents, no re-explaining context. A "Discard" action removes a session
from the list entirely if it's not worth returning to.

One edge case this surfaced: if a session was interrupted right after the user's turn was saved but
*before* the AI replied (an LLM call failing mid-flight), resuming would otherwise leave the user
stuck with no response and no mic prompt. A small retry step fetches that missing reply
automatically on resume, rather than requiring the user to repeat themselves.

---

## 11. Pause vs. End

Motivated directly by free-tier OpenRouter unreliability (see the timeout/empty-transcript bugs
below) — a user shouldn't have to choose between losing a conversation entirely and getting no
feedback at all just because a model call was slow or flaky. **Pause** (`/api/sessions/[id]/pause`)
grades the transcript as it stands *without* setting `endedAt`, so the session stays fully
resumable — more turns can still be posted, and pausing again later regrades against whatever's
been added since (no stale cached feedback). **End** is unchanged: permanent, idempotent, the
session is done. The feedback page and sidebar both reflect this — a paused session shows "paused"
with a "view feedback" shortcut and a "Resume this session" link, rather than looking finished.

Also fixed while investigating a real report of this: `lib/fetchWithTimeout.ts` only guarded until
response *headers* arrived, not the full body — free models routed through `openrouter/free` were
observed taking 25-60s to stream a response, sailing straight past the intended 20s cutoff
unaborted. Reproduced directly against a mock slow-body server and fixed by keeping the abort timer
armed through body-reading too; default timeout raised to 45s now that it's genuinely enforced.
Also: ending/pausing a session with zero user turns now skips the grading call entirely
(`emptyTranscriptFeedback`) instead of silently producing meaningless "grading unavailable"
placeholder scores.

---

## 12. Per-use-case model selection

`openrouter/free` (an auto-router across whatever free capacity is available) turned out to be the
real root cause of the original timeout issue — it routed across a wide, unpredictable pool of
different underlying free models call to call, some taking under 5s and some 50s+. Pinning specific
models per call site helped, but real logged usage kept surfacing the same underlying problem:
free-tier capacity for larger/"reasoning" models is heavily bottlenecked regardless of which one is
picked (`nvidia/nemotron-3-ultra-550b-a55b`, then `openai/gpt-oss-20b`, both repeatedly timed out at
45s specifically on grading). `google/gemma-4-26b-a4b-it:free` was the one model that stayed fast
and reliable across every logged call on OpenRouter's free tier — see §13 for how this got resolved
properly with a paid, dedicated-hardware provider instead of continuing to chase free-tier models.

---

## 13. Groq as primary provider, OpenRouter as fallback

`lib/openrouter.ts` generalized into `lib/llm.ts`, which supports multiple providers behind one
`chatCompletion()` call — both Groq and OpenRouter are OpenAI-compatible chat-completion APIs (same
request/response shape, different host/key), so one fetch implementation covers both. Each call site
(`lib/conversation.ts`, `lib/grading.ts`) now passes a `primary` and `fallback` `ModelChoice`; if
primary fails for *any* reason (missing key, timeout, bad response), `chatCompletion` transparently
retries once against fallback before giving up — so one provider having a bad moment doesn't take
the app down with it.

**Groq is primary for both use cases** — its whole value proposition is speed via custom inference
hardware, and that matters for both: the live conversation loop is obviously latency-sensitive, but
grading is too, since the browser waits on the `/end` or `/pause` fetch before showing feedback (the
45s free-tier grading timeouts above were just as user-facing as a slow conversation reply).
OpenRouter/Gemma is the fallback — proven fast+reliable on the free tier, kept as the safety net.

- **Conversation** (`llama-3.1-8b-instant` on Groq) — observed ~475ms per call, down from
  seconds-to-tens-of-seconds on OpenRouter's free tier.
- **Grading** (`openai/gpt-oss-20b` on Groq — same model that kept timing out on OpenRouter's free
  tier, now fast because it's on dedicated hardware) — observed ~2.6s per call, down from 30-45s+
  with frequent timeouts.

**A real grading-quality bug this surfaced**: despite the prompt explicitly saying "only quote a
USER turn," a grading response quoted the AI's own argument verbatim and attributed it to the user
in a debate session — confirmed by checking the actual transcript. This is a model instruction-
following slip, not specific to Groq or gpt-oss-20b, and could happen with any model. Added
`validateQuotedMoment()` in `lib/grading.ts`: verifies the claimed turn index exists, is actually a
user turn, and the quoted text actually appears there — strips just the quote on failure (keeps the
score/fix, which are usually still reasonable) rather than discarding the whole section or trusting
an LLM's unverified claim about its own output.

Model overrides: `GROQ_MODEL_CONVERSATION` / `GROQ_MODEL_GRADING` for the primary tier,
`OPENROUTER_MODEL_CONVERSATION` / `OPENROUTER_MODEL_GRADING` for the fallback tier.

---

## 14. Cross-provider call tracing

Every local log line (`data/logs/llm-YYYY-MM-DD.jsonl`) now also captures `providerRequestId` — the
provider's own id for that exact call — so a specific call can be traced from the local log into
that provider's own system, not just correlated by rough timestamp:

- **OpenRouter**: the id is a real generation id, verified end-to-end by querying
  `GET /api/v1/generation?id=<id>` with a captured id and confirming it resolves to that exact
  call's full stats (model, latency, tokens, cost, upstream provider). Also added the `HTTP-Referer`
  / `X-Title` headers OpenRouter documents for app attribution, and confirmed via that same lookup
  that `origin` correctly shows as this app rather than an anonymous caller.
- **Groq**: the id is captured the same way, but confirmed (by checking Groq's own API reference)
  that there's no equivalent lookup-by-id endpoint — Groq's request history is console-UI-only.
  The captured id is still logged for reference (e.g. if ever contacting Groq support about a
  specific failed call).
- **Both providers**: requests now also send `user: sessionId` — both document this as an
  end-user-identifier field for abuse detection; verified via the OpenRouter lookup that it shows up
  as `external_user` against the exact session that triggered the call, making their side
  filterable per session too, not just per API key.

---

## 15. Third-tier local fallback (Ollama)

`chatCompletion`'s `fallback?: ModelChoice` generalized to `fallbacks?: ModelChoice[]` — a chain
tried in order, stopping at the first success — to add a local Ollama tier below Groq and
OpenRouter. Benchmarked every locally-installed model against a realistic persona prompt and a
grading-style structured-JSON prompt before picking one:

| Model | Conversation | Grading | Verdict |
|---|---|---|---|
| **llama3.2** (3.2B) | 1.1s | 5.2s, valid JSON | Kept — only one fast enough to be worth it |
| mistral (7.2B) | 2.8s | 14.1s | Too slow; also broke 2 explicit persona rules (summarized the topic back, asked two questions in one turn) |
| qwen3:8b (8.2B) | 6s+ (trivial prompt alone) | — | Disqualified — "thinking" model, reasoning overhead before every answer |
| deepseek-r1 (7.6B) | 126.7s | — | Disqualified — same reasoning overhead, worse; produced a meta-response ("Here's how you can begin: 1. Greet the Person...") instead of actually playing the persona |

`llama3.2` is the one wired in (`OLLAMA_MODEL_CONVERSATION` / `OLLAMA_MODEL_GRADING`, no API key
needed — Ollama has no auth by default). Verified the full 3-tier chain live by forcing both Groq
and OpenRouter to fail (bad model names) and confirming it fell through to Ollama and completed the
session normally; also confirmed Groq still succeeds directly in the normal case, unaffected by the
extra tier. `validateQuotedMoment()` (added in §13) covers this model's grading output too, same as
any other.

---

## 16. Grading-failure diagnosability + switching off gpt-oss-20b

A real "grading didn't work" report couldn't be root-caused: the LLM call itself had succeeded
(logged `ok: true`), but the actual response content was never captured anywhere, so there was no
way to see *why* parsing/validation failed afterward. Added `logParseFailure()` in
`lib/grading.ts` — writes the raw response plus the specific failure reason (invalid JSON vs.
missing/wrong-typed section) to `data/logs/grading-failures-YYYY-MM-DD.jsonl` whenever this
happens, so it's diagnosable going forward.

Reproduced the original failure live within minutes of adding the logging: `openai/gpt-oss-20b`
(on Groq) generated syntactically malformed JSON — missing the comma between sibling section keys
(`"structure":{...},{"delivery":{...}` instead of `"structure":{...},"delivery":{...}`). This was
the **second** confirmed occurrence of this exact model doing this exact thing (the first was on
OpenRouter's free tier, back in §12) — despite Groq listing "structured_outputs" support for it.
Two independent occurrences of the same failure mode is a pattern, not noise, so `GRADING_PRIMARY`
switched from `openai/gpt-oss-20b` to `llama-3.1-8b-instant` (same model already used for
conversation, reliable in every observed case across both providers). Verified live: grading
succeeded in 955ms with a correctly-quoted section, no parse failures logged.

---

## 17. In-app call log

All of this had been terminal-only up to now — no way to see which model actually handled a
session without grepping `data/logs/` by hand. Added `/session/[id]/logs`, linked from the
feedback page: reads back every logged call for that session (`getSessionCallLogs()` in
`lib/llm.ts`, scanning across all daily log files since a resumed session can span days) grouped
by conversation vs. grading, each showing provider/model/duration/status, plus any grading parse
failures (`getSessionParseFailures()` in `lib/grading.ts`) with the raw malformed response
available to expand.

One honest scope note included directly in the page: speech capture (Web Speech API) runs entirely
client-side and never hits the server, so there's nothing to log distinguishing voice vs. typed
input per turn — the page says so rather than fabricating that detail.

Verified against a real session with a real history: exactly 8 conversation calls and exactly 2
grading calls (the original failed `gpt-oss-20b` attempt from §16, plus the successful
`llama-3.1-8b-instant` retry) rendered correctly, cross-checked against the raw log data.

---

## 18. Landing page + route split

`/` was the mode-selector "start a session" screen from day one — fine while the app had no public
face, but it meant there was no room for an actual pitch, and no natural place to eventually gate
by subscription. Split into two surfaces using a Next.js route group:

- **`/`** — a new marketing landing page, no app chrome (no Header/Sidebar). Signature element is
  an animated hero transcript (a debate exchange, lines revealing in sequence like a live
  transcript) — the most characteristic thing in Elocu's world, doubling as a direct demo of the
  "AI argues the opposing side" debate mechanic rather than a generic hero+headline+CTA. Palette
  (ink `#14131B`/`#1E1C28`, parchment `#F3EDE1`/`#9C9488`, ember `#D98E4A`, verdigris `#5B8A82`) and
  type pairing (Fraunces display, IBM Plex Mono for transcript/data, Inter body) are deliberately
  distinct from the app's own Geist-based UI, since a marketing page and a tool don't need to share
  a visual identity. Philosophy section adapts plan.md's own Plato/dialogue framing directly rather
  than generic feature-selling copy; feedback-preview section mirrors the real feedback UI's actual
  score-bar/quote/fix pattern so visitors know what they're signing up for.
- **`/app`** — the original mode-selector screen, moved as-is under `app/(app)/app/page.tsx`.
  `app/(app)/layout.tsx` now owns the Header/Sidebar chrome (moved out of the root layout) and
  Geist font loading; the root `app/layout.tsx` is minimal (just html/body/metadata) so the landing
  page's distinct fonts don't fight the app shell's.

All internal "go to the app" links (Header's "New session", feedback page's "Start a new session")
now point to `/app`; only the Header's brand/logo link still points to `/` (the landing page),
which is the standard convention. Verified live: full route table builds correctly
(`/`, `/app`, `/session/[id]`, `/session/[id]/feedback`, `/session/[id]/logs`), `/app` renders with
full history/sidebar/mode-selector functionality intact, and the landing page's CTA correctly
navigates to `/app` — screenshotted at desktop and mobile widths.

**Noted for later, not built now**: the user wants to eventually gate access by paid subscription.
No auth exists yet (`LOCAL_USER_ID` in `lib/types.ts` is a single fixed constant — see §5's original
"no auth, single local user" decision). This lands as its own real project — auth, plans, billing,
entitlement checks — not a small add-on, whenever it's picked up.

---

## 19. Progress dashboard

Pulled forward from §"Scope decision"'s explicitly-deferred "longitudinal analytics dashboard" —
the rationale there was that nothing about deferring it required a schema change later, since
scores were kept numeric + per-category from day one. That bet paid off: `/app/progress` is built
entirely on the existing `feedback.sections[key].score` shape, no migration needed.

`lib/store.ts`'s `listAllFeedback()` reads every session's feedback back with its matching session
(mode, createdAt); `lib/progress.ts` aggregates that into overall/per-section/per-mode averages plus
a score-over-time trend — critically, **only from `valid` rows** (not `gradingFailed`, not
`emptyTranscript`). Placeholder 3s from a failed grading pass would otherwise silently flatten the
averages toward the middle; the page still counts them in "sessions completed" and says how many
were excluded and why, rather than hiding the discrepancy.

Chart components follow the dataviz skill's procedure but plug into the *design system already in
use* rather than a separate token set: the per-section and per-mode breakdowns
(`CategoryBarChart`) are single-hue bars (Tailwind `blue-600`, the same color the per-session
feedback screen's own `ScoreBar` already uses for scores) since one measure across named categories
needs no per-bar color, matching the skill's own rule that color follows the job it does. The
trend chart (`TrendLineChart`) is the one place a real line was warranted — change over time is
exactly that job — with a hover crosshair-style tooltip per the skill's interaction guidance.

Verified against real accumulated usage data (5 graded sessions, no synthetic data): stat tiles,
trend line, and both bar breakdowns all cross-checked against the raw JSON to confirm the
aggregation matches, hover tooltip interaction confirmed live, and the Header gained a persistent
"Progress" nav link alongside "New session".

---

## 20. App-wide facelift — bringing `/app` into the landing page's visual world

The landing page (§18) had a deliberate, distinctive identity (ink/parchment/ember/verdigris,
Fraunces + Plex Mono + Inter). The app itself (`/app` and everything under it) never got that
treatment — it was still generic Tailwind defaults (white background, `blue-600`, Geist), which
read as templated next to the landing page precisely because it was the untouched scaffold every
Next.js app starts from. Fixed by extending the landing page's token system into `app/globals.css`
as named Tailwind v4 theme colors/fonts (`ink-950`/`ember-500`/`font-display` etc.) and reusing it
across every app screen, rather than inventing a second identity for the tool half of the product.

A few choices were deliberate rather than mechanical recoloring:

- **Mode selector**: pill buttons became a card grid, and each card's one-line tagline is pulled
  verbatim from the landing page's "rooms to practice in" section — the line that sold a mode on
  the way in is now the line that labels the room once you're in it.
- **Live session**: chat bubbles became a literal transcript (`YOU`/`ELOCU` mono labels in
  ember/verdigris), styled to match the landing page's own animated hero demo — the marketing
  page's demo is now what the product actually looks like, not just a preview of it.
- **Feedback page**: score bars and the quoted-moment blockquote now match the landing page's
  "what you get back" preview section's styling exactly, closing the loop between the pitch and the
  product.
- A real bug surfaced and fixed in the process: the empty-transcript/grading-failed banners used
  light-mode colors (`bg-blue-50`, `bg-yellow-50`) that would have rendered as jarring white boxes
  on the new dark background — replaced with translucent tinted panels.

One committed dark identity, not a system `prefers-color-scheme` toggle — consistent with the
landing page's own choice. A global `:focus-visible` rule (ember outline) covers keyboard focus
app-wide without per-element utility classes. Verified with `tsc --noEmit`, `eslint`, and Playwright
screenshots (desktop + mobile) across every app screen plus a landing-page regression check.

---

## 21. Elevator Pitch mode, and fixing turn duration to be real

Requested directly: an elevator-pitch practice mode (30s/60s/90s/3min). Shape-wise it's nearly
identical to Speech/Orator — one AI prompt, one monologue turn, the AI silent throughout, one brief
reaction, then auto-end (`MAX_EXCHANGES_BY_MODE.pitch = 1`) — so it didn't need a new engine, just a
time-budget concept layered on top: a picker on the mode selector (`PITCH_TIME_LIMITS_SEC` = 30/60/
90/180, default 90), stored on the session as `pitchTimeLimitSec`, and stated by the AI in its
opening line ("You've got 90 seconds. Whenever you're ready, go.") rather than lectured beforehand.

**The real find while building it**: an elevator pitch is fundamentally about fitting inside a time
window, but `TranscriptTurn.startTs`/`endTs` — despite existing in the schema since Phase 1 — were
never real. `POST /api/sessions/[id]/messages` called `Date.now()` twice back to back for both
fields, so no turn, in any mode, ever had a real duration. Fixed by having the client
(`app/(app)/session/[id]/page.tsx`) track the actual moment the floor becomes the user's — a mic
tap, or the AI's previous line finishing being spoken — through to submit, and send that as
`elapsedMs`; the server now derives `startTs`/`endTs` from it (clamped to a 30-minute ceiling against
clock skew or a stale ref). This fix isn't pitch-specific — every mode's turns now carry a real
duration, which is a precondition for ever giving honest Delivery/pacing feedback anywhere in the
app, not just here (see backlog, §22).

For Pitch mode specifically, that real duration feeds `lib/grading.ts`'s `pitchTimingBlock()`:
target vs. actual seconds, word count, words/minute, handed to the grading prompt as measured fact
rather than left for the model to infer from phrasing alone. Verified live against Groq/OpenRouter:
a 72-second delivery against a 60-second budget produced a Delivery fix reading *"You ran 12 seconds
over the 60s limit; remove the phrase '...' to bring your pace closer to the target 130-160 wpm"* —
grounded in the exact real numbers, not a guess. The feedback page also shows a deterministic timing
line ("Delivered in 1:12 / 1:00 — 12s over") computed directly from the session's timestamps rather
than the LLM's output, so it stays accurate even on a `gradingFailed` fallback.

The live session UI shows a running clock during the user's turn (`0:47 / 1:30`, turning rust-red
past budget) — never force-cuts the user off, only signals, consistent with §9's "never interrupt a
monologue" decision for Speech/Orator. Landing page (§18) updated to six rooms; the Pitch card
reuses the same tagline as the in-app mode selector and quotes the real persona opening line.

---

## 22. Known issues / backlog for next session

Identified while building §20–21 but deliberately not fixed in the same pass — recorded here per
this project's own convention (see intro) so they're pickable next session instead of getting lost.

- ~~**[Bug]** Groq's `llama-3.1-8b-instant` 404ing on every call.~~ **Done, §24.**
- ~~**[Improvement]** Extend objective WPM pacing beyond Pitch mode.~~ **Done, §23.**
- ~~**[Idea]** Re-practice & compare — redo the same topic and see a direct before/after score diff.~~
  **Done, §25** (practice goals — `goalLabel`, the feedback-page delta, `/app/goals/[label]`'s
  per-goal trend), though arrived at via an explicit named "goal" rather than implicit same-topic
  matching as originally sketched here.
- **[Idea, not started]** Adjustable Debate/Interview intensity ("easy / standard / tough") — a
  small persona-prompt change (`lib/persona.ts`) with outsized replay value, since every debate
  currently argues at the same pushback level regardless of the user's experience.
- **[Known limitation, not started — now planned]** No path to a public deployment yet. Two real
  blockers discussed but not yet acted on: (1) `lib/store.ts` writes sessions/feedback/logs to local
  JSON files, which doesn't survive Vercel's ephemeral per-invocation filesystem — needs a real
  backing store (e.g. Postgres) before deploying there; (2) `LOCAL_USER_ID` (§5, §18) is a single
  hardcoded constant — no auth, so a public URL would let every visitor share one identity and see
  each other's sessions, and would let anyone spend the app's own Groq/OpenRouter API budget with no
  gating. Storage should come first (it's what actually breaks in production); auth is what makes it
  safe to share the URL at all. **Full multi-tenancy + monetization plan now written up in
  `saas-plan.md`** (§32) — this bullet's two blockers are that plan's Phase 0/Phase 1.

---

## 23. Objective pace + filler-word density, for every mode

Prompted by a metrics framework a user's colleague proposed — acoustic (pitch/pace/pauses/energy/
articulation), linguistic (grammar/hedging/structure/tone), computer-vision (eye contact/expression/
gesture/posture), plus per-mode weighting. Evaluated against what the app can actually measure today
(`lib/useSpeech.ts` uses the browser's Web Speech API, which exposes only final text — no audio
waveform, no per-word timestamps, no video): most of the acoustic category (vocal pitch variety, RMS
energy, articulation, strategic-pause duration) and all of the computer-vision category need
capturing raw audio or video, which is a real infrastructure and privacy decision, not a quick add —
and video was already on the Phase-1 "explicitly deferred" list (see "Scope decision" above) for
that reason. Decided to build only what's derivable from text + real turn timing, matching the
pattern already proven in §21: compute it deterministically, hand it to the grading prompt as
measured fact, and show it on the feedback page independent of the LLM.

Added `lib/deliveryMetrics.ts`'s `computeDeliveryMetrics()`: aggregate words-per-minute across every
user turn in a session (using the real per-turn duration from §21's fix, not just Pitch mode's
single turn) and filler-word density from a small lexical filler list (`um`, `uh`, `like`, `you
know`, `i mean`, etc.) — deliberately *lexical* fillers, not non-lexical ones, since ASR engines
routinely drop "um"/"uh" from the transcript entirely rather than transcribing them, so a
lexical-only list is what actually survives into a Web Speech API transcript. Explicitly out of
scope for this pass (left on the backlog, not attempted): Hedging & Weak Words as its own tracked
metric (`lib/grading.ts`'s Delivery description still covers hedging, just LLM-inferred rather than
counted), and any acoustic/video metric.

`lib/grading.ts`'s `pitchTimingBlock()` was refactored to source its word count/pace from this shared
helper instead of computing it inline a second time; a new `deliveryMetricsBlock()` runs for every
mode with at least one user turn, contributing pace (skipped for Pitch, which already states it via
the time-budget framing) and filler density (every mode, including Pitch). The feedback page gained
a `DeliveryMetrics` component mirroring `PitchTiming`'s pattern — a deterministic `"141 wpm · 6
filler words (12.8%)"` line under the topic, accurate even if grading fails.

Verified live: a conversation-mode reply seeded with six deliberate fillers ("like" x3, "you know"
x2, "I mean" x1) over a real 20s/44-word turn produced a Delivery fix reading *"Reduce the filler
word density from 12.8% by removing the three instances of 'like' and two instances of 'you
know'..."* — the LLM's own fix text and the feedback page's independently-computed stat line matched
exactly (12.8% in both places), confirming the grading prompt and the UI are reading the same real
numbers rather than the model inventing its own estimate.

---

## 24. Fixing the dead Groq model (`llama-3.1-8b-instant` → `openai/gpt-oss-20b`)

§22 flagged this live: every Groq call was 404ing with `model_not_found` for
`llama-3.1-8b-instant`. Rather than guess a replacement from training data (which is exactly how the
app ended up pinned to a model that later got removed), queried Groq's own `GET
/openai/v1/models` with the real API key to get ground truth on what's actually being served today.
The current catalog is a different shape entirely — no `llama-3.x` models at all; instead
`openai/gpt-oss-{20b,120b,safeguard-20b}`, `qwen/qwen3.6-27b`, `allam-2-7b`, `groq/compound{,-mini}`,
plus Whisper (STT) and prompt-guard classifier models that aren't chat models at all.

Benchmarked the plausible chat candidates head-to-head with the app's real conversation and grading
prompts (not synthetic ones), same rigor as §15's original Ollama benchmarking:

- **`qwen/qwen3.6-27b`** — disqualified immediately: a reasoning model that inlines its `<think>...
  </think>` block directly into the `content` field with no separation, meaning the raw chain-of-
  thought would render straight into the chat as if it were the AI's line. Same failure shape §15
  already ruled out `qwen3:8b`/`deepseek-r1` for, just on a different provider.
- **`openai/gpt-oss-120b`** and **`groq/compound-mini`** — both produced valid JSON for grading, but
  both graded the *AI's* opening line as if it were the user's answer (turnIndex 0, not 1) — a real
  rubric-following failure, not just a formatting one. `120b` was also 7-10x slower than `20b`
  (2-3s vs. ~0.3s) for no quality benefit.
- **`allam-2-7b`** — fully reliable across every test (6/6 clean on a repeated multi-turn
  conversation probe, no quirks), but its English conversational tone ran noticeably more
  formal/corporate ("a proactive approach to ensure smooth functionality and performance") than the
  persona prompt's "curious, attentive conversation partner, not a form" is going for. Makes sense —
  it's SDAIA's Arabic-first bilingual model, English is its secondary language.
- **`openai/gpt-oss-20b`** — fastest (~0.3s), cleanly separates its reasoning into its own
  `reasoning` response field rather than leaking it into `content`, and gave both the most natural
  conversational tone and the most rubric-accurate grading fix of everything tested (correctly
  identified and quoted the seeded filler words in a test transcript, where `120b`/`compound-mini`
  graded the wrong speaker entirely).

Picked `openai/gpt-oss-20b` for **both** conversation and grading — deliberately re-adopting the
exact model §16 switched *away* from after it twice produced malformed JSON for grading. That's not
an accident: this model has two known failure modes on Groq (malformed JSON; and a newly-discovered
one below), and the honest reason it's still the right pick is that both failure modes are
*already* what this app's existing safety nets exist to catch gracefully — `validateQuotedMoment()`
(§13) and the parse-validation fallback (§16) for grading, and the provider fallback chain (§15) for
conversation — rather than something a "safer-looking" model choice would actually make disappear.

**A new failure mode found during this pass**: on a live app test, Groq rejected a second-turn
conversation call from `gpt-oss-20b` with `400 tool_use_failed` — *"Tool choice is none, but model
called a tool"* — an artifact of the OpenAI "harmony" response format gpt-oss models use internally,
apparently firing even with zero tools registered on the request. Re-sampled 18 direct multi-turn
calls to characterize it: 1 failure, ~5.6%, intermittent rather than reliably reproducible — the same
"occasional, not most calls" shape as the original malformed-JSON issue. Confirmed live end-to-end
that the existing fallback chain absorbs it exactly as designed: Groq fails, `chatCompletion` retries
against OpenRouter/Gemma automatically, the conversation continues with no visible break to the user
beyond ~2s of extra latency on that one turn.

Verified the fix live: a fresh conversation session's opening call succeeded on Groq directly (410ms,
no fallback logged), and a full session (message → end → grade) completed with `gradingFailed:
false` and a Delivery fix correctly grounded in the real filler/pace data from §23. Updated
`.env.local`, `.env.example`, and the code defaults in `lib/conversation.ts`/`lib/grading.ts`, with
the full reasoning above kept in both files' comments so the next time a Groq model disappears,
the investigation doesn't have to start from zero.

**Also evaluated per the user's request to make sure prior-discussion items are captured before
moving on**: re-checked §22's remaining backlog (re-practice/compare, adjustable Debate/Interview
intensity, public-deployment blockers) and §23's metrics-framework scope-out (hedging/weak-word
counting, all acoustic/video metrics) — both still accurately reflect what was discussed and remain
correctly un-started; nothing from earlier conversation was found undocumented.

**Not a bug, checked in the same pass**: a report that "Pitch mode progress isn't wired into
`/app/progress`" turned out to be a live, in-progress Pitch session (only the AI's opening line, no
user turn yet) — the progress page only counts *graded* sessions, same as every other mode, so an
unfinished session correctly not counting isn't a bug. Confirmed the wiring itself is correct by
completing a real pitch session end-to-end and watching it appear immediately in the graded-session
count, the trend line, and "Average score by mode" (`lib/progress.ts`'s `MODE_LABELS` already had a
`pitch` entry from §21). No code change needed here.

---

## 25. Practice goals — tracking improvement on one specific thing, not just everything in aggregate

Real motivating scenario: someone rehearsing one actual pitch for a real meeting, or one specific
speech, wants to know "am I getting better at *this*," not just their overall average across every
topic they've ever practiced. This is exactly what §22's "Re-practice & compare" backlog item was
pointing at, now with a concrete use case instead of a hypothetical.

**Design decision, asked rather than assumed**: the real fork was how sessions get grouped as "the
same thing." Two shapes were on the table — a lightweight freeform label (matches how `topic`
already works, no new screen) vs. a structured "Practice Goals" management page (more powerful,
more setup). Given the app's whole "no setup screen" identity, the lightweight option seemed like
the obvious pick, but grouping/naming UX is exactly the kind of decision that's genuinely the user's
to make, not a default to assume — asked directly, lightweight label confirmed.

**Shape of it**: `Session.goalLabel: string | null` (`lib/types.ts`) — deliberately just a string,
not a new entity/table, matching `topic`'s existing pattern rather than introducing a concept to
manage. When starting a session, a "Practicing something ongoing?" row under the topic field
(`app/(app)/app/page.tsx`) offers "New / one-off" (default), any goals already used in that mode
(fetched from the new `GET /api/goals?mode=X`, scoped per-mode since a goal is inherently tied to
how you're rehearsing it), or "+ Name a new goal". `lib/store.ts` gained `listGoalLabels()` (powers
that picker), `listAttemptsForGoal()`, and `getPreviousAttemptForGoal()` — all built on top of the
existing `listAllFeedback()` rather than a parallel index, since the file-based store is small enough
that scanning is cheap and a second source of truth isn't worth the drift risk.

Two places surface the tracking: the feedback page shows an attempt-over-attempt delta right where
you're already looking (*"Part of Elocu pitch to Dale Carnegie — overall +2.3 from your last
attempt"*, plus a per-section `+2`/`-1`/`±0` badge next to each score bar), and a new
`/app/goals/[label]` page shows every attempt with a trend line scoped to just that goal (reusing
`TrendLineChart`, which was already generic over points) — the answer to "am I getting better at
this," not the global cross-topic average `/app/progress` gives. The history sidebar shows a small
`↳ goal label` tag under any session that has one.

Verified live: two pitch sessions on the goal "Elocu pitch to Dale Carnegie" (a deliberately weak,
filler-heavy first attempt scoring 2.0 average, a cleaner second attempt scoring 4.3) produced
*"Part of Elocu pitch to Dale Carnegie — overall +2.3 from your last attempt"* on the feedback page
and a correctly-plotted two-point rising trend on `/app/goals/Elocu%20pitch%20to%20Dale%20Carnegie`.

### New tracking parameters

Picked from the metrics-framework evaluation in §23 (four selected, one deliberately still not
started — see below):

- **Hedging & weak words** — `lib/deliveryMetrics.ts` extended with a second word list (`i think`,
  `i guess`, `just`, `kind of`, `sort of`, `basically`, `maybe`, `probably`), same heuristic
  word-boundary approach as filler words, no overlap between the two lists. Feeds the Delivery
  section alongside pace and fillers.
- **Vocabulary diversity** — new `lib/contentMetrics.ts`, type-token ratio (unique words / total
  words) across user turns, gated behind a 20-word minimum since TTR is meaningless noise on a short
  turn. Explicitly documented as biased by text length (longer sessions naturally show a lower ratio
  even with no real change in vocabulary richness) — the grading prompt is told to weigh it lightly,
  not treat it as a precise score. Feeds the Content section.
- **Talk-time & question ratio** — new `lib/conversationMetrics.ts`, word-count share per speaker
  and the fraction of user turns containing a "?". Conversation mode only — the back-and-forth shape
  that makes "talk time" and "did you ask something back" meaningful doesn't exist in a Pitch/Speech
  monologue and doesn't map cleanly onto Interview/Debate's different turn-taking norms. Feeds the
  Engagement section.
- **STAR structure check (Interview mode)** — not a computed metric, a grading-prompt refinement:
  `interviewStructureNote()` in `lib/grading.ts` explicitly tells the model to evaluate Structure
  against Situation/Task/Action/Result and name which component was weakest or missing.

All four verified live with real transcripts built to exercise them: a conversation turn that never
asked a question back produced *"asked a question back 0% of turns"* on the feedback page and an
Engagement fix telling the user to end with a question; a STAR-incomplete interview answer (Situation
+ Task + Action, no Result) produced a Structure fix reading *"Add a sentence describing the outcome
of the rewrite..."* — correctly identifying the specific missing component rather than a generic
"be clearer" comment.

**Deliberately not built in this pass** (per §23's original scope-out, still holding): grammar-error
detection and sentiment/tone bias were both evaluated and left out — grammar checking is a
meaningfully different, more specialized problem than word-list counting, and sentiment/tone
overlaps enough with the existing Engagement/Argumentation sections that a dedicated metric risked
rubric bloat for unclear added value. Both stay on the list if a concrete need for them shows up.

---

## 26. Metric definitions on hover, grounded in real research where it exists

Real feedback on §25's stat lines: a raw `113 wpm · 0 filler words (0.0%) · 0 hedge words (0.0%)`
tells you a number but not whether it's good. Added `app/components/Metric.tsx` — a small hover/
focus tooltip wrapping each stat with what it measures and, where genuine research exists, a real
target range instead of an invented one.

Searched rather than asserted from memory for the two metrics that plausibly have real backing:

- **Words per minute**: a University of Michigan study and a University of Missouri study both
  converge on ~150–160 wpm as the pace with the best comprehension, with speeds above ~180 wpm
  measurably hurting it. This matches what was already coded in as a guideline (§21/§23's
  "130-160 wpm typical, faster normal for debate") — good confirmation it wasn't invented, and now
  it's cited in the tooltip instead of asserted bare.
- **Talk-time ratio**: HubSpot/Gong's analysis of 25,000+ (later 100,000+) sales calls found the
  best-performing conversations cluster around a 43:57 talk-to-listen ratio, with talking >65% of
  the time correlating with materially worse outcomes. This is sales-call research specifically, not
  general conversation-practice research — the tooltip is worded to say "conversation-analysis
  research (e.g. Gong's study...)" rather than implying it was validated for casual conversation, an
  honest hedge rather than overclaiming transfer.
- Filler words, hedge words, and vocabulary diversity (TTR) don't have an equivalent "here's the
  scientifically optimal number" finding — the tooltip explains what's measured and how to read the
  direction (lower filler/hedge density reads as more prepared/confident; TTR is a same-session
  signal only, already documented in §25 as biased by text length) rather than inventing a target
  that doesn't exist.

**A real bug found while verifying this, not while writing it**: the first implementation centered
each tooltip under its trigger word with pure CSS (`left-1/2 -translate-x-1/2`). Looked fine on
desktop; on a 390px mobile viewport, hovering either the first metric in a line (tooltip clipped off
the *left* edge — "words per minute" chopped down to unreadable fragments) or a later one (clipped
off the *right*) both overflowed, confirmed live with screenshots of each. Centering math alone can't
know where the viewport edge is. Fixed by converting `Metric` into a small client component
(`app/components/Metric.tsx` — the rest of the feedback page stays a Server Component; Next.js allows
a Server Component to render a Client Component as a normal child, so only this one leaf needed
`"use client"`) that measures its own position on hover/focus via `getBoundingClientRect()` and nudges
the tooltip's transform just enough to stay within a 12px margin of the viewport edge. Reverified both
previously-broken cases (first metric, third metric) at 390px width — both now render fully on-screen
— plus confirmed keyboard focus (not just mouse hover) also triggers the tooltip, satisfying the
"visible keyboard focus" accessibility bar the rest of the app already holds to.

Followed up immediately after: the `PitchTiming` line ("Delivered in 0:26 / 1:30 — 64s under") had
no tooltip yet — it predates `Metric` and its content (a colored timing span, not plain text) didn't
fit `Metric`'s original `children: string` prop. Generalized to `children: ReactNode` (a genuinely
useful widening, not scope creep — the same component now covers a richer trigger without a second
implementation) and added a tooltip grounded in the elevator-pitch convention itself: 30–60s for a
cold pitch, 45–60s+ with more context, and an explicit note that running *under* budget isn't
automatically better — it can mean the value prop or the ask got left out.

---

## 27. Fixing tooltip clipping near the header — a real bug, not a header problem

Reported directly: hover text getting cropped by the top header. The actual cause was one step
removed from where it looked like it was — `Metric`'s tooltip was `position: absolute` with
`bottom-full` (float above the trigger), living inside the app shell's scrollable content pane
(`app/(app)/layout.tsx`'s `overflow-y-auto` div). For a trigger near the top of that pane — the
pitch-timing line sits right under the page heading — the tooltip's rendered box extended above the
pane's own top edge, and `overflow-y-auto` clips in that direction too, not just at the bottom. It
looked exactly like "the header is cutting it off" because the header sits right above that pane, but
the header itself was never involved.

Rewrote `Metric` to position via `position: fixed`, computed from the trigger's real
`getBoundingClientRect()` on hover/focus rather than a static CSS anchor — `fixed` positioning is
relative to the viewport, so it isn't subject to any scrolling ancestor's overflow clipping at all.
Went through two more rounds fixing this properly rather than declaring victory early:

1. First pass flipped the tooltip below the trigger when a *guessed* fixed height (130px) wouldn't
   fit above. Verified live and the guess was wrong for this component's longer tooltip strings
   (the pitch-timing one runs ~270 characters) — the box grew upward past the guessed height anyway,
   right off the top of the viewport. Fixed by comparing the *actual* available space above vs.
   below (real geometry, not an estimate) and picking whichever is bigger, with `max-height` +
   `overflow-y-auto` as a second safety net so even a wrong call degrades to "scrollable" rather than
   "off-screen."
2. Attempted a small caret/pointer diamond as a polish touch (the design-review pass this was done
   under). Confirmed via direct DOM inspection that it was rendering with correct geometry, rotation,
   and border — the CSS math was right, it was just visually imperceptible (the tooltip's background
   is only ~5-10 RGB units lighter than the page background it pokes out against, and a 1px
   10%-opacity border doesn't rescue that at this size). Cut it rather than keep tuning a decorative
   detail nobody asked for — the actual reported bug doesn't need it, and a simpler component is a
   better outcome than a subtly-broken decorative one.

Reverified against three concrete scenarios after each round: the near-header trigger (full tooltip
text now visible, flips below when that has more room), an artificially short viewport (degrades to
scrollable instead of spilling off-screen), and both previously-fixed mobile horizontal edge cases
(still clean). All three confirmed clean in the final version.

---

## 28. `/app/progress` → `/app/insights`: per-mode segmentation and the delivery-metric trends

Real feedback: the old Progress page mixed every mode into one blended set of numbers (one trend
line, one overall average) — someone who only cares about their Interview practice had no way to see
*just* that. Separately, §23/§25's real per-session metrics (WPM, filler/hedge density, vocabulary
diversity, talk-time ratio, pitch-timing adherence) only ever showed on individual feedback pages,
never aggregated over time — so "am I actually getting faster/clearer" had no dashboard answer either.

**Segmentation**: `/app/insights?mode=X` — tabs at the top (`All` plus one per mode *that actually has
data*, so a mode never practiced doesn't get a dead tab) filter every section on the page: the stat
tiles, the trend line, the section-score breakdown. Implemented as a server-rendered query param
rather than client-side filtering — the page is already an async Server Component reading from the
file store directly, and a mode filter is naturally just "read the same data, filter the array before
aggregating," no client JS needed for it. The "Average score by mode" bar chart only makes sense in
the unfiltered `All` view (obviously redundant once already filtered to one mode) and is hidden
whenever a mode is selected; the "Strongest mode" stat tile is replaced by "Best section" in that case
— same underlying `sectionAverages` data, just the more useful question once mode is no longer the
free variable.

**More parameters, reusing the real work already done**: `lib/deliveryMetrics.ts`,
`lib/contentMetrics.ts`, and `lib/conversationMetrics.ts`'s compute functions took a full `Session` but
only ever touched `.turns` — narrowed their parameter type to `{ turns: TranscriptTurn[] }` so they
could run against the lighter `FeedbackWithSession` rows the insights/goals pages already have, no
second file read needed. `lib/store.ts`'s `FeedbackWithSession` grew `turns` and `pitchTimeLimitSec`
(both already being read off the session file for every row anyway, just not returned before now).
Also extracted `lib/pitchMetrics.ts`'s `computePitchTiming()` out of the feedback page, where the
target-vs-actual calculation was previously inlined — now shared between the per-session display and
the new aggregate.

Three new sections, each hidden when there's no qualifying data rather than showing a misleading
zero: **Delivery** (average pace/filler%/hedge%/vocabulary-diversity, shown in every mode view since
they're not mode-specific) — note that a session's Pace tile is silently excluded from that particular
average whenever its own WPM wasn't trustworthy enough to compute (same `MIN_DURATION_SEC_FOR_WPM`
guard as the per-session page), which is why the Pitch-mode view above showed Filler/Hedge/TTR but no
Pace tile for one real session batch — correct behavior, not a bug, confirmed by checking the
underlying data rather than assuming; **Conversation dynamics** (talk-time %, question-asking rate),
shown only in the Conversation tab; **Pitch timing** (average seconds over/under budget, % landing
within ~15%-or-5s of target), shown only in the Pitch tab.

**Rename**: "Progress" → "Insights" — the page stopped being just "did my score go up" once it started
answering "how's my pace," "am I talking too much," "am I hitting my pitch time budget." Renamed the
route too (`app/(app)/app/progress` → `app/(app)/app/insights`) rather than keeping the old path as a
redirect shim — this is a local single-user app with no external bookmarks to preserve, so a clean
rename beat a compatibility layer nobody needs. Updated the one nav link (`Header.tsx`) and the one
stray doc comment (`/app/goals/[label]/page.tsx`) that referenced the old path.

Verified live against real accumulated data (12 graded sessions, mixed modes, no synthetic data):
mode tabs correctly show only the 6 modes actually practiced, each filtered view's numbers
cross-checked against the underlying session files, and the Pitch tab's real aggregate ("−35s under
budget on average, 20% landed on target across 5 pitches") confirmed against the individual
session timings it was built from.

---

## 29. Voice picker — the free tier of the "different voices" idea

Floated earlier as an improvement idea, in two tiers: a free browser-voice picker now, a cloud TTS
provider (ElevenLabs/OpenAI) later for real quality/character. Built the free tier — `lib/useSpeech.ts`
previously constructed every `SpeechSynthesisUtterance` with no voice set at all, so every AI reply
used whichever default voice the OS happened to expose, with zero way to change it.

`useSpeech()` now loads `speechSynthesis.getVoices()` (plus the `voiceschanged` event, since most
browsers populate the list asynchronously and an immediate call is frequently empty) and exposes
`voices`/`voiceURI`/`setVoiceURI`. Selection persists in `localStorage`, not the session store — a
device/browser preference, not app data tied to a session. `app/components/VoicePicker.tsx` renders a
sorted dropdown (English voices first, matching the app's English-only personas) above the mic
controls on the session page, gated on `speech.supported && voices.length > 0` so it never shows a
picker for zero voices. Picking a new one immediately re-speaks the actual last AI line in it (not a
generic sample phrase) — hearing the persona's real words, not a canned "hello, this is my voice," is
what actually tells you whether a voice fits.

One real lint catch: seeding `voiceURI` from `localStorage.getItem()` inside a `useEffect` triggered
`react-hooks/set-state-in-effect` (same rule §21's pitch-clock work hit earlier). Fixed by reading it
via `useState`'s lazy initializer instead of an effect — safe here specifically because nothing
renders differently based on `voiceURI` until `voices` itself populates (still `[]` at both server-
and first-client-render), so there's no server/client hydration mismatch risk from a synchronous
`localStorage` read up front.

Verified live: 180 real system voices loaded in a real browser context (not a stub/empty list), the
dropdown correctly sorted English-first, and the full persistence round-trip (pick a voice → reload
the page → same voice still selected) confirmed working. Deliberately scoped to *one* global voice
preference, not per-mode auto-varied voices (a "Debate opponent sounds assertive, Interview sounds
professional" idea raised alongside this one) — browser voices carry no personality/character
metadata to key that kind of selection off of; that idea fits the cloud-TTS tier, not this one.

---

## 30. Trend arrows on every Insights metric

Every number on `/app/insights` was a snapshot — no way to tell at a glance whether a given metric
was actually improving. Added a green ▲ / red ▼ / neutral `±0` next to every stat: overall average,
each section score, each mode average, and every §28 delivery/conversation/pitch-timing tile.

**The arrow's color always means "trending the way this specific metric's own documented guidance
says is good," never just "the raw number went up."** That distinction mattered concretely: WPM and
talk-time both already have a *target range* elsewhere in the app (the feedback page's `Metric`
tooltips, §26 — ~150-160 wpm, ~40-55% talk-time), not a "more is better" direction, and pitch timing's
own tooltip explicitly warns that running under budget isn't automatically a win either. A naive
"number went up = green" would have been quietly wrong for exactly these three metrics — filler%/
hedge% are `lower-better`, most scores are `higher-better`, but WPM/talk-time/pitch-timing-deviation
are all `closer-to-target` (§26/§28's own already-established target values reused here, not
reinvented: 155 wpm, 47.5% talk-time, 0s pitch deviation). `lib/progress.ts`'s new `computeTrend()`
takes an explicit `Goodness` direction per metric for exactly this reason.

Comparison basis: chronological first-half vs. second-half average (not last-session-vs-previous,
which would bounce around on one noisy data point), gated behind a 4-point minimum and a
per-metric-type noise threshold (0.15 for /5 scores, 3 points for percentages, 5 wpm, 3 seconds) so a
trivial wobble doesn't render as a false arrow — same "don't show a number that isn't trustworthy"
discipline as every other real metric in this app, extended to trends themselves.

Verified live: the Delivery section correctly showed Pace trending ▼ red (drifting *further* from the
155 wpm target over the session history) while Filler/Hedge words sat at neutral `±0` and Vocabulary
diversity trended ▲ green in that same view — confirming the three different `Goodness` modes
(closer-to-target, lower-better, higher-better) are each actually being applied per-metric rather than
one blanket "up is good" rule, exactly as designed.

---

## 31. Voice categorization — gender grouping + delivery-style presets, honestly

Requested directly: female/male voices, and "soft, persuasive, harsh, bossy" categories. Worth being
explicit about what's actually possible here before describing what got built: `SpeechSynthesisVoice`
(the Web Speech API's voice object) exposes exactly `.name`, `.lang`, `.localService`, `.default` —
no gender field, no personality/tone field, nothing to query for "does this voice sound bossy." That's
not a gap in this app's implementation, it's the full extent of what the browser API provides. Two
honest answers, not one fabricated one:

- **Gender grouping** — `lib/voiceCategories.ts`'s `guessVoiceGender()` infers it from the voice's
  name against a curated lookup table (covering the common macOS/iOS, Chrome/Google, and Windows/Edge
  system voice names) plus a literal "female"/"male" substring check for voices that spell it out in
  the name. Explicitly a best-effort *guess*, documented as such in the code — anything unrecognized
  lands in a third "Other voices" group rather than a wrong guess. `VoicePicker.tsx` renders the voice
  `<select>` as three `<optgroup>`s (Female / Male / Other) built from this.
- **Delivery style** — not a classification of the fixed voices at all (there's no data to classify
  them by), but adjustable presets layered on top of whichever voice is picked, using the one real
  controllable lever `SpeechSynthesisUtterance` actually exposes for vocal character: `.pitch` (0-2)
  and `.rate` (0.1-10). Five presets in `lib/voiceCategories.ts` — Neutral (the voice's own default),
  Soft (higher pitch, slower), Persuasive (measured pace, slightly warmer), Harsh (lower, more
  clipped, faster), Bossy (lower-ish, brisk) — rendered as pill buttons next to the voice dropdown.
  These are simple engineering approximations, not a validated psychoacoustic model the way the WPM
  guidance elsewhere in this app is genuinely comprehension research — said so directly in the code
  comment rather than dressing up a guess as a finding.

Both preferences persist in `localStorage` (`lib/useSpeech.ts`, alongside the voice-URI preference
from §29) and reuse the same "preview the actual last AI line" pattern §29 already established —
picking a new style re-speaks the real transcript in it rather than a canned sample.

Verified live against a real session: the voice dropdown correctly grouped a voice named "Flo" under
"Female voices," and clicking the "Harsh" style button updated the selection and triggered a live
preview with no console errors.

---

## 32. Multi-tenancy & monetization — planned, not built

Requested as planning only ("let's just plan and document it for now") — no code changes this pass.
Full plan written up in **`saas-plan.md`** rather than as a section here, deliberately: this file's own
stated purpose is decision history for what's actually been built (see the intro), and a forward-looking
roadmap for unbuilt work doesn't fit that chronological-narrative convention — a separate document
keeps both readable as what they actually are.

The plan is grounded in the real current architecture rather than generic SaaS boilerplate, notably:

- **A real, currently-live authorization gap gets called out explicitly**, not folded into "add auth"
  as a vague catch-all: `Session.userId` (`lib/types.ts`) is set on every session but never read back
  anywhere — `getSession(id)` returns any session to anyone who has (or guesses) the id, no ownership
  check exists at all. Closing this is framed as part of the auth work, not a separate follow-up that
  could get missed.
- **The Phase 1 bet on `lib/store.ts` as a single persistence boundary gets validated**: every
  page/route already goes through its exported functions rather than touching `fs` directly (per §5's
  original design intent), so the database migration is scoped as a rewrite of one file's internals
  plus threading a `userId` parameter through, not a hunt-and-replace across the app.
- **Pricing is tied to the app's actual cost driver** (LLM calls, already logged with token usage in
  `lib/llm.ts`) rather than an arbitrary tier structure — recommends session-count limits (legible to
  users) over token-based ones (legible only internally), and flags the Ollama fallback tier's
  production behavior (unreachable at `localhost:11434` once deployed, so a Groq+OpenRouter double
  failure currently has nowhere left to fall back to) as a real pre-launch decision, not a detail.
- Phased as four independently-shippable stages (storage migration → auth → billing → production
  hardening) rather than one large rewrite, with open decisions (auth provider, free-tier cap, price
  point) flagged explicitly rather than silently defaulted.

`plan.md` §22's "no path to a public deployment" backlog item now points here rather than duplicating
the same two blockers in two places.

---

## 33. Insights goals + a more engaging strength callout

Two pieces of direct feedback on `/app/insights`: the existing section/mode ranking (§28's bar
charts) read as flat and unengaging rather than telling the user something about themselves ("you're
a good conversationalist/debater"), and there was no way to declare a goal and see real progress
toward it with concrete advice on closing the gap.

**Design decisions, asked rather than assumed** (three genuine forks, all confirmed directly before
building):

- **Advice timing**: aggregate, on `/app/insights`, computed over the whole session history — not
  per-session, and explicitly not live in-session coaching. The user's own words: "per session may
  not be helpful." This also meant not touching the live conversation loop or `lib/persona.ts` at
  all, keeping this change fully decoupled from grading/conversation, and consistent with §"Scope
  decision"'s original deferral of "live in-session coaching nudges."
- **Goal shape**: both a structured numeric target *and* a free-text note are available on the same
  goal, user's choice at setup, rather than forcing one shape.
- **Goal scope**: multiple goals tracked in parallel, not one at a time.

**New concept: `Objective`** (`lib/types.ts`), deliberately named and stored separately from
`Session.goalLabel` (§25's "practice goal," which just groups repeated attempts at one specific
thing, like "Pitch to Dale Carnegie") — an Objective is a broader target ("get better at Debate," "hit
150wpm," "nail my interview March 3rd") measured across *every* qualifying graded session, not one
practice thread. Reusing the word "goal" for two different concepts in code would have been a real
maintainability trap, so the type/file/route layer says "Objective" throughout even though the UI
copy says "goal" to the user (`app/components/ObjectiveForm.tsx`'s "+ Add a goal").

An Objective's structured target can point at any of nine measurable dimensions: overall score,
a specific section's score, speaking pace (wpm), filler-word %, hedging-word %, vocabulary diversity,
talk-time % (Conversation only), question-asking rate (Conversation only), or pitch on-target rate
(Pitch only) — the last three inherit their mode-lock from where those metrics already only apply
(§25/§28). Every other target can optionally be scoped to one mode ("Delivery score, but only in
Debate"). New `lib/objectives.ts`'s `computeObjectiveProgress()` does the actual work, and reuses
everything already built rather than recomputing: `computeDeliveryMetrics`/`computeContentMetrics`/
`computeConversationMetrics`/`computePitchTiming` for the raw numbers, and `lib/progress.ts`'s
existing `computeTrend()` for the trend arrow (with the objective's user-chosen target substituted in
as the `{ target }` goodness case where relevant, same distance-based logic §30 built for wpm/talk-time).

**"Move toward it" advice is never fabricated** — matching this app's existing discipline (§16, §26,
§31 all draw the same line between "measured/real" and "a guess dressed up as a finding"). Rather than
issue a new LLM call to generate coaching text, `computeObjectiveProgress()` walks backward through
the scoped session history and surfaces the real, already-generated grading `fix` string from the most
recent qualifying session's relevant section (Delivery for pace/filler/hedge/pitch-timing goals,
Content for vocabulary, Engagement for talk-time/question-rate, the section itself for a section-score
goal). A pure free-text aspiration with no structured target gets the same treatment against its
single weakest section in the most recent qualifying session — an honest "here's the real number
holding you back" rather than an invented percentage.

Progress-percent math (`progressPctFor`) branches on direction: higher-better metrics (scores, TTR,
question-rate, pitch-on-target) are `current/target`; lower-better ones (filler%, hedge%) invert past
100% once you're already under target; wpm/talk-time use the same "closeness to an exact number, either
direction" framing as §30's trend arrows, just against the user's own chosen number instead of the
app's fixed research target.

**Storage**: `data/objectives/{id}.json`, one file per objective — same pattern as sessions/feedback,
covered by the existing wholesale `/data/` gitignore rule, no new exclusion needed. `lib/store.ts`
gained `saveObjective`/`listObjectives`/`deleteObjective`, the same shape as its session functions.
`app/api/objectives/route.ts` (GET list, POST create) and `app/api/objectives/[id]/route.ts` (DELETE)
follow the existing route conventions exactly (loose type-checked body parsing, no auth check — same
as every other route today, per the still-open gap `saas-plan.md` already tracks).

**Where it lives**: entirely on `/app/insights`, not the session-start flow — an "+ Add a goal" toggle
(`app/components/ObjectiveForm.tsx`) keeps goal-setting fully optional, consistent with the app's "no
setup screen" identity. Objectives are computed against the *whole* history regardless of the page's
own `?mode=` tab filter (unlike the rest of the page, which re-aggregates per tab) since a goal's scope
is its own explicit setting, not the page's ambient one. `app/components/ObjectiveCard.tsx` is the one
client component needed (a delete button calling `router.refresh()` after `DELETE`); everything else
stays server-rendered.

**The strength callout** (`lib/progress.ts`'s `getStrengthSummary()`, `app/components/
StrengthCallout.tsx`): turns the already-computed, already-sorted `sectionAverages` ranking into a
named headline ("The Smooth Talker — your Delivery averages 3.1/5, your strongest section") plus a
paired growth-area line for the weakest section, instead of leaving that information sitting in a bar
chart the user has to interpret themselves. Deliberately takes `ProgressStats` as its input rather than
raw rows, so it works unchanged whether `stats` is the unfiltered "All modes" view or one already
filtered to a single mode tab — "your best skill overall" and "your best skill in Debate" are the same
function call against differently-scoped data. Six section-to-title mappings (Storyteller/Smooth
Talker/Specific One/Engager/Tailored Candidate/Debater), no per-mode variation attempted — kept simple
rather than building a combinatorial persona system for a request that was really about making an
existing number-based ranking read as something about the user, not a scoreboard.

The existing section/mode bar charts (`CategoryBarChart.tsx`) gained explicit `#1`/`#2`/... rank
prefixes — the literal "show some ranking" ask, a small change since the data was already sorted
descending.

Verified live against the real accumulated session history (12+ graded sessions): created one
structured goal ("Sharper Debate Delivery," Delivery/Debate -> 4.5/5) and one free-text aspiration
("Nail my interview on March 3rd," scoped to Interview) via the API, confirmed both rendered correctly
on `/app/insights` — the structured goal showed a live 67% progress bar (3.0/4.5, matching the real
Debate-mode Delivery average) with a real Delivery fix as advice; the aspiration showed "tracking 1
session, no fixed number" with a real Structure fix pulled from the actual interview session — then
deleted both as test data. Strength callout correctly read "The Smooth Talker" (Delivery, 3.1/5
overall) with "Biggest room to grow: Argumentation, averaging 2.0/5." `tsc --noEmit` and `eslint` both
clean.

---

## 34. "Suggest targets for me" — LLM-assisted goal-target mapping

Real usage of §33 immediately surfaced the actual gap: a free-text-only goal ("I want to get better
at negotiating") has no path to a hard number at all unless the user already knows which of the nine
`ObjectiveMetric`s and which mode/section maps to what they typed — and if they knew that, they'd
have just picked it themselves in the form. The user's own framing: "I cannot give a number since I
am not gaming, I just know my goal."

**Explicit instruction on model choice**: use the local Ollama model if it's accurate enough,
otherwise OpenRouter — and no Groq in this chain (Groq is the app's speed-first choice for the
latency-sensitive conversation/grading path; this is a one-time, on-demand click, not something the
user is waiting on mid-session, so accuracy mattered more than shaving another few hundred ms).
Benchmarked head-to-head before picking, same discipline as §15/§24 — three real free-text goals
("get better at negotiating," a Google-interview goal with a note, "become a more confident public
speaker") through both `llama3.2` (local) and OpenRouter's `google/gemma-4-26b-a4b-it:free`, same
prompt, same validation. Both produced syntactically valid JSON every single time — the gap was
entirely semantic:

- `llama3.2` never connected "negotiating" to Argumentation/Debate at all (missed the single most
  obvious mapping in the whole test set), and for "confident public speaker" it suggested
  `contextFit` — a metric specifically about job-description/resume alignment, unrelated to
  confidence — and defaulted twice to Conversation mode rather than the more fitting Speech/Orator.
- `google/gemma-4-26b-a4b-it` correctly led with Argumentation/Debate for negotiating ("Negotiation
  requires building strong claims with evidence and maintaining composure under pushback"), correctly
  used Speech mode for the public-speaking goal instead of a generic default, and picked up the
  interview goal's note detail ("backend engineering role") into its `contextFit` rationale.

Picked OpenRouter as primary, local Ollama as fallback for this one call site — the reverse of
conversation/grading's Groq-first order, and a deliberate exception to it, not an inconsistency.

**New file `lib/objectiveSuggestion.ts`** — a third LLM call site alongside `lib/conversation.ts`/
`lib/grading.ts`, but shaped differently: on-demand (a "Suggest targets for me" button on a goalless
`ObjectiveCard`, not part of any automatic pass), returns up to 3 suggestions, and validates every
field against the exact same enums the manual goal-creation form already enforces (`VALID_METRICS`,
`VALID_MODES`, `VALID_SECTION_KEYS`) rather than trusting the model's JSON verbatim — a locked-mode
metric's suggested `mode` is silently overridden to the real constraint (reusing `lib/objectives.ts`'s
now-exported `METRIC_META`, one source of truth rather than a second copy that could drift), and a
`targetValue` outside the metric's sane bounds (1-5 for scores, 60-260 for wpm, 0-100 for percentages)
is clamped rather than trusted — the same "never trust an LLM's unverified claim" posture
`validateQuotedMoment()` (§13) established for grading. A suggestion missing a required field is
dropped individually rather than failing the whole batch; total failure returns an empty array so the
UI shows a plain retry message instead of an error page.

**Flow**: `POST /api/objectives/suggest` (standalone — takes `{title, note}`, not tied to an existing
objective id, so it could later be reused from the creation form too) returns validated suggestions;
picking one calls the new `PATCH /api/objectives/[id]` (added alongside the existing GET/DELETE,
`lib/store.ts` gained a matching `getObjective()`) to apply that suggestion's metric/mode/sectionKey/
targetValue to the existing objective. `ObjectiveCard.tsx` owns the whole interaction — fetch, render
each suggestion with its one-sentence rationale, apply, `router.refresh()` — no changes needed to the
Insights page itself.

Verified live end-to-end through the real running app (not a unit test): recreated the user's exact
goal ("I want to get better at negotiating," no target) via the API, called
`POST /api/objectives/suggest` through the actual route and got back the same three-suggestion result
from the benchmark (Argumentation/Debate -> 4/5 leading), applied the top suggestion via `PATCH`, and
confirmed `/app/insights` rendered a live 50% progress bar (2.0/5 -> 4.0/5) with a real Argumentation
fix as advice. Caught and corrected a real mistake while testing: the user's actual pre-existing goal
(same title, created earlier through the UI, still goalless) was sitting in the same objectives store
— deleted only the test duplicate I'd created, left the user's real one untouched. `tsc --noEmit` and
`eslint` both clean.

---

## 35. Goals become multi-target: edit and add-alongside, not replace-only

Real usage of §34 immediately surfaced the actual shape problem: once a target was set (manually or
via a suggestion), the objective was stuck — no way to edit it, and no way to add a second target from
another suggestion without overwriting the first. The user's own framing: "the moment i set the
target, it does not allow me to edit or set multiple targets based on the suggestion. That should be
allowed."

**Root cause, not a UI bug**: `Objective` (`lib/types.ts`) modeled a single `metric`/`mode`/
`sectionKey`/`targetValue` set directly on the goal. There was no second target to add, and nothing to
key an edit off of.

**Fix: `Objective.targets: ObjectiveTarget[]`** — a goal now holds zero or more independent targets,
each with its own `id`, `metric`, `mode`, `sectionKey`, `targetValue`. `targets: []` is still exactly
§34's free-text-aspiration state (no hard number yet); one entry is the old single-target shape from
§33/§34; two or more is the actually-requested case. `lib/objectives.ts`'s `computeObjectiveProgress()`
now scores each target independently (`ObjectiveTargetProgress`, one per target — its own current
value, progress %, trend, and advice) rather than computing one number for the whole objective, so
adding/editing/removing one target never touches the others' computed state.

**Validation centralized, not duplicated**: `lib/objectives.ts` gained `parseObjectiveTarget()` — the
one place that checks a raw target payload against the real metric/mode/section enums, enforces
locked-mode metrics' real mode regardless of what was passed, clamps `targetValue` into sane bounds
(`clampTargetValue()`), and assigns a fresh id when one isn't provided (editing an existing target
passes its id through; adding a new one, whether manual or from a suggestion, doesn't). Both
`app/api/objectives/route.ts` (create) and the new `PATCH /api/objectives/[id]` (replace the whole
`targets` array in one call — add/edit/remove all funnel through this single endpoint, matching
`lib/store.ts`'s existing whole-file-overwrite convention rather than three separate sub-resource
routes) call it, and `lib/objectiveSuggestion.ts`'s suggestion validator was rewritten to call it too
instead of keeping its own second copy of the same enum/clamp logic — one source of truth for what a
valid target looks like, LLM-suggested or hand-entered. `app/components/objectiveTargetOptions.ts` is
the matching client-side single source for the metric/section/mode picker options, shared between
`ObjectiveForm.tsx` (creation, still just 0-or-1 initial target) and the new `TargetEditor` inside
`ObjectiveCard.tsx` (used for both "add a target" and "edit this target" — same form, same validation,
different save target).

**`ObjectiveCard.tsx` reworked around a target list**: each target renders as its own row (progress
bar or "no qualifying sessions yet," its own advice line, `edit`/`×` inline) rather than the goal
having one combined state. "Suggest targets for me" no longer disappears once a target exists — it's
always available, and applying a suggestion now calls the same add-a-target path as the manual "+ Add
a target" button, so multiple suggestions can be applied one after another (each gets its own
"Added ✓" marker once applied, rather than only ever offering one).

**One real data migration, done by hand, not a shim**: the user's actual pre-existing goal ("I want to
get better at negotiating," a real `hedgePct -> 5%` target they'd set themselves between sessions) was
sitting on disk in the old single-target shape. Rather than write permanent migration-compatibility
code into the app for what's local, gitignored dev data with exactly one affected file (per this
project's own stance against backwards-compatibility shims — see the intro), the one file was read and
rewritten by hand into the new `targets: []` array shape, preserving the real target as its first
entry with a freshly generated id.

Verified live end-to-end against that real, migrated goal: confirmed it still loaded correctly through
`GET /api/objectives` post-migration; added a second target (Argumentation/Debate -> 4/5, from a fresh
suggestion) via `PATCH` alongside the existing `hedgePct` target — both now render as independent
progress bars on `/app/insights` (100% and 50% respectively) with their own advice lines; edited the
`hedgePct` target's value from 5 to 3 in place (id preserved, the other target untouched); added a
throwaway third target and removed just that one, confirming the real two survive intact. `tsc
--noEmit` and `eslint` both clean.

---

## 36. A suggestion shouldn't repeat a target that's already there

Immediate follow-up bug from real use of §35: after applying a suggestion, clicking "Suggest targets
for me" again could hand back the exact same metric/mode/section the user had just added — the
screenshot showed "Argumentation in Debate" listed as both a real, already-tracked target *and* a
still-clickable "Add this target" suggestion below it. Root cause: `suggestObjectiveTargets()`
(`lib/objectiveSuggestion.ts`) had no idea what the goal already had — every call started from
scratch, so nothing stopped the LLM from re-proposing something already on the card.

Fixed with a belt-and-suspenders pair, not just a prompt tweak (a prompt instruction alone isn't a
guarantee, per this app's own repeated experience with models not perfectly following instructions —
§13's `validateQuotedMoment()`, §16's parse-failure logging, this very feature's §34 clamping):

- **Prompt-level**: `suggestObjectiveTargets()` now takes an `existingTargets: ObjectiveTarget[]`
  parameter; `buildPrompt()` lists them explicitly ("already tracking these targets — do NOT suggest
  any of these again, suggest different ones instead") so the model spends its 2-3 suggestion slots on
  genuinely new ideas rather than wasting one on a repeat that would just get filtered out anyway.
- **Guaranteed, not requested**: after validating the model's response, the result is unconditionally
  filtered against `existingTargets` by (`metric`, `mode`, `sectionKey`) shape — `targetValue` isn't
  part of the identity check, since "Argumentation in Debate → 4.5" when 4.0 is already tracked is
  still the same underlying thing to edit, not a second thing to add. This filter runs regardless of
  whether the model honored the prompt instruction, so a repeat can never reach the client even if the
  LLM ignores the instruction.
- **Client-side, derived not stored**: `ObjectiveCard.tsx` dropped the `appliedIndices` tracking state
  from §34/§35 in favor of computing `visibleSuggestions` fresh on every render — filtering the
  currently-held `suggestions` list against the live `objective.targets` prop. This is strictly more
  robust than a one-shot "mark this index as applied" flag: it also correctly hides a suggestion that
  was fetched in an *earlier* browser session (before the server-side filter existed, or before that
  particular target was added by some other means), since it re-checks against the real current data
  on every render rather than only reacting to a click made in the same session. A "↻ suggest again"
  link was added alongside the list — previously there was no way to re-fetch once a batch was shown.

Verified live: sent the real goal's two actual existing targets (`hedgePct`, `Argumentation`/Debate) as
`existingTargets` to `POST /api/objectives/suggest` and confirmed the three suggestions that came back
were all genuinely different (Content/Debate, pace/Debate, question-rate/Conversation) — neither
existing target reappeared, both from the prompt instruction working and, independently, from the
unconditional filter. `tsc --noEmit` and `eslint` both clean.

---

## 37. Auditing every LLM call site for unnecessary calls

Asked directly, generally: "how do we make sure we do not call LLM unnecessarily... anywhere else in
application." A grep for `chatCompletion(` (`lib/llm.ts`'s one shared entry point) confirms there are
exactly three call sites, no others — `lib/conversation.ts` (the live turn), `lib/grading.ts` (the
grading pass), `lib/objectiveSuggestion.ts` (§34's goal-target suggestion). Audited each:

- **Conversation** (`lib/conversation.ts`) — every call is a genuine live turn the user is waiting on;
  there's no batching/caching angle here since each reply is necessarily unique to what was just said.
  Not a waste-reduction target, it's the core product.
- **Objective suggestion** (`lib/objectiveSuggestion.ts`) — already gated behind an explicit
  "Suggest targets for me" click, with `disabled={suggesting}` preventing a second click while one is
  in flight (`app/components/ObjectiveCard.tsx`). No auto-trigger anywhere (no `useEffect` calling it on
  mount/render). Already correctly minimal.
- **Grading** (`lib/grading.ts`), via `/api/sessions/[id]/end` and `/api/sessions/[id]/pause` — `/end`
  was already fully idempotent (`getFeedback(id)` cache-checked before ever calling the LLM, since
  ending is terminal and existing feedback can never go stale). **`/pause` had no equivalent guard** —
  every call re-graded from scratch, even with zero new turns since the last pause (a double-click, or
  navigating back to the session and immediately pausing again without saying anything new). This was
  the one real, fixable gap, not a hypothetical one.

**Fix**: `Feedback` (`lib/types.ts`) gained `gradedTurnCount?: number` — `session.turns.length` at the
moment that feedback was generated, stamped by both `gradeSession()` and `emptyTranscriptFeedback()`
(`lib/grading.ts`). `/api/sessions/[id]/pause` now checks it before doing anything else: if cached
feedback exists, its `gradedTurnCount` matches the session's current turn count, *and* it didn't
previously fail, return the cached feedback with zero LLM calls. Deliberately does **not** skip when
the cached feedback's own `gradingFailed` is true — a failure is often transient (a provider hiccup),
so a repeat pause with no new turns should still get a real retry rather than being stuck serving a
stale "grading unavailable" placeholder indefinitely. `gradedTurnCount` is optional specifically so
older feedback files written before this field existed don't need a migration — missing just means
"always regrade," the safe direction to fail in (one possible extra call, never a stale result shown as
fresh).

Verified live against a real running session, not synthesized: created a session, posted one user turn,
paused (`gradedTurnCount: 3`, real grading call, confirmed via the daily LLM log's `grading`-labeled
entry count going 4 -> 5), paused again immediately with no new turns (log count stayed at 5 — zero
LLM calls, cached feedback returned), then posted a second turn and paused a third time (log count went
5 -> 6, confirming a genuine change still triggers a real regrade rather than the guard becoming a
permanent cache). Test session deleted afterward. `tsc --noEmit` and `eslint` both clean.

---

## 38. A goal target's advice has to actually be about that target

Directly reported against a real screenshot: the "Hedging words" target's advice read "Insert a pause
after 'million years' to give the audience time to absorb the point and improve rhythm" — accurate-
sounding, but not actually about hedging at all. Root cause: `computeTargetProgress`
(`lib/objectives.ts`) sourced every non-score metric's advice via `latestFixFor(meta.adviceSection,
...)`, which grabs the most recent LLM fix for the whole *Delivery* section — a section that also
covers pace and pauses, so whatever the model happened to write about there (in this case, rhythm) is
what showed up, whether or not it was about the specific metric being tracked. Separately asked to
verify: does the app tell you *which mode* to practice for a given target? For a mode-scoped target
("Argumentation in Debate") the mode was already in the label; for an unscoped one ("Hedging words")
nothing said "any mode" — it just said nothing, silently.

**Fix 1 — advice grounded in the metric itself, not the section**: new `deterministicAdviceFor()` in
`lib/objectives.ts` computes advice directly from the real counted data (`lib/deliveryMetrics.ts`'s
`fillerBreakdown`/`hedgeBreakdown`, `contentMetrics.ts`'s `ttrPct`, `conversationMetrics.ts`'s
`talkTimePct`/`questionRatePct`, `pitchMetrics.ts`'s `computePitchTiming`) for the single most recent
qualifying session — no LLM call, same "measured, not fabricated" discipline as every deterministic
number already in this app, and this ties directly into §37's theme: it's not just avoiding an
*unnecessary* LLM call, it's strictly more accurate than the LLM-fix-reuse it replaces, since it can
never be about the wrong thing within the same section. `overallScore`/`sectionScore` are the two
metrics that still use `latestFixFor` — a holistic score genuinely has no better source than the real
fix written for exactly that section, so that path is unchanged.

**Fix 2 — mode always stated, never silently omitted**: `ObjectiveCard.tsx`'s `targetLabel()` now
renders `(any mode)` explicitly when a target has no mode scope, instead of appending nothing. Every
target now answers "which mode should I be practicing this in" at a glance, one way or the other.

Verified live against the real "I want to get better at negotiating" goal: the "Hedging words (any
mode)" target's advice changed from the unrelated pause/rhythm text to "No hedging words caught in your
last Orator session — keep this up" (honest, since that real session genuinely had zero) — then, to
confirm the non-empty branch names real words rather than just handling the zero case, created a test
session with three deliberate hedges ("just" x2, "I guess" x1), graded it, and confirmed the advice
became "In your last Conversation session you used \"just\" (2x) and \"i guess\" (1x) — 5 hedging words
across 23 words (21.7%). Replace those with direct statements" — then deleted the test session and
confirmed the goal's "based on N sessions" count and advice both reverted cleanly (13 -> 12, back to the
honest zero-hedge state). `tsc --noEmit` and `eslint` both clean.

---

## 39. Curating the voice list — fewer choices, and a likely fix for a "blabbering" voice

Reported directly: a Debate session started in a "blabbering" voice. Two things at once, one a bug
report and one a repeated, explicit preference: "I do not need so many different types of voices — a
few and different tonalities." §29 had deliberately loaded and offered *every* voice
`speechSynthesis.getVoices()` returns (confirmed at the time: 180 real system voices) — reasonable
when the ask was just "let me pick a voice," but not once the ask became "not this many."

**The likely root cause of "blabbering," found by inspection**: macOS ships a long tail of novelty/
effect voices under Spoken Content > Customize — Zarvox, Bubbles, Deranged, Bells, Pipe Organ,
Trinoids, Whisper, and similar — that are pitch-shifted/robotic gags, not natural speaking voices.
With every OS voice listed and zero curation, nothing ever stopped one of these from being selected
(a stray click while exploring the ~180-option dropdown, most plausibly) and then persisting in
`localStorage` across every future session and mode, including Debate — a device-level preference by
original design (§29), not reset per session. Genuinely can't confirm this was *the* cause without
being able to hear the actual reported audio, but it's the one concrete, structurally-plausible
explanation the code supports, and fixing it is strictly correct regardless.

**Fix**: `lib/voiceCategories.ts` gained a small cross-platform curated allowlist (`samantha`, `alex`,
`karen`, `daniel` on macOS; `microsoft zira`, `microsoft david` on Windows; `google uk english female`/
`male` on Chrome — 8 names, realistically 2-4 present on any one real system) and `isCuratedVoice()`.
Two places enforce it, not just one, since filtering only the picker's *display* wouldn't have stopped
a stale bad `voiceURI` already in `localStorage` from still being matched and spoken:

- `app/components/VoicePicker.tsx` only ever lists curated voices (falling back to the full raw list
  only if literally none of the curated names are installed, so the picker never goes empty).
- `lib/useSpeech.ts`'s `speak()` now matches `voiceURI` only within the curated subset of
  `getVoices()`, not the full raw list — a voiceURI outside the curated set (an old novelty-voice
  selection, or a voice that's no longer installed) simply can't match anymore, so it can never
  actually be spoken; the browser's own default voice is used instead, which is never a novelty voice
  on a real system.

Style presets (Neutral/Soft/Persuasive/Harsh/Bossy, §31) are untouched — already a small, distinctly-
named set, which is what "a few... different tonalities" was read as endorsing rather than asking to
shrink further.

**Verification note, stated plainly**: this fix lives entirely in client-side Web Speech API code with
no server-rendered difference to check — `tsc --noEmit` and `eslint` both pass, and the curated-list/
matching logic was confirmed present in all three touched files, but actually *hearing* whether Debate
now sounds normal isn't something this environment can do (no browser audio available here). Flagged
to the user to verify directly in their own browser rather than claiming a fix confirmed by ear.

**Saved as a standing preference** (memory, not just this file): don't reintroduce the full unfiltered
voice list — a small curated set is the explicit, repeated ask.
