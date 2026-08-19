/**
 * The Web Speech API's `SpeechSynthesisVoice` exposes no gender or
 * personality metadata at all — just `.name`, `.lang`, `.localService`,
 * `.default`. There is no honest way to algorithmically detect that a fixed
 * system voice "sounds bossy" or "sounds harsh"; that's a subjective
 * perceptual quality with no field to query for it. Two different, both
 * real, answers to the request for voice character:
 *
 * 1. Gender — a best-effort *guess* from the voice's name (most standard
 *    macOS/iOS, Chrome/Google, and Windows/Edge system voices use a human
 *    first name that conventionally reads as one gender), not a ground-truth
 *    classification. Anything unrecognized lands in "unspecified" rather
 *    than a wrong guess.
 * 2. Delivery style — not a classification of the existing voices at all,
 *    but adjustable pitch/rate presets applied on top of whichever voice is
 *    picked (SpeechSynthesisUtterance.pitch/.rate are the only real,
 *    controllable levers the API exposes for vocal character). "Soft",
 *    "persuasive", "harsh", "bossy" are simple pitch/rate heuristics here,
 *    not a validated psychoacoustic model — reasonable engineering
 *    approximations, unlike e.g. the WPM guidance elsewhere in this app,
 *    which is genuinely research-backed.
 */

// A real, reported bug traced to this: the Web Speech API exposes every
// voice the OS happens to have installed, which on macOS includes a long
// tail of "novelty"/effect voices bundled under System Settings > Spoken
// Content > Customize (Zarvox, Bubbles, Deranged, Bells, Pipe Organ,
// Trinoids, Whisper, and similar) that are pitch/effect gags, not natural
// speaking voices — one of these is the most likely explanation for a
// session starting in a "blabbering" voice, since with every OS voice
// listed and no curation, nothing stopped one from being selected (by a
// stray click, or a stale localStorage value from before this list
// existed) and then persisting across every future session and mode.
// Separately, and independently requested directly: fewer choices, not a
// wall of ~180 system voices. Curating down to a small, cross-platform set
// of known-good, natural-sounding voices solves both — the picker only
// ever offers these, and (see lib/useSpeech.ts's speak()) a voice outside
// this set can never actually be used to speak, even if an old bad
// voiceURI is still sitting in localStorage.
const CURATED_VOICE_NAMES = [
  "samantha", // macOS, female, flagship US voice
  "alex", // macOS, male, flagship US voice
  "karen", // macOS, female, Australian accent
  "daniel", // macOS, male, British accent
  "microsoft zira", // Windows, female
  "microsoft david", // Windows, male
  "google uk english female",
  "google uk english male",
];

/** Whether a voice is in the small curated set — see the note above. */
export function isCuratedVoice(voice: SpeechSynthesisVoice): boolean {
  const lower = voice.name.toLowerCase();
  return CURATED_VOICE_NAMES.some((name) => lower.includes(name));
}

export type VoiceGender = "female" | "male" | "unspecified";

const FEMALE_NAMES = new Set([
  "samantha", "victoria", "karen", "moira", "tessa", "fiona", "kate", "serena",
  "susan", "allison", "ava", "nicky", "zoe", "zira", "hazel", "catherine",
  "amelia", "salli", "joanna", "kimberly", "ivy", "kendra", "emma", "aria",
  "jenny", "michelle", "libby", "olivia", "mia", "sonia", "shelley", "anna",
  "elsa", "laura", "lucia", "sabina", "paulina", "carmit", "milena", "ellen",
  "nora", "alva", "alice", "ioana", "zosia", "kyoko", "sin-ji", "mei-jia",
  "ting-ting", "yuna", "sora", "veena", "rishika", "damayanti", "kanya",
  "amira", "layla", "yelda", "flo", "june", "kathy", "linda", "princess",
  "vicki", "candy", "sandy", "melina", "satu", "ellen",
]);

const MALE_NAMES = new Set([
  "alex", "daniel", "fred", "albert", "bruce", "ralph", "arthur", "aaron",
  "gordon", "jamie", "nathan", "oliver", "rishi", "tom", "matthew", "justin",
  "joey", "kevin", "eric", "guy", "brian", "david", "mark", "roger", "sean",
  "diego", "jorge", "carlos", "luca", "xander", "junior", "reed", "rocko",
  "eddy", "jacques", "thomas", "yuri", "felix", "lee", "henrik", "rocko",
]);

/** Best-effort only — see the module-level note above. Never used for anything beyond grouping the picker's option list. */
export function guessVoiceGender(voice: SpeechSynthesisVoice): VoiceGender {
  const lowerName = voice.name.toLowerCase();
  if (/\bfemale\b/.test(lowerName)) return "female";
  if (/\bmale\b/.test(lowerName)) return "male";

  // Names typically appear as "Samantha", "Google UK English Female", or
  // "Microsoft Zira - English (United States)" — check each word rather
  // than requiring an exact full-string match.
  const words = lowerName.replace(/[()-]/g, " ").split(/\s+/).filter(Boolean);
  if (words.some((w) => FEMALE_NAMES.has(w))) return "female";
  if (words.some((w) => MALE_NAMES.has(w))) return "male";
  return "unspecified";
}

export type VoiceStyleKey = "neutral" | "soft" | "persuasive" | "harsh" | "bossy";

export interface VoiceStyleOption {
  key: VoiceStyleKey;
  label: string;
  description: string;
  pitch: number; // SpeechSynthesisUtterance.pitch — 0 to 2, default 1
  rate: number; // SpeechSynthesisUtterance.rate — 0.1 to 10, default 1
}

export const VOICE_STYLES: VoiceStyleOption[] = [
  { key: "neutral", label: "Neutral", description: "The voice's own default delivery.", pitch: 1, rate: 1 },
  { key: "soft", label: "Soft", description: "Gentler and a touch slower.", pitch: 1.08, rate: 0.92 },
  {
    key: "persuasive",
    label: "Persuasive",
    description: "Measured pace, a slightly warmer register.",
    pitch: 0.97,
    rate: 1,
  },
  { key: "harsh", label: "Harsh", description: "Lower and more clipped, a faster pace.", pitch: 0.75, rate: 1.12 },
  { key: "bossy", label: "Bossy", description: "Brisk and commanding.", pitch: 0.85, rate: 1.2 },
];

export function getVoiceStyle(key: VoiceStyleKey): VoiceStyleOption {
  return VOICE_STYLES.find((s) => s.key === key) ?? VOICE_STYLES[0];
}
