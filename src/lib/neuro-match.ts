/**
 * Scoring a sentence against what Neuro can do.
 *
 * The first version of this matched fixed patterns, which meant it understood
 * "reduce the fixation" and not "can you make the bold bit less please" — the
 * same request, phrased the way people actually phrase things. Rules like that
 * fail in a particularly annoying way: they work in the demo and fall over on
 * the first real sentence.
 *
 * So the input is scored instead of matched. Every topic carries a vocabulary,
 * the sentence is tokenised and weighed against each one, and the best-scoring
 * topic wins if it clears a floor. Direction — more, less, off — is read
 * separately, because "bigger text" and "smaller text" are one topic and two
 * opposite requests, and conflating them is how a bot ends up doing the reverse
 * of what it was asked.
 *
 * Still entirely local and deterministic: no model, no network, no reading
 * habits leaving the device. What it buys over the rules is tolerance of
 * phrasing, word order, filler and small typos.
 */

export type Direction = "more" | "less" | "off" | "none";

/**
 * Crude suffix stripping. Enough to fold inflections onto a common stem.
 *
 * The doubled-consonant step matters more than it looks: English doubles the
 * final letter before a suffix, so "bigger" strips to "bigg" and never reaches
 * "big" — which meant the commonest way of asking for larger type matched
 * nothing at all.
 */
export function stem(word: string): string {
  let out = word.toLowerCase();
  // Twice, because English stacks suffixes: "settings" is a plural of a gerund,
  // and stripping once left it at "setting" while "setting" itself reduced to
  // "set" — the same word landing in two places depending on how it arrived,
  // so a request about settings matched nothing.
  for (let pass = 0; pass < 2; pass += 1) {
    const next = out.replace(/(ing|ed|es|er|est|ly|s)$/i, "");
    // Never strip a word down to nothing meaningful.
    if (next.length < 3) break;
    if (next === out) break;
    out = next;
  }
  return out.replace(/(i)$/i, "y").replace(/([bdfglmnprt])\1$/, "$1");
}

export function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !STOP.has(word));
}

/** Words that carry no intent. Dropping them stops filler diluting every score. */
const STOP = new Set([
  "the", "a", "an", "is", "it", "to", "of", "and", "or", "my", "me", "i", "you",
  "please", "can", "could", "would", "will", "do", "does", "for", "this", "that",
  "be", "am", "are", "was", "with", "on", "in", "at", "so", "just", "bit", "little",
  "very", "too", "really", "some", "any", "have", "has", "get", "got", "make",
  "makes", "making", "want", "need", "how", "what", "when", "where", "why", "if",
]);

/**
 * Levenshtein distance, capped.
 *
 * Only ever asked whether two short words are within one or two edits, so it
 * bails as soon as the distance cannot come back under the cap — a full matrix
 * for words that obviously do not match is wasted work on every keystroke.
 */
/**
 * Damerau-Levenshtein: a transposition costs one edit, not two.
 *
 * Swapped adjacent letters are the most common typing mistake there is, and
 * plain Levenshtein charges double for them — which is why "fnot" failed to
 * reach "font" while much less similar words got through on their length.
 */
export function editDistance(a: string, b: string, cap = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const rows: number[][] = [Array.from({ length: b.length + 1 }, (_, i) => i)];
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(row[j - 1]! + 1, rows[i - 1]![j]! + 1, rows[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, rows[i - 2]![j - 2]! + 1);
      }
      row[j] = value;
      best = Math.min(best, value);
    }
    if (best > cap) return cap + 1;
    rows.push(row);
  }
  return rows[a.length]![b.length]!;
}

/**
 * Does this token mean this vocabulary word, allowing for a typo?
 *
 * Fuzziness is only extended to words long enough to survive it. At four
 * letters a single edit connects words that mean nothing to each other —
 * "read" reaches "lead", and a request to read slower came back as a change to
 * line spacing. Below the floor only an exact stem or a real prefix counts.
 */
const FUZZY_MIN = 5;

