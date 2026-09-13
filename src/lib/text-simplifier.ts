import { splitSentences } from "./sentences.ts";

export interface SimplificationResult {
  original: string;
  simplified: string;
  replacements: number;
  complexity: "easy" | "moderate" | "complex";
  originalGrade: number;
  simplifiedGrade: number;
}

const WORDS: Record<string, string> = {
  phenomenon: "event",
  phenomena: "events",
  cognitive: "mental",
  significant: "important",
  significantly: "greatly",
  friction: "difficulty",
  implications: "effects",
  implication: "effect",
  neurodivergent: "neurodivergent",
  manifestation: "sign",
  facilitate: "help",
  facilitates: "helps",
  facilitated: "helped",
  utilize: "use",
  utilizes: "uses",
  utilized: "used",
  utilizing: "using",
  demonstrate: "show",
  demonstrates: "shows",
  demonstrated: "showed",
  ameliorate: "improve",
  exacerbate: "worsen",
  arbitrary: "random",
  substantive: "real",
  meticulous: "careful",
  proficient: "skilled",
  ephemeral: "short-lived",
  ubiquitous: "common",
  aggregate: "total",
  culmination: "result",
  discrepancy: "gap",
  empirical: "observed",
  hypothesis: "theory",
  hypotheses: "theories",
  pervasive: "widespread",
  trajectory: "path",
  paradigm: "model",
  dichotomy: "split",
  ambiguous: "unclear",
  coherent: "clear",
  synthesis: "combination",
  comprehensive: "complete",
  constrain: "limit",
  constrained: "limited",
  propensity: "tendency",
  magnitude: "size",
  proliferate: "spread",
  recursive: "repeating",
  algorithm: "method",
  algorithms: "methods",
  transform: "change",
  transforms: "changes",
  dynamically: "as you go",
  graphemes: "letters",
  grapheme: "letter",
  optimize: "improve",
  optimizes: "improves",
  saccadic: "eye-jump",
  conventional: "usual",
  participants: "readers in the study",
  entropy: "clutter",
  orientation: "finding your place",
  retention: "holding on",
  populations: "groups",
  investigations: "studies",
  investigates: "looks at",
  investigate: "look at",
  subsequently: "later",
  approximately: "about",
  sufficient: "enough",
  insufficient: "not enough",
  nevertheless: "still",
  furthermore: "also",
  moreover: "also",
  therefore: "so",
  consequently: "as a result",
  regarding: "about",
  concerning: "about",
  numerous: "many",
  additional: "more",
  previously: "before",
  currently: "now",
  predominantly: "mostly",
  particularly: "especially",
  specifically: "in particular",
  fundamentally: "at root",
  essentially: "basically",
  relatively: "fairly",
  considerably: "a lot",
  enhances: "improves",
  acquire: "get",
  acquired: "got",
  acquirement: "getting",
  relocate: "move",
  relocations: "moves",
  relocation: "move",
  fixation: "pause on a word",
  fixations: "pauses on words",
  vocabulary: "words",
  intimidating: "daunting",
  intervention: "change",
  interventions: "changes",
  combination: "mix",
  straightforward: "simple",
  exhausting: "tiring",
  fatigue: "tiredness",
  comprehension: "understanding",
  accuracy: "how right it is",
  assumed: "took as true",
  distinction: "difference",
  limitations: "limits",
  literary: "story-like",
  argument: "point",
  environmental: "about the page",
  periphery: "edge",
  interferes: "gets in the way",
  aesthetic: "looks",
  preference: "choice",
  frequent: "often",
  undershoots: "lands short",
  overshoots: "lands past",
  correction: "fix",
  corrections: "fixes",
  mandate: "must-do",
  medication: "medicine",
  phonemes: "sounds",
  typography: "type",
  scanning: "looking",
  representing: "standing for",
  between: "between",
  emphasis: "weight",
  remainder: "rest",
  deterministic: "fixed",
  transformation: "change",
  intentionally: "on purpose",
  pipeline: "process",
  documentation: "document",
  recommendation: "suggestion",
  recommendations: "suggestions",
  structured: "ordered",
  module: "part",
  receives: "gets",
  metrics: "measures",
  remaining: "left",
};

