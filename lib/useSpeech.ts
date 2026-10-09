"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { buildUtterance, useVoiceSettings } from "./useVoiceSettings";

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
  onerror: ((e: Event & { error?: string }) => void) | null;
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

// Recognition errors that won't fix themselves by restarting — permission
// denied, no microphone, or the recognizer service being unavailable.
// Everything else ("no-speech", "network" blips, "aborted") is transient and
// handled by onend's transparent restart.
const FATAL_MIC_ERRORS = new Set(["not-allowed", "service-not-allowed", "audio-capture"]);
const MIC_ERROR_MESSAGE =
  "Couldn't use the microphone. Tap the mic to try again — if it keeps failing, allow microphone access for this site in your browser settings, or type instead.";

// iOS Safari (and some other mobile browsers) only allow speech synthesis
// that starts from a user gesture — otherwise speak() is silently dropped and
// neither onstart nor onend ever fires, which used to leave the session stuck
// in "Speaking…" with the mic disabled. If playback hasn't started within
// this window, give up on it and report that it didn't play.
const SPEAK_START_TIMEOUT_MS = 4000;

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
  const [micError, setMicError] = useState<string | null>(null);
  const supported = useSyncExternalStore(noopSubscribe, getSupportedSnapshot, getSupportedServerSnapshot);

  // Which voice and delivery style replies are spoken in — chosen on the
  // Voice settings page or the start page (lib/useVoiceSettings.ts).
  const { voiceURI, voiceStyle } = useVoiceSettings();

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalBufferRef = useRef("");
  const manualStopRef = useRef(false);
  const fatalErrorRef = useRef(false);
  const onFinalRef = useRef(onFinalTranscript);
  // Indirection so the transparent-restart case (below) can call the latest
  // spawnRecognition without referencing it by name inside its own
  // definition, which the compiler's exhaustive-deps analysis disallows.
  const spawnRecognitionRef = useRef<() => SpeechRecognitionLike | null>(() => null);

  useEffect(() => {
    onFinalRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

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
    // fatal — only a manual stop should end the turn, and onend decides
    // whether to restart or finalize. Fatal ones (FATAL_MIC_ERRORS) are
    // flagged so onend stops instead of restarting: previously a denied mic
    // restarted, failed, and restarted again forever with no message.
    recognition.onerror = (e) => {
      if (e.error && FATAL_MIC_ERRORS.has(e.error)) fatalErrorRef.current = true;
    };

    recognition.onend = () => {
      if (fatalErrorRef.current) {
        fatalErrorRef.current = false;
        manualStopRef.current = false;
        // Don't lose anything already heard before the failure — hand it
        // over for review like a normal finished turn.
        const transcript = finalBufferRef.current.trim();
        finalBufferRef.current = "";
        setInterimText("");
        recognitionRef.current = null;
        setMicError(MIC_ERROR_MESSAGE);
        if (transcript) onFinalRef.current(transcript);
        else setState("idle");
        return;
      }

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
    fatalErrorRef.current = false;
    setInterimText("");
    setMicError(null);

    const recognition = spawnRecognition();
    if (!recognition) return;

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setState("listening");
    } catch {
      recognitionRef.current = null;
      setMicError(MIC_ERROR_MESSAGE);
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

  /** Resolves true once the line finishes playing, false if it never started (see SPEAK_START_TIMEOUT_MS). */
  const speak = useCallback(
    (text: string): Promise<boolean> => {
      return new Promise((resolve) => {
        if (!("speechSynthesis" in window) || !text) {
          resolve(false);
          return;
        }
        window.speechSynthesis.cancel();
        const utterance = buildUtterance(text, voiceURI, voiceStyle);
        let started = false;
        let settled = false;
        const settle = (played: boolean) => {
          if (settled) return;
          settled = true;
          clearTimeout(watchdog);
          resolve(played);
        };
        const watchdog = setTimeout(() => {
          if (started) return;
          window.speechSynthesis.cancel();
          setState("idle");
          settle(false);
        }, SPEAK_START_TIMEOUT_MS);
        utterance.onstart = () => {
          started = true;
        };
        utterance.onend = () => settle(true);
        utterance.onerror = () => settle(started);
        setState("speaking");
        window.speechSynthesis.speak(utterance);
      });
    },
    [voiceURI, voiceStyle]
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

  return {
    state,
    setState,
    supported,
    interimText,
    micError,
    startListening,
    stopListening,
    speak,
  };
}
