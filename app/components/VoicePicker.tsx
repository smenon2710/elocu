"use client";

/**
 * Lets the user pick which browser TTS voice AI replies are spoken in — the
 * one part of the app still using whatever default voice happened to be
 * lying around (lib/useSpeech.ts's `speak()` used to construct a plain
 * SpeechSynthesisUtterance with no voice set at all). Persisted in
 * localStorage (lib/useSpeech.ts), not the session store — it's a
 * device/browser preference, not app data.
 */
export function VoicePicker({
  voices,
  voiceURI,
  onChange,
}: {
  voices: SpeechSynthesisVoice[];
  voiceURI: string | null;
  onChange: (uri: string) => void;
}) {
  if (voices.length === 0) return null;

  // English voices first (the app only ever generates English text), then
  // everything else, alphabetical within each group — a typical browser
  // exposes a dozen-plus system/language voices, most irrelevant here.
  const sorted = [...voices].sort((a, b) => {
    const aEn = a.lang.toLowerCase().startsWith("en") ? 0 : 1;
    const bEn = b.lang.toLowerCase().startsWith("en") ? 0 : 1;
    if (aEn !== bEn) return aEn - bEn;
    return a.name.localeCompare(b.name);
  });

  return (
    <label className="flex items-center gap-2 font-mono text-xs text-parchment-500">
      Voice
      <select
        value={voiceURI ?? sorted[0]?.voiceURI ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-full border border-hairline bg-ink-800 px-3 py-1 text-parchment-300 outline-none focus:border-ember-500"
      >
        {sorted.map((v) => (
          <option key={v.voiceURI} value={v.voiceURI}>
            {v.name}
            {v.lang.toLowerCase().startsWith("en") ? "" : ` (${v.lang})`}
          </option>
        ))}
      </select>
    </label>
  );
}
