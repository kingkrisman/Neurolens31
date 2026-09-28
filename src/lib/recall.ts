import { splitSentences } from "./sentences.ts";

/**
 * Recall cards: two quick questions at the end of a chapter.
 *
 * Built to be fun and to be *fair*, in that order of visibility and the
 * reverse order of importance. The older "Check understanding" questions
 * offered three sentences that had all appeared in the passage and asked
 * which one had — every answer was right, so the score meant nothing. Each
 * question here has exactly one right answer that the text itself proves:
 *
 *  - **Was it here?** One sentence from this chapter, two from the chapters
 *    either side. Same book, same voice, so the others are plausible — but
 *    only one was in what was just read.
 *  - **Which came first?** Two sentences from this chapter, in shuffled order.
 *    Order is the part of a story that slips first, and it is unambiguous.
 *
 * No AI, no network: sentences from the book, chosen deterministically, so the
 * same chapter always asks the same card and nothing leaves the device.
 */

export type RecallKind = "was-here" | "came-first";

export interface RecallQuestion {
  id: string;
  kind: RecallKind;
  prompt: string;
  options: string[];
  answerIndex: number;
}

const MIN_WORDS = 7;
const MAX_WORDS = 34;
const MAX_CHARS = 150;

function wordCount(sentence: string): number {
  return sentence.trim().split(/\s+/).filter(Boolean).length;
}

/** Sentences that make a fair option: whole thoughts, not fragments or walls. */
export function usableSentences(text: string): string[] {
  return splitSentences(text)
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter((sentence) => {
      const words = wordCount(sentence);
      return words >= MIN_WORDS && words <= MAX_WORDS && /[a-z]/i.test(sentence);
    });
}

function clip(sentence: string): string {
  if (sentence.length <= MAX_CHARS) return sentence;
  return `${sentence.slice(0, MAX_CHARS).replace(/\s+\S*$/, "")}…`;
}

/** A small, stable hash, so a chapter always gets the same card. */
export function seedOf(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function random(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], rand: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/** A pick from the middle of a list, where the chapter's substance is. */
function pickBetween<T>(items: T[], from: number, to: number, rand: () => number): T | null {
  if (!items.length) return null;
  const lo = Math.floor(items.length * from);
  const hi = Math.max(lo + 1, Math.ceil(items.length * to));
  return items[Math.min(items.length - 1, lo + Math.floor(rand() * (hi - lo)))] ?? null;
}

/**
 * The card for one section.
 *
 * `others` are the neighbouring sections' texts, nearest first — distractors
 * from the chapter just before or after sound most like this one. Returns
 * whatever questions the text can support fairly, possibly none: a title page
 * or a two-line section gets no card rather than a bad one.
 */
export function buildRecallCard(
  section: string,
  others: string[],
  sectionWord = "chapter",
): RecallQuestion[] {
  const own = usableSentences(section);
  if (own.length < 4) return [];
  const rand = random(seedOf(section));
  const questions: RecallQuestion[] = [];

  // Was it here? Distractors must not appear anywhere in this section, not
  // merely be absent from the usable list — a repeated line would make two
  // answers right.
  const flat = section.replace(/\s+/g, " ");
  const foreign = others
    .flatMap((text) => usableSentences(text))
    .filter((sentence) => !flat.includes(sentence));
  const truth = pickBetween(own, 0.35, 0.75, rand);
  if (truth && foreign.length >= 2) {
    const near = foreign.slice(0, Math.max(6, Math.ceil(foreign.length / 3)));
    const decoys = shuffled(near, rand).slice(0, 2);
    const options = shuffled([truth, ...decoys].map(clip), rand);
    const answer = clip(truth);
    if (new Set(options).size === options.length) {
      questions.push({
        id: `was-here-${seedOf(truth)}`,
        kind: "was-here",
        prompt: `Which of these was in this ${sectionWord}?`,
        options,
        answerIndex: options.indexOf(answer),
      });
    }
  }

  // Which came first? One from the first part, one from the last, so the
  // answer is about the arc of the chapter rather than two adjacent lines.
  const early = pickBetween(own, 0.1, 0.4, rand);
  const late = pickBetween(own, 0.6, 0.95, rand);
  if (early && late && early !== late) {
    const pair = [clip(early), clip(late)];
    if (pair[0] !== pair[1]) {
      const options = shuffled(pair, rand);
      questions.push({
        id: `came-first-${seedOf(early)}`,
        kind: "came-first",
        prompt: "Which came first?",
        options,
        answerIndex: options.indexOf(pair[0]!),
      });
    }
  }

  return questions;
}

/** How a card went, said kindly. Nothing here reads as a mark out of ten. */
export function recallVerdict(right: number, asked: number): string {
  if (asked === 0) return "";
  if (right === asked) return asked === 1 ? "Held on to it." : "Held on to both.";
  if (right === 0) return "Slipped away this time — that happens. It is still on the page.";
  return `Held on to ${right} of ${asked}. The other is still on the page if you want it.`;
}
