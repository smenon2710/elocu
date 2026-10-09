"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { buildUtterance, useVoiceSettings } from "@/lib/useVoiceSettings";
import { groupSelectableVoices, VOICE_STYLES, type VoiceStyleKey } from "@/lib/voiceCategories";

// What every sample says — an opening an opponent might actually give, so
// the sample is heard doing the job the voice will do in a session.
const noopSubscribe = () => () => {};
const getCanSpeak = () => "speechSynthesis" in window;
// Assume it can during the server render, so the page doesn't flash a
// "can't speak" notice before the browser has been asked.
const getCanSpeakOnServer = () => true;

const SAMPLE_LINE = "I'll take the other side of that. Here's my first objection — tell me where I'm wrong.";

/**
 * Voice settings, chosen up front rather than mid-session: who the AI sounds
 * like (a female or male voice from the small curated set — see
 * lib/voiceCategories.ts) and how it delivers (the pitch/rate presets), each
 * with a sample played in exactly the combination a session would use.
 * Choosing something plays it. Saved to this device (lib/useVoiceSettings.ts).
 * This page and the start page's Female / Male choice are the only places
 * the voice is set — the session page has no picker.
 */
export default function VoiceSettingsPage() {
  const { voices, voiceURI, setVoiceURI, voiceStyle, setVoiceStyle } = useVoiceSettings();
  // Which sample is playing, as "voice:<uri>" or "style:<key>" — drives the
  // button label so it's clear what's being heard.
  const [playing, setPlaying] = useState<string | null>(null);
  const canSpeak = useSyncExternalStore(noopSubscribe, getCanSpeak, getCanSpeakOnServer);

  // Don't let a sample keep talking after leaving the page.
  useEffect(() => {
    return () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  const groups = groupSelectableVoices(voices);
  const allVoices = groups.flatMap((g) => g.voices);
  // With nothing saved (or a saved voice this device doesn't have), replies
  // use the browser's default voice — shown as its own option, not as a
  // pre-selected voice the user never picked.
  const selectedURI = allVoices.some((v) => v.voiceURI === voiceURI) ? voiceURI : null;

  function playSample(id: string, uri: string | null, style: VoiceStyleKey) {
    window.speechSynthesis.cancel();
    const utterance = buildUtterance(SAMPLE_LINE, uri, style);
    const done = () => setPlaying((p) => (p === id ? null : p));
    utterance.onend = done;
    utterance.onerror = done;
    setPlaying(id);
    window.speechSynthesis.speak(utterance);
  }

  function chooseVoice(uri: string | null) {
    setVoiceURI(uri);
    playSample(`voice:${uri ?? ""}`, uri, voiceStyle);
  }

  function chooseStyle(style: VoiceStyleKey) {
    setVoiceStyle(style);
    playSample(`style:${style}`, selectedURI, style);
  }

  const cardClass = (selected: boolean) =>
    `flex w-full items-center justify-between gap-3 rounded-xl border p-4 text-left transition ${
      selected ? "border-ember-500 bg-ember-500/10" : "border-hairline bg-ink-800 hover:border-verdigris-500/50"
    }`;

  const sampleHint = (id: string) => (
    <span className="shrink-0 font-mono text-[11px] tracking-wide text-parchment-500 uppercase">
      {playing === id ? "Playing…" : "▶ Sample"}
    </span>
  );

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-14">
      <p className="font-mono text-xs tracking-[0.25em] text-verdigris-400 uppercase">Voice settings</p>
      <h1 className="mt-4 font-display text-3xl text-parchment-100">Who are you talking to?</h1>
      <p className="mt-2 text-parchment-500">
        Pick the voice and delivery the AI uses in every session. Choosing an option plays a sample; your choice is
        saved on this device.
      </p>

      {!canSpeak ? (
        <p className="mt-8 text-sm text-gold-500">
          This browser can&apos;t speak replies aloud, so there are no voices to choose — sessions still work in text.
        </p>
      ) : voices.length === 0 ? (
        <p className="mt-8 font-mono text-sm text-parchment-500">Loading voices…</p>
      ) : (
        <>
          <section className="mt-10" aria-labelledby="voice-heading">
            <h2 id="voice-heading" className="font-display text-xl text-parchment-100">
              Voice
            </h2>
            {groups.map((group) => (
              <div key={group.gender} className="mt-4">
                <p className="font-mono text-xs tracking-wide text-parchment-500 uppercase">{group.label}</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  {group.voices.map((v) => {
                    const selected = selectedURI === v.voiceURI;
                    return (
                      <button
                        key={v.voiceURI}
                        type="button"
                        onClick={() => chooseVoice(v.voiceURI)}
                        aria-pressed={selected}
                        className={cardClass(selected)}
                      >
                        <span>
                          <span className={`font-display text-lg ${selected ? "text-ember-400" : "text-parchment-100"}`}>
                            {v.name}
                          </span>
                          <span className="mt-0.5 block font-mono text-xs text-parchment-500">{v.lang}</span>
                        </span>
                        {sampleHint(`voice:${v.voiceURI}`)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="mt-4">
              <button
                type="button"
                onClick={() => chooseVoice(null)}
                aria-pressed={selectedURI === null}
                className={`${cardClass(selectedURI === null)} sm:max-w-[calc(50%-0.375rem)]`}
              >
                <span>
                  <span
                    className={`font-display text-lg ${selectedURI === null ? "text-ember-400" : "text-parchment-100"}`}
                  >
                    Browser default
                  </span>
                  <span className="mt-0.5 block font-mono text-xs text-parchment-500">Whatever this device uses</span>
                </span>
                {sampleHint("voice:")}
              </button>
            </div>
          </section>

          <section className="mt-10" aria-labelledby="style-heading">
            <h2 id="style-heading" className="font-display text-xl text-parchment-100">
              Delivery style
            </h2>
            <p className="mt-1 text-sm text-parchment-500">
              Pitch and pace applied on top of the voice — it changes how the voice sounds, not what the AI says.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {VOICE_STYLES.map((style) => {
                const selected = voiceStyle === style.key;
                return (
                  <button
                    key={style.key}
                    type="button"
                    onClick={() => chooseStyle(style.key)}
                    aria-pressed={selected}
                    className={cardClass(selected)}
                  >
                    <span>
                      <span className={`font-display text-lg ${selected ? "text-ember-400" : "text-parchment-100"}`}>
                        {style.label}
                      </span>
                      <span className="mt-0.5 block text-sm text-parchment-500">{style.description}</span>
                    </span>
                    {sampleHint(`style:${style.key}`)}
                  </button>
                );
              })}
            </div>
          </section>
        </>
      )}

      <Link
        href="/app"
        className="mt-10 inline-block rounded-full bg-ember-500 px-6 py-3 font-medium text-ink-950 transition hover:bg-ember-400"
      >
        Start a session →
      </Link>
    </main>
  );
}
