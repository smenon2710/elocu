"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSpeech } from "@/lib/useSpeech";
import { MAX_EXCHANGES_BY_MODE, type SessionMode } from "@/lib/types";

type Turn = { speaker: "user" | "ai"; text: string };

const STATE_LABEL: Record<string, string> = {
  idle: "Tap the mic to talk",
  listening: "Listening — take your time, tap again when you're done",
  thinking: "Thinking…",
  speaking: "Speaking…",
};

function formatClock(ms: number): string {
  const totalSec = Math.floor(Math.max(ms, 0) / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [turns, setTurns] = useState<Turn[]>([]);
  const [mode, setMode] = useState<SessionMode | null>(null);
  const [pitchTimeLimitSec, setPitchTimeLimitSec] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [textInput, setTextInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [pausing, setPausing] = useState(false);
  // A finished spoken turn waiting for the user to review/correct it before
  // it's sent. `elapsedMs` is the real speaking duration, captured at
  // mic-stop (not at send) so time spent editing never inflates the pacing
  // metrics (WPM, pitch timing) this review step exists to protect. Null when
  // there's nothing pending — the normal mic + type controls show instead.
  const [pending, setPending] = useState<{ text: string; elapsedMs: number | null } | null>(null);
  // Ticks while it's the user's turn in pitch mode so the live clock
  // re-renders — the actual elapsed time is computed from turnStartRef below,
  // this state just forces a redraw every quarter second.
  const [pitchTick, setPitchTick] = useState(0);
  // Set when a reply couldn't be played aloud — mobile browsers (iOS Safari
  // especially) block speech that doesn't start from a tap, which is exactly
  // what an auto-played reply is. Cleared once anything plays successfully.
  const [audioBlocked, setAudioBlocked] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const endingRef = useRef(false);
  const pausingRef = useRef(false);
  const spokeOpeningRef = useRef(false);
  // React state updates are async, so two near-simultaneous triggers (voice
  // onresult firing right as the user hits Enter, say) could both read
  // `sending === false` before either commits. This ref is set synchronously
  // and is the real reentrancy guard; `sending` still drives the UI.
  const processingRef = useRef(false);
  // The moment the floor became the user's — set right after the previous AI
  // line finished (spoken or not) and cleared the instant a turn is
  // submitted. Sent to the server as elapsedMs so a turn's real duration is
  // captured instead of a same-instant double timestamp (see
  // app/api/sessions/[id]/messages/route.ts) — what makes real pacing
  // feedback possible for pitch mode, and more honest Delivery timing for
  // every other mode too.
  const turnStartRef = useRef<number | null>(null);

  const handleUserTurn = async (text: string, elapsedMsOverride?: number | null) => {
    if (!text.trim() || processingRef.current || endingRef.current || pausingRef.current) return;
    processingRef.current = true;
    setPending(null);
    setSending(true);
    setError(null);
    setTurns((prev) => [...prev, { speaker: "user", text }]);
    setTextInput("");
    speech.setState("thinking");

    // A reviewed spoken turn passes its real speaking duration (captured at
    // mic-stop) as the override; a typed turn has no override and is timed
    // from turnStartRef as before.
    const elapsedMs =
      elapsedMsOverride !== undefined
        ? elapsedMsOverride
        : turnStartRef.current !== null
          ? Math.max(0, Date.now() - turnStartRef.current)
          : null;
    turnStartRef.current = null;

    try {
      const res = await fetch(`/api/sessions/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, ...(elapsedMs !== null ? { elapsedMs } : {}) }),
      });
      const data = await res.json();
      if (res.status === 429) {
        // Rate-limited: the server saved nothing, so take the optimistic turn
        // back off the transcript and return the text to the input, ready to
        // send again once the limit resets.
        setTurns((prev) => prev.slice(0, -1));
        setTextInput(text);
        setError(data.error);
        setSending(false);
        processingRef.current = false;
        turnStartRef.current = Date.now();
        speech.setState("idle");
        return;
      }
      if (data.error) setError(data.error);
      if (data.session) setTurns(data.session.turns);
      setSending(false);
      processingRef.current = false;

      const lastAiTurn = [...(data.session?.turns ?? [])].reverse().find((t: Turn) => t.speaker === "ai");
      if (lastAiTurn && speech.supported) {
        setAudioBlocked(!(await speech.speak(lastAiTurn.text)));
      }

      if (data.shouldAutoEnd) {
        await endSession();
      } else {
        turnStartRef.current = Date.now();
        if (speech.supported) {
          speech.startListening();
        } else {
          speech.setState("idle");
        }
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setSending(false);
      processingRef.current = false;
      speech.setState("idle");
    }
  };

  // A finished spoken turn lands here — stashed for review, not sent. Speech
  // recognition mis-hears homophones, drops words, and mis-segments phrases,
  // and an unreviewed transcript then gets quoted back as "your words" and
  // counted toward the filler/pace/vocabulary metrics. Capturing elapsed time
  // here (at mic-stop) keeps review/edit time out of the pacing numbers.
  const handleFinalTranscript = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || processingRef.current || endingRef.current || pausingRef.current) return;
    const elapsedMs = turnStartRef.current !== null ? Math.max(0, Date.now() - turnStartRef.current) : null;
    turnStartRef.current = null;
    setPending({ text: trimmed, elapsedMs });
    speech.setState("idle");
  };

  const speech = useSpeech(handleFinalTranscript);

  useEffect(() => {
    fetch(`/api/sessions/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.session) {
          setTurns(data.session.turns);
          setMode(data.session.mode);
          setPitchTimeLimitSec(data.session.pitchTimeLimitSec ?? null);
        }
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  // Redraws the live pitch clock every quarter second while it's the user's
  // turn — cheap no-op the rest of the time (interval just isn't created).
  useEffect(() => {
    if (mode !== "pitch") return;
    const interval = setInterval(() => setPitchTick((n) => n + 1), 250);
    return () => clearInterval(interval);
  }, [mode]);

  // Speak the most recent AI line once the session loads — the opening line
  // on a fresh session, or wherever the transcript left off when resuming an
  // in-progress one. If the session was interrupted right after the user's
  // turn was saved but before the AI replied (an LLM call failing mid-flight),
  // fetch that missing reply first rather than leaving the user stuck.
  useEffect(() => {
    if (loading || spokeOpeningRef.current || turns.length === 0) return;
    spokeOpeningRef.current = true;

    async function resume() {
      let latestTurns = turns;
      if (latestTurns[latestTurns.length - 1].speaker === "user") {
        try {
          const res = await fetch(`/api/sessions/${id}/retry`, { method: "POST" });
          const data = await res.json();
          if (data.session) {
            latestTurns = data.session.turns;
            setTurns(latestTurns);
          }
          if (data.error) setError(data.error);
          if (data.shouldAutoEnd) {
            await endSession();
            return;
          }
        } catch {
          setError("Couldn't reach the server to resume this session.");
          return;
        }
      }

      const lastTurn = latestTurns[latestTurns.length - 1];
      if (lastTurn?.speaker === "ai") {
        if (speech.supported) {
          setAudioBlocked(!(await speech.speak(lastTurn.text)));
        }
        turnStartRef.current = Date.now();
        if (speech.supported && !endingRef.current) speech.startListening();
      }
    }

    resume();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, turns, speech.supported]);

  async function endSession() {
    if (endingRef.current) return;
    endingRef.current = true;
    setEnded(true);
    turnStartRef.current = null;
    speech.stopListening();
    try {
      const res = await fetch(`/api/sessions/${id}/end`, { method: "POST" });
      if (res.status === 429) {
        // Not graded and not ended (the server checks the limit first) —
        // stay on the session so it can be ended once the limit resets.
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Too many requests — try again shortly.");
        endingRef.current = false;
        setEnded(false);
        return;
      }
    } catch {
      // fall through to the feedback page, which explains if nothing's there
    }
    router.push(`/session/${id}/feedback`);
  }

  // Plays the most recent AI line again, whenever it's safe to interrupt —
  // the "Replay" / "Tap to hear" button. (Voice and delivery style are chosen
  // before the session, on /app/voice — there's no picker here.)
  function replayLastReply() {
    if (sending || ended || pausing || speech.state === "listening" || speech.state === "thinking") return;
    const lastAiTurn = [...turns].reverse().find((t) => t.speaker === "ai");
    if (!lastAiTurn) return;
    // speak() leaves state at "speaking" for its caller to move on from — the
    // turn loop does that by starting to listen, but a standalone playback
    // has to hand the floor back itself, or the mic stays disabled under a
    // stale "Speaking…".
    speech.speak(lastAiTurn.text).then((played) => {
      if (played) setAudioBlocked(false);
      speech.setState((s) => (s === "speaking" ? "idle" : s));
    });
  }

  // Send the reviewed transcript, carrying the speaking duration captured
  // when the mic was stopped (not now) so editing time isn't counted as
  // delivery time.
  function sendPending() {
    if (!pending || !pending.text.trim() || sending) return;
    handleUserTurn(pending.text, pending.elapsedMs);
  }

  // Throw the draft away and start listening again from scratch.
  function redoPending() {
    setPending(null);
    turnStartRef.current = Date.now();
    if (speech.supported) speech.startListening();
  }

  // Throw the draft away and go idle — the normal mic + type controls return.
  function discardPending() {
    setPending(null);
    turnStartRef.current = Date.now();
    speech.setState("idle");
  }

  // Grades the conversation so far without ending it — the session stays
  // resumable (e.g. if a slow/unreliable free model made you want to bail
  // mid-conversation, you still get feedback on what you did, and can come
  // back and pick up where you left off later via the sidebar or home page).
  async function pauseSession() {
    if (pausingRef.current || endingRef.current) return;
    pausingRef.current = true;
    setPausing(true);
    speech.stopListening();
    try {
      const res = await fetch(`/api/sessions/${id}/pause`, { method: "POST" });
      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Too many requests — try again shortly.");
        pausingRef.current = false;
        setPausing(false);
        return;
      }
    } catch {
      // fall through to the feedback page, which explains if nothing's there
    }
    router.push(`/session/${id}/feedback`);
  }

  if (loading) return <main className="p-8 font-mono text-sm text-parchment-500">Loading…</main>;

  const maxExchanges = mode ? MAX_EXCHANGES_BY_MODE[mode] : null;
  const exchangesDone = turns.filter((t) => t.speaker === "user").length;
  // Multi-turn modes auto-end after their last exchange — say so up front
  // rather than cutting the conversation off without warning.
  const exchangesLeft = maxExchanges !== null && maxExchanges > 1 ? maxExchanges - exchangesDone : null;
  const lastAiIndex = turns.map((t) => t.speaker).lastIndexOf("ai");
  const canReplay =
    speech.supported && !sending && !ended && !pausing && speech.state !== "listening" && speech.state !== "thinking";

  const showPitchClock =
    mode === "pitch" && pitchTimeLimitSec !== null && turnStartRef.current !== null && !sending && !ended && !pausing;
  const pitchElapsedMs = showPitchClock ? Date.now() - (turnStartRef.current as number) : 0;
  const pitchOverBudget = showPitchClock && pitchElapsedMs > pitchTimeLimitSec! * 1000;
  // Referencing pitchTick here (unused otherwise) is what makes the interval
  // above actually cause a re-render each tick — the clock's real value
  // always comes from Date.now() - turnStartRef, this just triggers the redraw.
  void pitchTick;

  return (
    <main className="mx-auto flex h-full max-w-2xl flex-col p-3 sm:p-6">
      <div className="flex-1 overflow-y-auto rounded-2xl border border-hairline bg-ink-800 p-4 sm:p-6">
        <div className="space-y-5" role="log" aria-live="polite" aria-label="Conversation transcript">
          {turns.map((t, i) => (
            <div key={i} className="transcript-line">
              <div className="flex items-center gap-3">
                <span
                  className={`font-mono text-xs tracking-[0.15em] uppercase ${
                    t.speaker === "user" ? "text-ember-400" : "text-verdigris-400"
                  }`}
                >
                  {t.speaker === "user" ? "You" : "Elocu"}
                </span>
                {i === lastAiIndex && speech.supported && (
                  <button
                    type="button"
                    onClick={replayLastReply}
                    disabled={!canReplay}
                    className={`font-mono text-[11px] tracking-wide uppercase transition disabled:opacity-40 ${
                      audioBlocked ? "text-ember-400 hover:text-ember-300" : "text-parchment-500 hover:text-verdigris-400"
                    }`}
                    aria-label="Play this reply aloud"
                  >
                    ▶ {audioBlocked ? "Tap to hear" : "Replay"}
                  </button>
                )}
              </div>
              <p className="mt-1 text-sm leading-relaxed text-parchment-100">{t.text}</p>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {error && <p className="mt-2 text-sm text-rust-400">{error}</p>}
      {speech.micError && pending === null && (
        <p className="mt-2 text-sm text-gold-500" role="alert">
          {speech.micError}
        </p>
      )}
      {audioBlocked && (
        <p className="mt-2 text-sm text-parchment-500">
          Your browser blocked the reply from playing automatically — tap{" "}
          <span className="text-ember-400">▶ Tap to hear</span> above to play it.
        </p>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {showPitchClock && (
          <p
            className={`text-center font-mono text-sm tabular-nums ${
              pitchOverBudget ? "text-rust-400" : "text-ember-400"
            }`}
          >
            {formatClock(pitchElapsedMs)} / {formatClock(pitchTimeLimitSec! * 1000)}
            {pitchOverBudget && <span className="ml-1 text-xs uppercase">over</span>}
          </p>
        )}

        {pending !== null ? (
          <div
            role="group"
            aria-label="Review your spoken turn before sending"
            className="flex flex-col gap-2 rounded-2xl border border-verdigris-500/40 bg-ink-800 p-4"
          >
            <label htmlFor="stt-review" className="font-mono text-xs tracking-[0.15em] text-verdigris-400 uppercase">
              Review — fix anything the mic got wrong
            </label>
            <textarea
              id="stt-review"
              autoFocus
              rows={4}
              className="w-full rounded-lg border border-hairline bg-ink-900 p-3 text-sm leading-relaxed text-parchment-100 focus:border-ember-500"
              value={pending.text}
              onChange={(e) => setPending((p) => (p ? { ...p, text: e.target.value } : p))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendPending();
                }
              }}
              disabled={sending}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={sendPending}
                disabled={sending || !pending.text.trim()}
                className="rounded-full bg-ember-500 px-4 py-2 text-sm font-medium text-ink-950 transition hover:bg-ember-400 disabled:opacity-40"
              >
                {sending ? "Sending…" : "Send"}
              </button>
              {speech.supported && (
                <button
                  type="button"
                  onClick={redoPending}
                  disabled={sending}
                  className="rounded-full border border-hairline px-4 py-2 text-sm text-parchment-300 transition hover:border-verdigris-500/60 hover:text-verdigris-400 disabled:opacity-40"
                >
                  Re-record
                </button>
              )}
              <button
                type="button"
                onClick={discardPending}
                disabled={sending}
                className="rounded-full border border-hairline px-4 py-2 text-sm text-parchment-300 transition hover:border-rust-500/60 hover:text-rust-400 disabled:opacity-40"
              >
                Discard
              </button>
              <span className="font-mono text-xs text-parchment-500">
                Enter to send · Shift+Enter for a line break
              </span>
            </div>
          </div>
        ) : (
          <>
            {speech.supported && (
              <div className="flex flex-col items-center gap-2">
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (speech.state === "listening") {
                        speech.stopListening();
                      } else {
                        turnStartRef.current = Date.now();
                        speech.startListening();
                      }
                    }}
                    disabled={sending || ended || pausing || speech.state === "thinking" || speech.state === "speaking"}
                    className={`flex h-16 w-16 items-center justify-center rounded-full text-2xl transition ${
                      speech.state === "listening"
                        ? "mic-listening bg-rust-500 text-ink-950"
                        : "bg-ember-500 text-ink-950 hover:bg-ember-400"
                    } disabled:opacity-40`}
                    aria-label={speech.state === "listening" ? "I'm done talking" : "Start talking"}
                  >
                    🎙️
                  </button>
                  <span className="font-mono text-xs text-parchment-500" aria-live="polite">
                    {STATE_LABEL[speech.state]}
                  </span>
                </div>
                {speech.state === "listening" && speech.interimText && (
                  <p className="max-w-md text-center text-sm text-parchment-500 italic">{speech.interimText}</p>
                )}
              </div>
            )}

            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                handleUserTurn(textInput);
              }}
            >
              <input
                className="min-w-0 flex-1 rounded-full border border-hairline bg-ink-800 px-4 py-2 text-sm text-parchment-100 placeholder:text-parchment-500/60 focus:border-ember-500"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={speech.supported ? "…or type instead" : "Type your response"}
                aria-label="Type your response"
                disabled={sending || ended || pausing}
              />
              <button
                type="submit"
                className="shrink-0 rounded-full bg-ember-500 px-4 py-2 text-sm font-medium text-ink-950 transition hover:bg-ember-400 disabled:opacity-40"
                disabled={sending || ended || pausing || !textInput.trim()}
              >
                Send
              </button>
            </form>

            {/* Session controls sit on their own row: next to the input they
                pushed the bar well past a phone's width (four controls, no
                wrap). */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <p className="font-mono text-xs text-parchment-500">
                {speech.state === "listening" ? (
                  "Tap the mic when you're done to pause or end"
                ) : exchangesLeft !== null ? (
                  exchangesLeft <= 1 ? (
                    <span className="text-gold-500">Last exchange — the session wraps up after this answer</span>
                  ) : (
                    `${exchangesLeft} exchanges left`
                  )
                ) : null}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={pauseSession}
                  title="Get feedback on the conversation so far without ending it — you can resume later"
                  className="rounded-full border border-hairline px-3 py-1.5 text-sm text-parchment-300 transition hover:border-verdigris-500/60 hover:text-verdigris-400 disabled:opacity-40 sm:px-4"
                  disabled={ended || pausing || speech.state === "listening"}
                >
                  {pausing ? "Pausing…" : "Pause & get feedback"}
                </button>
                <button
                  type="button"
                  onClick={endSession}
                  className="rounded-full border border-hairline px-3 py-1.5 text-sm text-parchment-300 transition hover:border-rust-500/60 hover:text-rust-400 disabled:opacity-40 sm:px-4"
                  disabled={ended || pausing || speech.state === "listening"}
                >
                  End session
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
