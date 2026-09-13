/**
 * Punkt-inspired sentence boundary detection.
 *
 * Naive splits on `.!?` break on Dr., U.S., e.g., 3.14, initials, and ellipsis.
 * These rules follow Kiss & Strunk (2006): candidate terminator, abbreviation
 * lists, initials, decimals, and next-token case / sentence starters.
 */

const TITLES = new Set([
  "mr",
  "mrs",
  "ms",
  "mx",
  "dr",
  "prof",
  "sr",
  "jr",
  "st",
  "mt",
  "rev",
  "hon",
  "gen",
  "col",
  "lt",
  "sgt",
  "capt",
  "cmdr",
  "adm",
  "pres",
  "gov",
  "sen",
  "rep",
  "amb",
]);

const NEVER_END = new Set([
  ...TITLES,
  "vs",
  "v",
  "fig",
  "vol",
  "no",
  "nos",
  "pp",
  "p",
  "ch",
  "sec",
  "eq",
  "approx",
  "ca",
  "cf",
  "viz",
  "dept",
  "univ",
  "assn",
  "inc",
  "ltd",
  "corp",
  "co",
  "jan",
  "feb",
  "mar",
  "apr",
  "jun",
  "jul",
  "aug",
  "sep",
  "sept",
  "oct",
  "nov",
  "dec",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
  "est",
  "edt",
  "pst",
  "cst",
  "gmt",
  "utc",
  "am",
  "pm",
  "eg",
  "ie",
  "nb",
]);

const MAY_END = new Set(["etc", "al", "us", "uk", "un", "eu", "usa", "phd", "md", "ba"]);

const MULTI_PERIOD = new Set(["e.g", "i.e", "u.s", "u.k", "u.n", "e.u", "ph.d", "m.d", "b.a", "a.m", "p.m", "n.b", "et.al"]);

const SENTENCE_STARTERS = new Set([
  "the",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "he",
  "she",
  "we",
  "they",
  "i",
  "you",
  "a",
  "an",
  "in",
  "on",
  "at",
  "for",
  "but",
  "and",
  "or",
  "if",
  "when",
  "while",
  "after",
  "before",
  "although",
  "however",
  "therefore",
  "thus",
  "moreover",
  "furthermore",
  "meanwhile",
  "what",
  "why",
  "how",
  "where",
  "who",
  "which",
  "then",
  "next",
  "later",
  "finally",
  "still",
  "yet",
  "so",
  "because",
  "since",
  "here",
  "there",
  "today",
  "tomorrow",
  "yesterday",
]);

const TRAILING_CLOSERS = /[\]"'”’)\]]+$/;

export interface ParsedToken {
  word: string;
  punct: string;
  closers: string;
}

export function parseToken(token: string): ParsedToken {
  const trimmed = token.trim();
  const closerMatch = trimmed.match(TRAILING_CLOSERS);
  const closers = closerMatch?.[0] ?? "";
  const core = closers ? trimmed.slice(0, -closers.length) : trimmed;
  const punctMatch = core.match(/^(.*?)([.!?…]+)$/u);
  if (!punctMatch) return { word: core, punct: "", closers };
  return { word: punctMatch[1] ?? "", punct: punctMatch[2] ?? "", closers };
}

function abbrevKey(word: string): string {
  return word.replace(/[.]/g, "").toLowerCase();
}

function multiKey(word: string): string {
  return word.replace(/\.$/, "").toLowerCase();
}

function isTitleOrNeverEnd(word: string): boolean {
  const key = abbrevKey(word);
  const dotted = multiKey(word);
  if (MAY_END.has(key)) return false;
  return NEVER_END.has(key) || MULTI_PERIOD.has(dotted) || TITLES.has(key);
}

function isMayEndAbbrev(word: string): boolean {
  const key = abbrevKey(word);
  const dotted = multiKey(word);
  return MAY_END.has(key) || (MULTI_PERIOD.has(dotted) && MAY_END.has(key));
}

