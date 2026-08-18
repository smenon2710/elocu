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
"how do I run and use this" doc.

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
interviewer's context.

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

Then fill in `.env.local`. At minimum you need one working LLM provider — see below.

### LLM providers

Elocu calls out to an LLM for two things: the live conversation loop and the post-session grading
pass (`lib/conversation.ts`, `lib/grading.ts`, both going through `lib/llm.ts`). Each has its own
**primary → fallback → fallback** chain, tried in order, stopping at the first success:

1. **Groq** (primary) — get a key at https://console.groq.com/keys. Primary for both use cases:
   speed via custom inference hardware matters for the live conversation *and* for grading, since
   the browser waits on the pause/end request before showing feedback.
2. **OpenRouter** (fallback) — get a key at https://openrouter.ai/keys. Used only if Groq fails for
   any reason (missing key, timeout, bad response).
3. **Ollama, local** (fallback) — optional. If you have [Ollama](https://ollama.com) running
   locally with a model pulled (`ollama pull llama3.2` is the one benchmarked and wired in by
   default), it's used as a last resort if both of the above fail. No API key needed. Free, fully
   private, no network dependency — but noticeably slower than the hosted options, which is why
   it's last in the chain, not first.

You technically only need Groq to run the app — OpenRouter and Ollama are safety nets, not
requirements. See `.env.example` for all the model-override env vars
(`GROQ_MODEL_CONVERSATION`, `OPENROUTER_MODEL_GRADING`, etc.) if you want to point any tier at a
different model.

## Running

```bash
npm run dev
```

Open http://localhost:3000 for the landing page, or go straight to http://localhost:3000/app to
start a session.

```bash
npm run build   # production build
npx tsc --noEmit   # type-check
npm run lint
```

## Architecture

- **`lib/llm.ts`** — provider-agnostic chat-completion wrapper (Groq/OpenRouter/Ollama are all
  OpenAI-compatible APIs, so one implementation covers all three) with automatic fallback chaining,
  a 45s per-call timeout that guards the *whole* round trip (not just headers), and structured
  local logging.
- **`lib/persona.ts`** — builds the system prompt per mode; same engine, different prompt/rubric
  inputs depending on mode and whether documents were attached.
- **`lib/conversation.ts`** — the live turn-taking loop. Fully decoupled from grading, which runs
  as a separate call after the session ends (or is paused) — the conversation stays fast, grading
  can afford to be more careful.
- **`lib/grading.ts`** — rubric-driven structured JSON output, with `validateQuotedMoment()`
  guarding against a model quoting the wrong speaker (verified this happens in practice — the
  guard strips just the bad quote, keeps the score/fix). Every turn now carries its *real* elapsed
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
- **`lib/store.ts`** — file-based persistence, no database. Sessions and feedback live in
  `data/sessions/*.json` (gitignored). Swapping to a real DB later is contained to this one file.
- **`lib/useSpeech.ts`** — browser Web Speech API wrapper. Push-to-talk-until-you're-done: the mic
  stays open across pauses (not silence-triggered), tapping it again is how you signal "I'm done."
- **Turn duration is real, not a same-instant double timestamp.** The session page
  (`app/(app)/session/[id]/page.tsx`) tracks the moment the floor becomes the user's — a mic tap, or
  the AI's previous line finishing — and sends the real elapsed time to
  `POST /api/sessions/[id]/messages`, which stamps the turn's `startTs`/`endTs` from it instead of
  calling `Date.now()` twice back to back. This is what makes Pitch mode's live countdown and its
  grading feedback honest, and it applies to every mode, not just Pitch.
- **Sessions can be paused** (`/api/sessions/[id]/pause`) to get feedback on the conversation so
  far without ending it — the session stays resumable, unlike `/api/sessions/[id]/end` (permanent).
- **History sidebar** (`app/components/HistorySidebar.tsx`) lists every session, in-progress and
  completed, linking to the right place (resume vs. view feedback) for each.
- **Insights dashboard** (`/app/insights`) — overall average, per-section breakdown, and a
  score-over-time trend, aggregated across every graded session (`lib/progress.ts`). Only counts
  sessions where grading actually succeeded toward the averages. Filterable per mode (`?mode=X`,
  tabs only shown for modes you've actually practiced) — an unfiltered view also shows the
  cross-mode breakdown; a filtered one swaps that for a "best section" callout. Also aggregates the
  real, deterministic metrics from `lib/deliveryMetrics.ts`/`contentMetrics.ts`/
  `conversationMetrics.ts`/`pitchMetrics.ts` — average pace, filler/hedge density, vocabulary
  diversity everywhere; talk-time ratio and question-asking rate for Conversation; time-budget
  adherence for Pitch.

## Logs

Every LLM call — which provider/model actually handled it, latency, token usage, success/failure —
is logged locally to `data/logs/llm-YYYY-MM-DD.jsonl` (gitignored), independent of any provider's
own dashboard. Each entry also carries a `providerRequestId`: for OpenRouter this can be looked up
directly via `GET https://openrouter.ai/api/v1/generation?id=<id>` for full cost/token stats on
that exact call. Grading responses that fail to parse are separately logged (with the raw model
output) to `data/logs/grading-failures-YYYY-MM-DD.jsonl`.

**In-app**: open any session's feedback screen → "View call log" (`/session/[id]/logs`) to see
which model answered each conversation turn and which one evaluated the session, with timing and
status, without touching the terminal.

```bash
cat data/logs/llm-*.jsonl | python3 -c "import json,sys; [print(json.loads(l)) for l in sys.stdin]"
```
