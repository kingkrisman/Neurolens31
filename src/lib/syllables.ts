const VOWELS = /[aeiouy]/i;
const PREFIXES = ["over", "under", "inter", "super", "pre", "pro", "dis", "mis", "non", "un", "re", "in", "im", "en", "em", "con", "com"];
const SUFFIXES = ["tion", "sion", "ture", "ment", "ness", "able", "ible", "ous", "ful", "less", "ing", "est", "ers", "ied", "ies", "ly", "er", "ed"];
const ONSETS = ["sch", "scr", "spl", "spr", "str", "thr", "chr", "shr", "th", "sh", "ch", "wh", "ph", "ck", "qu", "ng"];

function isVowel(ch: string | undefined): boolean {
  return Boolean(ch && VOWELS.test(ch));
}

function peel(list: string[], word: string, fromEnd: boolean): { rest: string; parts: string[] } {
  const parts: string[] = [];
  let rest = word;
  let guard = 0;
  while (rest.length > 3 && guard < 4) {
    const hit = list.find((item) => (fromEnd ? rest.endsWith(item) : rest.startsWith(item)) && rest.length - item.length >= 2);
    if (!hit) break;
    if (fromEnd) {
      parts.unshift(hit);
      rest = rest.slice(0, -hit.length);
    } else {
      parts.push(hit);
      rest = rest.slice(hit.length);
    }
    guard += 1;
  }
  return { rest, parts };
}

/** Greedy VC-CV split with common prefixes/suffixes kept intact. */
export function syllabify(raw: string): string[] {
  const match = raw.match(/^([^A-Za-z]*)([A-Za-z']+)([^A-Za-z]*)$/);
  if (!match) return [raw];
  const [, prefix, core, suffix] = match;
  if (core.length <= 3) return [raw];

  const lower = core.toLowerCase();
  const front = peel(PREFIXES, lower, false);
  const back = peel(SUFFIXES, front.rest, true);
  const middle = splitNucleus(back.rest);
  const pieces = [...front.parts, ...middle, ...back.parts].filter(Boolean);
  if (pieces.length <= 1) return [raw];

  let cursor = 0;
  const out: string[] = [];
  for (const piece of pieces) {
    out.push(core.slice(cursor, cursor + piece.length));
    cursor += piece.length;
  }
  if (cursor < core.length) out[out.length - 1] = (out[out.length - 1] ?? "") + core.slice(cursor);
  if (prefix) out[0] = prefix + (out[0] ?? "");
  if (suffix) out[out.length - 1] = (out[out.length - 1] ?? "") + suffix;
  return out;
}

function splitNucleus(word: string): string[] {
  if (word.length <= 3) return word ? [word] : [];
  const chars = [...word];
  const cuts: number[] = [];
  for (let i = 1; i < chars.length - 1; i += 1) {
    const prev = chars[i - 1];
    const cur = chars[i];
    const next = chars[i + 1];
    if (isVowel(prev) && !isVowel(cur) && isVowel(next)) {
      const cluster = onsetAt(word, i);
      cuts.push(cluster ? i + cluster.length : i);
    } else if (isVowel(prev) && !isVowel(cur) && !isVowel(next) && isVowel(chars[i + 2])) {
      cuts.push(i + 1);
    }
  }
  const unique = [...new Set(cuts)].filter((at) => at > 0 && at < word.length).sort((a, b) => a - b);
  if (!unique.length) return [word];
  const parts: string[] = [];
  let start = 0;
  for (const cut of unique) {
    if (cut - start < 1) continue;
    parts.push(word.slice(start, cut));
    start = cut;
  }
  if (start < word.length) parts.push(word.slice(start));
  return parts.filter(Boolean);
}

function onsetAt(word: string, index: number): string | null {
  const slice = word.slice(index);
  return ONSETS.find((item) => slice.startsWith(item)) ?? null;
}

export function withSyllableMarks(word: string): string {
  return syllabify(word).join("·");
}