function isInitial(word: string, punct: string): boolean {
  if (!punct.startsWith(".")) return false;
  return /^[A-Za-z]$/.test(word);
}

function nextLooksLikeName(next: string): boolean {
  const parsed = parseToken(next);
  if (isInitial(parsed.word, parsed.punct || ".")) return true;
  if (!/^[A-Z]/.test(next)) return false;
  return !isSentenceStarter(next);
}

function isSentenceStarter(next: string): boolean {
  const word = parseToken(next).word || next;
  const letters = word.replace(/[^A-Za-z]/g, "");
  if (!letters) return false;
  return SENTENCE_STARTERS.has(letters.toLowerCase());
}

function startsLower(next: string): boolean {
  const letter = next.match(/[A-Za-z]/);
  return Boolean(letter && letter[0] === letter[0].toLowerCase() && letter[0] !== letter[0].toUpperCase());
}

function isDecimalToken(token: string): boolean {
  return /^\d+[.,]\d+[.,]?\d*$/.test(token.replace(TRAILING_CLOSERS, ""));
}

function nextWordFrom(tokens: { value: string; space: boolean }[], index: number): string {
  for (let i = index + 1; i < tokens.length; i += 1) {
    if (!tokens[i]?.space) return tokens[i]?.value ?? "";
  }
  return "";
}

/**
 * True when `token` is a real sentence end, not Dr. / U.S. / 3.14 / J. K.
 * `next` is the following word (empty at end of text).
 */
export function isSentenceBoundary(token: string, next = ""): boolean {
  if (isDecimalToken(token)) return false;
  if (/@|https?:\/\//i.test(token)) return false;

  const { word, punct } = parseToken(token);
  if (!punct) return false;

  const strong = /[!?]/u.test(punct);
  if (strong) {
    if (next && startsLower(next)) return false;
    return true;
  }

  if (isTitleOrNeverEnd(word) && !isMayEndAbbrev(word)) return false;

  if (isInitial(word, punct)) {
    if (!next) return true;
    if (nextLooksLikeName(next)) return false;
    return isSentenceStarter(next);
  }

  if (isMayEndAbbrev(word)) {
    if (!next) return true;
    if (startsLower(next)) return false;
    return isSentenceStarter(next);
  }

  if (next && startsLower(next)) return false;
  return true;
}

export function tokenize(text: string): { start: number; end: number; value: string; space: boolean }[] {
  const tokens: { start: number; end: number; value: string; space: boolean }[] = [];
  let index = 0;
  while (index < text.length) {
    const space = /\s/.test(text[index] ?? "");
    let end = index + 1;
    while (end < text.length && /\s/.test(text[end] ?? "") === space) end += 1;
    tokens.push({ start: index, end, value: text.slice(index, end), space });
    index = end;
  }
  return tokens;
}

/** Original slices, including trailing space after a boundary, so spans join back to the source. */
export function splitSentenceSpans(text: string): string[] {
  if (!text.trim()) return [];
  const tokens = tokenize(text);
  const spans: string[] = [];
  let spanStart = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    if (token.space) continue;
    const next = nextWordFrom(tokens, i);
    if (!isSentenceBoundary(token.value, next)) continue;
    let end = token.end;
    const following = tokens[i + 1];
    if (following?.space) end = following.end;
    const slice = text.slice(spanStart, end);
    if (slice.trim()) spans.push(slice);
    spanStart = end;
  }
  const rest = text.slice(spanStart);
  if (rest.trim()) spans.push(rest);
  return spans.length > 0 ? spans : [text];
}

export function splitSentences(text: string): string[] {
  return splitSentenceSpans(text.replace(/\s+/g, " ").trim())
    .map((span) => span.trim())
    .filter(Boolean);
}

export function wordEndsSentence(words: string[], index: number): boolean {
  const token = words[index];
  if (!token) return false;
  return isSentenceBoundary(token, words[index + 1] ?? "");
}
