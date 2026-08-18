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