const PHRASES: [RegExp, string][] = [
  [/\bin light of\b/gi, "because of"],
  [/\bin the context of\b/gi, "in"],
  [/\bwith respect to\b/gi, "about"],
  [/\bin order to\b/gi, "to"],
  [/\bin accordance with\b/gi, "following"],
  [/\bit is worth noting that\b/gi, "note that"],
  [/\bit is worth noting\b/gi, "note"],
  [/\bprior to\b/gi, "before"],
  [/\bsubsequent to\b/gi, "after"],
  [/\ba large number of\b/gi, "many"],
  [/\ba number of\b/gi, "some"],
  [/\bdue to the fact that\b/gi, "because"],
  [/\bin the event that\b/gi, "if"],
  [/\bhas the ability to\b/gi, "can"],
  [/\bin addition to\b/gi, "besides"],
  [/\bon the other hand\b/gi, "but"],
  [/\bas a result of\b/gi, "from"],
  [/\bthe majority of\b/gi, "most"],
  [/\bwith the exception of\b/gi, "except"],
  [/\bfor the purpose of\b/gi, "to"],
  [/\bin spite of\b/gi, "despite"],
];

function preserveCase(source: string, replacement: string): string {
  if (!source) return replacement;
  if (source === source.toUpperCase() && source.length > 1) return replacement.toUpperCase();
  if (source[0] === source[0]?.toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function gradeLevel(text: string): number {
  const sentences = splitSentences(text);
  const words = text.trim().split(/\s+/).filter(Boolean);
  const chars = text.replace(/\s/g, "").length;
  const sentenceCount = Math.max(1, sentences.length);
  const wordCount = Math.max(1, words.length);
  const averageSentenceLength = wordCount / sentenceCount;
  const averageWordLength = chars / wordCount;
  const grade = 0.39 * averageSentenceLength + 11.8 * (averageWordLength / 2.5) - 15.59;
  return Math.max(1, Math.min(18, Math.round(grade)));
}

function complexityOf(text: string): SimplificationResult["complexity"] {
  const hits = Object.keys(WORDS).filter((word) => new RegExp(`\\b${word}\\b`, "i").test(text)).length;
  const long = splitSentences(text).filter((sentence) => sentence.split(/\s+/).length > 24).length;
  if (hits >= 6 || long >= 3) return "complex";
  if (hits >= 2 || long >= 1) return "moderate";
  return "easy";
}

export function swapPlainWord(word: string): { next: string; original: string | null } {
  const simple = WORDS[word.toLowerCase()];
  if (!simple || simple.toLowerCase() === word.toLowerCase()) return { next: word, original: null };
  return { next: preserveCase(word, simple), original: word };
}

export function applyPlainPhrases(text: string): { text: string; count: number } {
  let next = text;
  let count = 0;
  for (const [pattern, simple] of PHRASES) {
    next = next.replace(pattern, () => {
      count += 1;
      return simple;
    });
  }
  return { text: next, count };
}

function simplifyPhrases(text: string): { text: string; count: number } {
  return applyPlainPhrases(text);
}

function simplifyWords(text: string): { text: string; count: number } {
  let count = 0;
  const next = text.replace(/[\p{L}']+(?:-[\p{L}']+)*/gu, (word) => {
    if (word.includes("-")) return word;
    const swapped = swapPlainWord(word);
    if (!swapped.original) return word;
    count += 1;
    return swapped.next;
  });
  return { text: next, count };
}

/** Live reading swap: phrases + words, keep sentence shape. */
export function applyPlainLanguage(text: string): string {
  const phrases = applyPlainPhrases(text);
  return simplifyWords(phrases.text).text;
}

function shortenSentences(text: string): string {
  return splitSentences(text)
    .map((sentence) => {
      const words = sentence.split(/\s+/);
      if (words.length <= 22) return sentence;
      const parts = sentence.split(/,\s+(?=(?:and|but|which|while|although|because)\b)/i);
      if (parts.length < 2) return sentence;
      return parts
        .map((part, index) => {
          const trimmed = part.trim().replace(/[.!?]+$/, "");
          if (!trimmed) return "";
          const capped = index === 0 ? trimmed : trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
          return `${capped}.`;
        })
        .filter(Boolean)
        .join(" ");
    })
    .join(" ");
}

export function simplifyText(originalText: string): SimplificationResult {
  if (!originalText.trim()) {
    return {
      original: originalText,
      simplified: originalText,
      replacements: 0,
      complexity: "easy",
      originalGrade: 1,
      simplifiedGrade: 1,
    };
  }

  const phrases = simplifyPhrases(originalText);
  const words = simplifyWords(phrases.text);
  const simplified = shortenSentences(words.text).replace(/\s+/g, " ").trim();

  return {
    original: originalText,
    simplified,
    replacements: phrases.count + words.count,
    complexity: complexityOf(originalText),
    originalGrade: gradeLevel(originalText),
    simplifiedGrade: gradeLevel(simplified),
  };
}
