"use client";

import { guessVoiceGender, isCuratedVoice, VOICE_STYLES, type VoiceStyleKey } from "@/lib/voiceCategories";

/**
 * Lets the user pick which browser TTS voice AI replies are spoken in, and
 * a delivery-style preset on top of it — the one part of the app still
 * using whatever default voice happened to be lying around before this
 * (lib/useSpeech.ts's `speak()` used to construct a plain
 * SpeechSynthesisUtterance with no voice or style set at all). Persisted in
 * localStorage (lib/useSpeech.ts), not the session store — a device
 * preference, not app data.
 *
 * The voice list is grouped by a best-effort gender guess (see
 * lib/voiceCategories.ts — the Web Speech API exposes no such field, this
 * is inferred from the voice's name) since the API gives no other real axis
 * to group fixed voices by. "Soft/persuasive/harsh/bossy" aren't a
 * classification of the *existing* voices at all — no field exists for
 * that — they're adjustable pitch/rate presets layered on top of whichever
 * voice is picked, the only real controllable lever for vocal character
 * SpeechSynthesisUtterance offers.
 */
export function VoicePicker({
  voices,
  voiceURI,
  onVoiceChange,
  voiceStyle,
  onStyleChange,
}: {
  voices: SpeechSynthesisVoice[];
  voiceURI: string | null;
  onVoiceChange: (uri: string) => void;
  voiceStyle: VoiceStyleKey;
  onStyleChange: (style: VoiceStyleKey) => void;
}) {
  if (voices.length === 0) return null;

  // Only ever offer the small curated set (lib/voiceCategories.ts) — falls
  // back to the full raw list on a system where none of them happen to be
  // installed, so the picker still works rather than showing nothing.
  const curated = voices.filter(isCuratedVoice);
  const effectiveVoices = curated.length > 0 ? curated : voices;

  const byGender = { female: [] as SpeechSynthesisVoice[], male: [] as SpeechSynthesisVoice[], unspecified: [] as SpeechSynthesisVoice[] };
  for (const v of effectiveVoices) byGender[guessVoiceGender(v)].push(v);

  const sortGroup = (group: SpeechSynthesisVoice[]) =>
    [...group].sort((a, b) => {
      const aEn = a.lang.toLowerCase().startsWith("en") ? 0 : 1;
      const bEn = b.lang.toLowerCase().startsWith("en") ? 0 : 1;
      if (aEn !== bEn) return aEn - bEn;
      return a.name.localeCompare(b.name);
    });

  const groups: { label: string; voices: SpeechSynthesisVoice[] }[] = [
    { label: "Female voices", voices: sortGroup(byGender.female) },
    { label: "Male voices", voices: sortGroup(byGender.male) },
    { label: "Other voices", voices: sortGroup(byGender.unspecified) },
  ].filter((g) => g.voices.length > 0);

  const firstVoiceURI = groups[0]?.voices[0]?.voiceURI ?? "";

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
      <label className="flex items-center gap-2 font-mono text-xs text-parchment-500">
        Voice
        <select
          value={voiceURI ?? firstVoiceURI}
          onChange={(e) => onVoiceChange(e.target.value)}
          className="rounded-full border border-hairline bg-ink-800 px-3 py-1 text-parchment-300 outline-none focus:border-ember-500"
        >
          {groups.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name}
                  {v.lang.toLowerCase().startsWith("en") ? "" : ` (${v.lang})`}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-1.5">
        <span className="font-mono text-xs text-parchment-500">Style</span>
        {VOICE_STYLES.map((style) => (
          <button
            key={style.key}
            type="button"
            onClick={() => onStyleChange(style.key)}
            title={style.description}
            aria-pressed={voiceStyle === style.key}
            className={`rounded-full border px-2.5 py-1 font-mono text-xs transition ${
              voiceStyle === style.key
                ? "border-ember-500 bg-ember-500/10 text-ember-400"
                : "border-hairline text-parchment-500 hover:border-verdigris-500/50"
            }`}
          >
            {style.label}
          </button>
        ))}
      </div>
    </div>
  );
}