export function tokenMatches(token: string, term: string): boolean {
  if (token === term) return true;
  const a = stem(token);
  const b = stem(term);
  if (a === b) return true;
  // A prefix has to be a substantial part of the longer word, or "spa" would
  // claim "spacing" and "par" would claim "parallax".
  if (a.length >= 4 && b.length >= 4) {
    const [short, long] = a.length <= b.length ? [a, b] : [b, a];
    if (long.startsWith(short) && short.length >= long.length - 3) return true;
  }
  if (Math.min(a.length, b.length) < FUZZY_MIN) return false;
  // Typos very rarely change the first letter, and requiring it to hold cuts
  // out the false matches that make a command bot look unhinged: "flight" is
  // one deletion from "lighter", so asking it to book a flight to Lagos
  // changed the colour scheme.
  if (a[0] !== b[0]) return false;
  const cap = Math.max(a.length, b.length) >= 8 ? 2 : 1;
  return editDistance(a, b, cap) <= cap;
}

const MORE_WORDS = ["more", "increase", "raise", "higher", "up", "stronger", "bolder", "bigger", "larger", "wider", "faster", "boost"];
const LESS_WORDS = ["less", "reduce", "lower", "decrease", "down", "weaker", "softer", "soften", "smaller", "shorter", "slower", "calmer", "gentler", "subtle"];
const OFF_WORDS = ["off", "disable", "stop", "remove", "hide", "cancel", "none", "without", "kill"];

/**
 * Phrases where the direction is the opposite of the words in them.
 *
 * "I can't keep up" contains "up" and means slow down; "falling behind" and
 * "too much" carry no direction word at all and clearly mean less. Read
 * word-by-word these come out backwards, which is the worst failure available
 * to a command bot — it does the reverse of what it was asked and looks like it
 * understood. They are matched on the raw sentence, before tokenising strips
 * the negations that carry the meaning.
 */
const LESS_PHRASES = [
  /\bcan'?t keep up\b/,
  /\bcannot keep up\b/,
  /\bfalling behind\b/,
  /\bfall behind\b/,
  /\btoo much\b/,
  /\btoo many\b/,
  /\bslow (it |this )?down\b/,
  /\bease off\b/,
  /\bback off\b/,
  /\bdial (it |this )?back\b/,
];

const MORE_PHRASES = [/\bspeed (it |this )?up\b/, /\bpick up the pace\b/, /\bnot enough\b/];

export function readDirection(tokens: string[], raw = ""): Direction {
  const has = (list: string[]) => tokens.some((t) => list.some((w) => tokenMatches(t, w)));
  // Phrases first: they exist precisely because the words inside them read the
  // wrong way round.
  if (LESS_PHRASES.some((p) => p.test(raw))) return "less";
  if (MORE_PHRASES.some((p) => p.test(raw))) return "more";
  // Off before less: "turn off the bold" is a removal, not a reduction, even
  // though both readings are available in the sentence.
  if (has(OFF_WORDS)) return "off";
  if (has(LESS_WORDS)) return "less";
  if (has(MORE_WORDS)) return "more";
  return "none";
}

export interface Topic<T> {
  id: T;
  /** Vocabulary. Weight says how strongly a word implies this topic. */
  terms: Array<[string, number]>;
  /** Any of these present rules the topic out entirely. */
  blocks?: string[];
}

export interface Scored<T> {
  id: T;
  score: number;
}

/**
 * Score every topic against the sentence and return them best-first.
 *
 * A topic's score is simply the sum of the weights it matched. An earlier
 * version divided by vocabulary size to stop a topic winning merely by listing
 * more synonyms — but that punished breadth so hard that a topic with eleven
 * terms could not clear the floor on a single match, and "bigger text" matched
 * nothing. Weights and `blocks` already do that job, and they do it by meaning
 * rather than by counting.
 */
export function scoreTopics<T>(tokens: string[], topics: Topic<T>[]): Scored<T>[] {
  const out: Scored<T>[] = [];
  for (const topic of topics) {
    if (topic.blocks?.some((b) => tokens.some((t) => tokenMatches(t, b)))) continue;
    let score = 0;
    for (const [term, weight] of topic.terms) {
      if (tokens.some((token) => tokenMatches(token, term))) score += weight;
    }
    if (score > 0) out.push({ id: topic.id, score });
  }
  return out.sort((a, b) => b.score - a.score);
}
