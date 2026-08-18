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
- **[Idea, not started]** Re-practice & compare — redo the same topic and see a direct before/after
  score diff, rather than only the aggregate trend line on `/app/progress`. More actionable and
  motivating than a general upward trend; the data model already groups by topic/mode, so this is
  mostly a query plus a small UI addition, not a schema change.
- **[Idea, not started]** Adjustable Debate/Interview intensity ("easy / standard / tough") — a
  small persona-prompt change (`lib/persona.ts`) with outsized replay value, since every debate
  currently argues at the same pushback level regardless of the user's experience.
- **[Known limitation, not started]** No path to a public deployment yet. Two real blockers
  discussed but not yet acted on: (1) `lib/store.ts` writes sessions/feedback/logs to local JSON
  files, which doesn't survive Vercel's ephemeral per-invocation filesystem — needs a real backing
  store (e.g. Postgres) before deploying there; (2) `LOCAL_USER_ID` (§5, §18) is a single hardcoded
  constant — no auth, so a public URL would let every visitor share one identity and see each
  other's sessions, and would let anyone spend the app's own Groq/OpenRouter API budget with no
  gating. Storage should come first (it's what actually breaks in production); auth is what makes it
  safe to share the URL at all.

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
