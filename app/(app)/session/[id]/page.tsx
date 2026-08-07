"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSpeech } from "@/lib/useSpeech";

type Turn = { speaker: "user" | "ai"; text: string };

const STATE_LABEL: Record<string, string> = {
  idle: "Tap the mic to talk",
  listening: "Listening — take your time, tap again when you're done",
  thinking: "Thinking…",
  speaking: "Speaking…",
};

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(true);
  const [textInput, setTextInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [pausing, setPausing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const endingRef = useRef(false);
  const pausingRef = useRef(false);
  const spokeOpeningRef = useRef(false);
  // React state updates are async, so two near-simultaneous triggers (voice
  // onresult firing right as the user hits Enter, say) could both read
  // `sending === false` before either commits. This ref is set synchronously
  // and is the real reentrancy guard; `sending` still drives the UI.
  const processingRef = useRef(false);

  const handleUserTurn = async (text: string) => {
    if (!text.trim() || processingRef.current || endingRef.current || pausingRef.current) return;
    processingRef.current = true;
    setSending(true);
    setError(null);
    setTurns((prev) => [...prev, { speaker: "user", text }]);
    setTextInput("");
    speech.setState("thinking");

    try {
      const res = await fetch(`/api/sessions/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
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
      } else if (speech.supported) {
        speech.startListening();
      } else {
        speech.setState("idle");
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
        if (data.session) setTurns(data.session.turns);
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

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
      if (lastTurn?.speaker === "ai" && speech.supported) {
        await speech.speak(lastTurn.text);
        if (!endingRef.current) speech.startListening();
      }
    }

    resume();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, turns, speech.supported]);

  async function endSession() {
    if (endingRef.current) return;
    endingRef.current = true;
    setEnded(true);
    speech.stopListening();
    try {
      await fetch(`/api/sessions/${id}/end`, { method: "POST" });
    } finally {
      router.push(`/session/${id}/feedback`);
    }
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

  if (loading) return <main className="p-8 text-gray-500">Loading…</main>;

  return (
    <main className="mx-auto flex h-full max-w-2xl flex-col p-6">
      <div className="flex-1 space-y-4 overflow-y-auto">
        {turns.map((t, i) => (
          <div key={i} className={t.speaker === "user" ? "text-right" : "text-left"}>
            <span
              className={`inline-block max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                t.speaker === "user" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-900"
              }`}
            >
              {t.text}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex flex-col gap-3">
        {speech.supported && (
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => (speech.state === "listening" ? speech.stopListening() : speech.startListening())}
                disabled={sending || ended || pausing || speech.state === "thinking" || speech.state === "speaking"}
                className={`flex h-16 w-16 items-center justify-center rounded-full text-2xl text-white transition ${
                  speech.state === "listening" ? "bg-red-500" : "bg-blue-600"
                } disabled:opacity-50`}
                aria-label={speech.state === "listening" ? "I'm done talking" : "Start talking"}
              >
                🎙️
              </button>
              <span className="text-sm text-gray-500">{STATE_LABEL[speech.state]}</span>
            </div>
            {speech.state === "listening" && speech.interimText && (
              <p className="max-w-md text-center text-sm italic text-gray-400">{speech.interimText}</p>
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
            className="flex-1 rounded-full border px-4 py-2 text-sm"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder={speech.supported ? "…or type instead" : "Type your response"}
            disabled={sending || ended || pausing}
          />
          <button
            type="submit"
            className="rounded-full bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
            disabled={sending || ended || pausing || !textInput.trim()}
          >
            Send
          </button>
          <button
            type="button"
            onClick={pauseSession}
            title="Get feedback on the conversation so far without ending it — you can resume later"
            className="rounded-full border px-4 py-2 text-sm disabled:opacity-50"
            disabled={ended || pausing || speech.state === "listening"}
          >
            {pausing ? "Pausing…" : "Pause & get feedback"}
          </button>
          <button
            type="button"
            onClick={endSession}
            className="rounded-full border px-4 py-2 text-sm disabled:opacity-50"
            disabled={ended || pausing || speech.state === "listening"}
          >
            End session
          </button>
        </form>
      </div>
    </main>
  );
}
