"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

// The Web Speech API has no official TS lib.dom types yet — minimal ambient
// shapes for just what this hook uses.
interface SpeechRecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: Event) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export type VoiceState = "idle" | "listening" | "thinking" | "speaking";

const noopSubscribe = () => () => {};
const getSupportedSnapshot = () => getSpeechRecognitionCtor() !== null && "speechSynthesis" in window;
const getSupportedServerSnapshot = () => false;

// Which TTS voice to speak AI replies in — a device/browser preference, not
// app data, so it lives in localStorage rather than the session store.
const VOICE_STORAGE_KEY = "elocu-voice-uri";

/**
 * Wraps browser-native STT (SpeechRecognition) and TTS (speechSynthesis).
 *
 * STT is push-to-talk-until-you're-done, not silence-triggered: the mic stays
 * open (continuous + interim results) across pauses, and only the user
 * tapping the mic again ends the turn and submits it. If the browser's
 * recognizer ends on its own (a silence timeout, or an internal max-duration
 * cap on long sessions) before the user has signalled they're done, a fresh
 * instance is started transparently, carrying the accumulated transcript
 * forward — so a pause to think never gets mistaken for "finished talking."
 */
export function useSpeech(onFinalTranscript: (text: string) => void) {
  const [state, setState] = useState<VoiceState>("idle");
  const [interimText, setInterimText] = useState("");
  const supported = useSyncExternalStore(noopSubscribe, getSupportedSnapshot, getSupportedServerSnapshot);

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  // Lazy initializer (not an effect) since localStorage is a synchronous
  // read — nothing renders differently based on this before `voices` itself
  // populates post-hydration (see the effect below), so there's no
  // server/client mismatch risk from reading it up front.
  const [voiceURI, setVoiceURIState] = useState<string | null>(() =>
    typeof window === "undefined" ? null : localStorage.getItem(VOICE_STORAGE_KEY)
  );

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalBufferRef = useRef("");
  const manualStopRef = useRef(false);
  const onFinalRef = useRef(onFinalTranscript);
  // Indirection so the transparent-restart case (below) can call the latest
  // spawnRecognition without referencing it by name inside its own
  // definition, which the compiler's exhaustive-deps analysis disallows.
  const spawnRecognitionRef = useRef<() => SpeechRecognitionLike | null>(() => null);

  useEffect(() => {
    onFinalRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  // Voice list loads asynchronously in most browsers — an initial
  // getVoices() call is frequently empty, populated later via the
  // voiceschanged event, hence both here rather than just one.
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    function loadVoices() {
      setVoices(window.speechSynthesis.getVoices());
    }
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, []);

  const setVoiceURI = useCallback((uri: string | null) => {
    setVoiceURIState(uri);
    if (typeof window === "undefined") return;
    if (uri) localStorage.setItem(VOICE_STORAGE_KEY, uri);
    else localStorage.removeItem(VOICE_STORAGE_KEY);
  }, []);

  // Builds one recognizer instance wired for the accumulate-until-stopped
  // model.
  const spawnRecognition = useCallback((): SpeechRecognitionLike | null => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return null;

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (e) => {
      let interim = "";
      let finalChunk = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const text = result?.[0]?.transcript ?? "";
        if (result.isFinal) finalChunk += text;
        else interim += text;
      }
      if (finalChunk) {
        finalBufferRef.current = `${finalBufferRef.current} ${finalChunk}`.trim();
      }
      setInterimText(interim);
    };

    // Transient errors (e.g. a "no-speech" blip during a long pause) aren't
    // fatal — only a manual stop should end the turn. onend decides whether
    // to restart or finalize; there's nothing extra to do here.
    recognition.onerror = () => {};

    recognition.onend = () => {
      if (manualStopRef.current) {
        manualStopRef.current = false;
        const transcript = finalBufferRef.current.trim();
        finalBufferRef.current = "";
        setInterimText("");
        recognitionRef.current = null;
        if (transcript) {
          onFinalRef.current(transcript);
        } else {
          setState("idle");
        }
        return;
      }

      // Ended on its own (silence timeout / internal cap) while the user was
      // still mid-turn — restart transparently rather than treating a pause
      // as "done talking." Any *intentional* stop (startListening()'s
      // defensive stop of a stale instance, or unmount cleanup) nulls this
      // handler first, so reaching here always means an unexpected end.
      //
      // Deliberately not done via a functional setState updater: Next's App
      // Router runs Strict Mode by default, which double-invokes updater
      // functions to catch impure ones — an updater that spawns and starts a
      // real SpeechRecognition instance as a side effect would run twice,
      // leaving two live recognizers both forwarding the same transcript.
      const next = spawnRecognitionRef.current();
      if (!next) {
        setState("idle");
        return;
      }
      recognitionRef.current = next;
      try {
        next.start();
        setState("listening");
      } catch {
        setState("idle");
      }
    };

    return recognition;
  }, []);

  useEffect(() => {
    spawnRecognitionRef.current = spawnRecognition;
  }, [spawnRecognition]);

  const startListening = useCallback(() => {
    // Guard against two overlapping recognizers (e.g. a manual tap racing an
    // in-flight auto-restart): without this, both could independently
    // forward a transcript and trigger two LLM calls for one turn.
    if (recognitionRef.current) {
      recognitionRef.current.onresult = null;
      recognitionRef.current.onend = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.stop();
    }
    finalBufferRef.current = "";
    manualStopRef.current = false;
    setInterimText("");

    const recognition = spawnRecognition();
    if (!recognition) return;

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setState("listening");
    } catch {
      setState("idle");
    }
  }, [spawnRecognition]);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) {
      setState("idle");
      return;
    }
    // Signals "I'm done" — onend will finalize the buffer and submit it.
    manualStopRef.current = true;
    recognitionRef.current.stop();
  }, []);

  const speak = useCallback(
    (text: string): Promise<void> => {
      return new Promise((resolve) => {
        if (!("speechSynthesis" in window) || !text) {
          resolve();
          return;
        }
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        if (voiceURI) {
          const match = window.speechSynthesis.getVoices().find((v) => v.voiceURI === voiceURI);
          if (match) utterance.voice = match;
        }
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        setState("speaking");
        window.speechSynthesis.speak(utterance);
      });
    },
    [voiceURI]
  );

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.stop();
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return { state, setState, supported, interimText, startListening, stopListening, speak, voices, voiceURI, setVoiceURI };
}
