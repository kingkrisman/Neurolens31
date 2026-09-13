import { splitSentenceSpans } from "./sentences.ts";

const FILLER = new Set([
  "the", "and", "of", "in", "is", "to", "a", "it", "for", "with", "on", "as", "at", "by", "an", "be",
  "this", "that", "or", "are", "was", "were", "been", "have", "has", "had", "do", "does", "did", "will",
  "would", "could", "should", "may", "might", "must", "can", "from", "into", "about", "during", "before",
  "after", "above", "below", "up", "down", "out", "off", "over", "under", "again", "further", "then",
  "than", "which", "who", "what", "when", "where", "why", "how", "all", "each", "every", "both", "few",
  "more", "most", "no", "nor", "not", "only", "same", "so", "some", "such", "too", "very", "just", "am",
  "my", "me",
]);

const ACTION = new Set([
  "said", "says", "told", "tell", "ask", "asked", "show", "showed", "give", "gave", "make", "made",
  "take", "took", "come", "came", "go", "went", "get", "got", "think", "thought", "know", "knew",
  "see", "saw", "want", "wanted", "use", "used", "find", "found", "work", "worked", "try", "tried",
  "help", "helped", "call", "called", "need", "needed", "feel", "felt", "become", "leave", "left",
  "put", "start", "started", "seem", "seemed", "turn", "turned", "move", "live", "lived", "believe",
  "believed", "hold", "held", "bring", "brought", "begin", "began",
]);

export const FIXATION_PRESETS = [
  { id: "off", value: 0, label: "Off", hint: "Plain type" },
  { id: "light", value: 0.25, label: "Light", hint: "Landing letters" },
  { id: "medium", value: 0.45, label: "Medium", hint: "First syllable" },
  { id: "strong", value: 0.65, label: "Strong", hint: "Half the word" },
  { id: "max", value: 0.8, label: "Max", hint: "Most of the stem" },
] as const;

export type FixationPresetId = (typeof FIXATION_PRESETS)[number]["id"];

/**
 * How many leading letters to mark. Classic bionic reading bolds the saccade
 * landing zone — roughly the first 30–50% of a word — so the eye can skip
 * the rest. Function words get a lighter mark; verbs and long stems get more.
 */
export function fixationLength(word: string, strength: number, importance = 0.6): number {
  const core = word.replace(/[^A-Za-z]/g, "");
  const len = core.length;
  if (strength <= 0 || len < 2) return 0;
  const ratio = 0.28 + strength * 0.34;
  const weighted = ratio * (0.7 + 0.3 * Math.min(1, Math.max(0.15, importance)));
  let count = Math.round(len * weighted);
  if (len <= 3) count = strength >= 0.18 ? 1 : 0;
  else if (count < 1) count = 1;
  return Math.min(count, len - 1);
}

export function nearestFixationPreset(value: number): (typeof FIXATION_PRESETS)[number] {
  return FIXATION_PRESETS.reduce((best, preset) =>
    Math.abs(preset.value - value) < Math.abs(best.value - value) ? preset : best,
  );
}

export function processBionicText(
  text: string,
  strength = 0.5,
  rhythmOverride = false,
): string {
  if (!text || strength <= 0) return text;

  const sentences = splitSentenceSpans(text);

  return sentences
    .map((sentence) => {
      const parts = sentence.split(/(\s+)/);
      let wordInSentence = 0;

      return parts
        .map((part) => {
          if (/^\s+$/.test(part)) return part;

          const match = part.match(/^([^a-zA-Z0-9]*)([a-zA-Z0-9']+)([^a-zA-Z0-9]*)$/);
          if (!match) return part;

          const [, prefix, word, suffix] = match;
          const lowerWord = word.toLowerCase();
          const len = word.length;
          wordInSentence += 1;

          let importance = 0.55;
          if (FILLER.has(lowerWord)) importance = 0.28;
          else if (ACTION.has(lowerWord)) importance = 1;
          else if (len >= 8) importance = 0.9;
          else if (len >= 5) importance = 0.72;

          const positionBoost = rhythmOverride && wordInSentence <= 2 ? 1.12 : 1;
          const boldLength = fixationLength(word, strength * positionBoost, importance);
          if (boldLength <= 0) return part;

          return `${prefix}<span class="fixation">${word.slice(0, boldLength)}</span>${word.slice(boldLength)}${suffix}`;
        })
        .join("");
    })
    .join("");
}

/** Strip fixation markup so assistive tech hears the original word, not “T he”. */
export function plainTextFromBionic(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}
