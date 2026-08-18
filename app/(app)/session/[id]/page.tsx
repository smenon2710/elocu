"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VoicePicker } from "@/app/components/VoicePicker";
import { useSpeech } from "@/lib/useSpeech";
import type { SessionMode } from "@/lib/types";
import type { VoiceStyleKey } from "@/lib/voiceCategories";

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
  // Ticks while it's the user's turn in pitch mode so the live clock
  // re-renders — the actual elapsed time is computed from turnStartRef below,
  // this state just forces a redraw every quarter second.
  const [pitchTick, setPitchTick] = useState(0);
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

  const handleUserTurn = async (text: string) => {
    if (!text.trim() || processingRef.current || endingRef.current || pausingRef.current) return;
    processingRef.current = true;
    setSending(true);
    setError(null);
    setTurns((prev) => [...prev, { speaker: "user", text }]);
    setTextInput("");
    speech.setState("thinking");

    const elapsedMs = turnStartRef.current !== null ? Math.max(0, Date.now() - turnStartRef.current) : null;
    turnStartRef.current = null;

    try {
      const res = await fetch(`/api/sessions/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, ...(elapsedMs !== null ? { elapsedMs } : {}) }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      if (data.session) setTurns(data.session.turns);
      setSending(false);
      processingRef.current = false;

      const lastAiTurn = [...(data.session?.turns ?? [])].reverse().find((t: Turn) => t.speaker === "ai");
      if (lastAiTurn && speech.supported) {
        await speech.speak(lastAiTurn.text);
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

  const speech = useSpeech(handleUserTurn);

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
          await speech.speak(lastTurn.text);
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
      await fetch(`/api/sessions/${id}/end`, { method: "POST" });
    } finally {
      router.push(`/session/${id}/feedback`);
    }
  }

  // Previews a voice/style change against the actual most recent AI line
  // (not a generic sample phrase) whenever it's safe to interrupt — hearing
  // the persona's real words is what tells you whether the choice actually
  // fits, a generic "hello, this is my voice" doesn't.
  function previewIfSafe() {
    if (sending || ended || pausing || speech.state === "listening" || speech.state === "thinking") return;
    const lastAiTurn = [...turns].reverse().find((t) => t.speaker === "ai");
    if (lastAiTurn) speech.speak(lastAiTurn.text);
  }

  function handleVoiceChange(uri: string) {
    speech.setVoiceURI(uri);
    previewIfSafe();
  }

  function handleStyleChange(style: VoiceStyleKey) {
    speech.setVoiceStyle(style);
    previewIfSafe();
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
      await fetch(`/api/sessions/${id}/pause`, { method: "POST" });
    } finally {
      router.push(`/session/${id}/feedback`);
    }
  }

  if (loading) return <main className="p-8 font-mono text-sm text-parchment-500">Loading…</main>;

  const showPitchClock =
    mode === "pitch" && pitchTimeLimitSec !== null && turnStartRef.current !== null && !sending && !ended && !pausing;
  const pitchElapsedMs = showPitchClock ? Date.now() - (turnStartRef.current as number) : 0;
  const pitchOverBudget = showPitchClock && pitchElapsedMs > pitchTimeLimitSec! * 1000;
  // Referencing pitchTick here (unused otherwise) is what makes the interval
  // above actually cause a re-render each tick — the clock's real value
  // always comes from Date.now() - turnStartRef, this just triggers the redraw.
  void pitchTick;

  return (
    <main className="mx-auto flex h-full max-w-2xl flex-col p-6">
      <div className="flex-1 overflow-y-auto rounded-2xl border border-hairline bg-ink-800 p-6">
        <div className="space-y-5">
          {turns.map((t, i) => (
            <div key={i} className="transcript-line">
              <span
                className={`font-mono text-xs tracking-[0.15em] uppercase ${
                  t.speaker === "user" ? "text-ember-400" : "text-verdigris-400"
                }`}
              >
                {t.speaker === "user" ? "You" : "Elocu"}
              </span>
              <p className="mt-1 text-sm leading-relaxed text-parchment-100">{t.text}</p>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {error && <p className="mt-2 text-sm text-rust-400">{error}</p>}

      <div className="mt-4 flex flex-col gap-3">
        {speech.supported && speech.voices.length > 0 && (
          <div className="flex justify-center">
            <VoicePicker
              voices={speech.voices}
              voiceURI={speech.voiceURI}
              onVoiceChange={handleVoiceChange}
              voiceStyle={speech.voiceStyle}
              onStyleChange={handleStyleChange}
            />
          </div>
        )}

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
              <span className="font-mono text-xs text-parchment-500">{STATE_LABEL[speech.state]}</span>
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
            className="flex-1 rounded-full border border-hairline bg-ink-800 px-4 py-2 text-sm text-parchment-100 placeholder:text-parchment-500/60 focus:border-ember-500"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder={speech.supported ? "…or type instead" : "Type your response"}
            disabled={sending || ended || pausing}
          />
          <button
            type="submit"
            className="rounded-full bg-ember-500 px-4 py-2 text-sm font-medium text-ink-950 transition hover:bg-ember-400 disabled:opacity-40"
            disabled={sending || ended || pausing || !textInput.trim()}
          >
            Send
          </button>
          <button
            type="button"
            onClick={pauseSession}
            title="Get feedback on the conversation so far without ending it — you can resume later"
            className="rounded-full border border-hairline px-4 py-2 text-sm text-parchment-300 transition hover:border-verdigris-500/60 hover:text-verdigris-400 disabled:opacity-40"
            disabled={ended || pausing || speech.state === "listening"}
          >
            {pausing ? "Pausing…" : "Pause & get feedback"}
          </button>
          <button
            type="button"
            onClick={endSession}
            className="rounded-full border border-hairline px-4 py-2 text-sm text-parchment-300 transition hover:border-rust-500/60 hover:text-rust-400 disabled:opacity-40"
            disabled={ended || pausing || speech.state === "listening"}
          >
            End session
          </button>
        </form>
      </div>
    </main>
  );
}
