import { isSentenceBoundary } from "./sentences.ts";
import type { RhythmCurve } from "./types.ts";

/** Extra dwell at sentence ends vs. a steady tick. */
const SENTENCE_REST = 1.85;
/** Extra dwell at commas / dashes when breathing. */
const CLAUSE_REST = 1.38;
/** Floor so a rest never stalls auto-scroll. */
const MIN_PACE = 0.42;

export function resolveRhythmCurve(curve: RhythmCurve | undefined, optimization: boolean): RhythmCurve {
  if (curve === "steady" || curve === "sentence" || curve === "breath") return curve;
  return optimization ? "sentence" : "steady";
}

export function isSentenceRest(token: string, next = ""): boolean {
  return isSentenceBoundary(token, next);
}

export function isClauseRest(token: string): boolean {
  return /[,;:—–]["'”’)]*$/.test(token.trim());
}

/** How much slower than target this token should be (1 = target). */
export function paceMultiplier(token: string, curve: RhythmCurve, next = ""): number {
  if (curve === "steady") return 1;
  if (isSentenceRest(token, next)) return 1 / SENTENCE_REST;
  if (curve === "breath" && isClauseRest(token)) return 1 / CLAUSE_REST;
  return 1;
}

export function rsvpDelayMs(token: string, wpm: number, curve: RhythmCurve, next = ""): number {
  const base = (60 / Math.max(80, wpm)) * 1000;
  const pace = paceMultiplier(token, curve, next);
  return Math.round(base / Math.max(MIN_PACE, pace));
}

/** Spritz-style optimal recognition point inside a token. */
export function orpIndex(word: string): number {
  const n = word.length;
  if (n <= 1) return 0;
  if (n <= 3) return 0;
  if (n <= 5) return 1;
  if (n <= 9) return 2;
  if (n <= 13) return 3;
  return 4;
}

export function splitOrp(word: string): { before: string; orp: string; after: string } {
  if (!word) return { before: "", orp: "", after: "" };
  const index = Math.min(word.length - 1, orpIndex(word));
  return {
    before: word.slice(0, index),
    orp: word[index] ?? "",
    after: word.slice(index + 1),
  };
}

/** Pixels to advance this frame so remaining distance maps onto remaining words at target WPM. */
export function autoScrollDeltaPx(opts: {
  remainingPx: number;
  remainingWords: number;
  targetWpm: number;
  dtSec: number;
  focusToken: string;
  nextToken?: string;
  curve: RhythmCurve;
}): number {
  const { remainingPx, remainingWords, targetWpm, dtSec, focusToken, nextToken = "", curve } = opts;
  if (remainingPx <= 0 || remainingWords <= 0) return 0;
  const pxPerSec = (remainingPx / remainingWords) * (targetWpm / 60);
  return pxPerSec * paceMultiplier(focusToken, curve, nextToken) * dtSec;
}

export function tokenAtProgress(words: string[], progress: number): string {
  if (words.length === 0) return "";
  const index = Math.min(words.length - 1, Math.max(0, Math.floor(progress * words.length)));
  return words[index] ?? "";
}

export function tokenContextAtProgress(words: string[], progress: number): { token: string; next: string; index: number } {
  if (words.length === 0) return { token: "", next: "", index: 0 };
  const index = Math.min(words.length - 1, Math.max(0, Math.floor(progress * words.length)));
  return { token: words[index] ?? "", next: words[index + 1] ?? "", index };
}
