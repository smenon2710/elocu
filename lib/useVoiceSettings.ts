"use client";

import { useCallback, useEffect, useState } from "react";
import { getVoiceStyle, selectableVoices, type VoiceStyleKey } from "./voiceCategories";

// Which TTS voice (and delivery style) to speak AI replies in — a
// device/browser preference, not app data, so it lives in localStorage
// rather than the session store.
const VOICE_STORAGE_KEY = "elocu-voice-uri";
const VOICE_STYLE_STORAGE_KEY = "elocu-voice-style";

/**
 * The voice + delivery-style preference, and the browser's voice list. One
 * hook behind every place that reads or changes it — the session page (via
 * lib/useSpeech.ts), the Voice settings page, and the start page — so a
 * choice made up front is the one the session speaks in.
 *
 * `voices` is empty on the server and until the browser reports its list, so
 * anything that renders the stored choice should wait for it (the stored
 * values are read from localStorage on the client only).
 */
export function useVoiceSettings() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  // Lazy initializers (not an effect) since localStorage is a synchronous
  // read — callers render nothing that depends on these before `voices`
  // itself populates post-hydration, so there's no server/client mismatch.
  const [voiceURI, setVoiceURIState] = useState<string | null>(() =>
    typeof window === "undefined" ? null : localStorage.getItem(VOICE_STORAGE_KEY)
  );
  const [voiceStyle, setVoiceStyleState] = useState<VoiceStyleKey>(() => {
    if (typeof window === "undefined") return "neutral";
    return (localStorage.getItem(VOICE_STYLE_STORAGE_KEY) as VoiceStyleKey | null) ?? "neutral";
  });

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

  const setVoiceStyle = useCallback((style: VoiceStyleKey) => {
    setVoiceStyleState(style);
    if (typeof window === "undefined") return;
    localStorage.setItem(VOICE_STYLE_STORAGE_KEY, style);
  }, []);

  return { voices, voiceURI, setVoiceURI, voiceStyle, setVoiceStyle };
}

/**
 * An utterance in the given voice and delivery style — the one place a
 * preference becomes actual speech, used for real replies and for samples
 * alike so a sample can't sound different from the session.
 */
export function buildUtterance(text: string, voiceURI: string | null, voiceStyle: VoiceStyleKey): SpeechSynthesisUtterance {
  const utterance = new SpeechSynthesisUtterance(text);
  if (voiceURI) {
    // Only ever matches within the selectable set (lib/voiceCategories.ts)
    // — a stale voiceURI pointing at a novelty/effect voice (or one no
    // longer installed) simply won't match here, so it can never actually
    // be spoken, even if it's still sitting in localStorage from before
    // curation existed. Falls through to the browser's own default voice in
    // that case, not an explicit request for whatever the bad voice was.
    const match = selectableVoices(window.speechSynthesis.getVoices()).find((v) => v.voiceURI === voiceURI);
    if (match) utterance.voice = match;
  }
  const style = getVoiceStyle(voiceStyle);
  utterance.pitch = style.pitch;
  utterance.rate = style.rate;
  return utterance;
}
