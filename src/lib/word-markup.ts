import { processBionicText } from "./bionic.ts";
import { applyPlainPhrases, swapPlainWord } from "./text-simplifier.ts";
import { syllabify } from "./syllables.ts";

const CLUSTERS = /^(sch|scr|spl|spr|str|thr|chr|shr|th|sh|ch|wh|ph|ck|ng|qu)/i;
const CONFUSING = new Set(["b", "d", "p", "q"]);

export interface WordToken {
  text: string;
  html: string;
  index: number;
  charStart: number;
}

export function tokenizeWords(text: string): { raw: string; isWord: boolean; charStart: number }[] {
  const parts: { raw: string; isWord: boolean; charStart: number }[] = [];
  const re = /([A-Za-z][A-Za-z']*(?:-[A-Za-z][A-Za-z']*)*)|([^A-Za-z]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    parts.push({
      raw: match[0],
      isWord: Boolean(match[1]),
      charStart: match.index,
    });
  }
  return parts;
}

export function decorateWord(
  word: string,
  {
    bionic = 0,
    syllables = false,
    letterGuide = false,
    rhythm = false,
    plainLanguage = false,
  }: {
    bionic?: number;
    syllables?: boolean;
    letterGuide?: boolean;
    rhythm?: boolean;
    plainLanguage?: boolean;
  } = {},
): string {
  try {
    const swapped = plainLanguage ? swapPlainWord(word) : { next: word, original: null as string | null };
    const source = swapped.next;
    const letters = source.match(/^([^A-Za-z]*)([A-Za-z']+)([^A-Za-z]*)$/);
    if (!letters) return escapeHtml(source);
    const [, lead, core, trail] = letters;
    const bounds = syllables ? syllableBounds(core) : [];
    const bionicHtml = bionic > 0 ? processBionicText(core, bionic, rhythm) : escapeHtml(core);
    const boldMatch = bionicHtml.match(/^<span class="fixation">([^<]*)<\/span>(.*)$/);
    const boldLen = boldMatch ? boldMatch[1].length : 0;
    let html = escapeHtml(lead);
    for (let i = 0; i < core.length; i += 1) {
      if (bounds.includes(i) && i > 0) html += '<span class="syl-dot" aria-hidden="true">·</span>';
      const cluster = letterGuide ? clusterAt(core, i) : null;
      if (cluster) {
        const full = core.slice(i, i + cluster.length);
        html += `<span class="letter-cluster">${escapeHtml(full)}</span>`;
        i += cluster.length - 1;
        continue;
      }
      const ch = core[i] ?? "";
      let piece = escapeHtml(ch);
      if (letterGuide && CONFUSING.has(ch.toLowerCase())) {
        piece = `<span class="letter-${ch.toLowerCase()}">${piece}</span>`;
      }
      if (i < boldLen) piece = `<span class="fixation">${piece}</span>`;
      html += piece;
    }
    const inner = html + escapeHtml(trail);
    if (!swapped.original) return inner;
    return `<span class="plain-swap" title="Was: ${escapeHtml(swapped.original)}">${inner}</span>`;
  } catch {
    return escapeHtml(word);
  }
}

export function decorateSentence(
  text: string,
  opts: { bionic?: number; syllables?: boolean; letterGuide?: boolean; rhythm?: boolean; plainLanguage?: boolean },
): WordToken[] {
  let wordIndex = 0;
  const source = opts.plainLanguage ? applyPlainPhrases(text).text : text;
  return tokenizeWords(source)
    .filter((part) => part.isWord)
    .map((part) => ({
      text: part.raw,
      html: decorateWord(part.raw, opts),
      index: wordIndex++,
      charStart: part.charStart,
    }));
}

export function decorateLine(
  text: string,
  opts: { bionic?: number; syllables?: boolean; letterGuide?: boolean; rhythm?: boolean; plainLanguage?: boolean },
): string {
  try {
    const source = opts.plainLanguage ? applyPlainPhrases(text).text : text;
    return tokenizeWords(source)
      .map((part) => (part.isWord ? decorateWord(part.raw, opts) : escapeHtml(part.raw)))
      .join("");
  } catch {
    return escapeHtml(text);
  }
}

function syllableBounds(core: string): number[] {
  const parts = syllabify(core);
  const at: number[] = [];
  let cursor = 0;
  for (let i = 1; i < parts.length; i += 1) {
    cursor += parts[i - 1]?.length ?? 0;
    at.push(cursor);
  }
  return at;
}

function clusterAt(word: string, index: number): string | null {
  const slice = word.slice(index);
  const hit = slice.match(CLUSTERS);
  return hit ? hit[1] : null;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "\u0026amp;").replace(/</g, "\u0026lt;").replace(/>/g, "\u0026gt;");
}

export function wordAtChar(text: string, charIndex: number): number {
  const tokens = tokenizeWords(text).filter((part) => part.isWord);
  let found = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token) continue;
    if (charIndex >= token.charStart) found = i;
  }
  return found;
}

export function wordAtOffset(text: string, offset: number): string | null {
  if (!text) return null;
  let i = offset;
  if (i < 0) i = 0;
  if (i >= text.length) i = text.length - 1;
  if (i < 0) return null;
  const at = text[i] ?? "";
  if (!/[A-Za-z']/.test(at) && i > 0 && /[A-Za-z']/.test(text[i - 1] ?? "")) i -= 1;
  if (!/[A-Za-z']/.test(text[i] ?? "")) return null;
  let start = i;
  let end = i + 1;
  while (start > 0 && /[A-Za-z']/.test(text[start - 1] ?? "")) start -= 1;
  while (end < text.length && /[A-Za-z']/.test(text[end] ?? "")) end += 1;
  const word = text.slice(start, end).replace(/^'+|'+$/g, "");
  return word.length >= 2 ? word : null;
}

export function wordFromPoint(clientX: number, clientY: number, root?: Element | null): string | null {
  if (typeof document === "undefined") return null;
  const point = root ? pointOnLineBoxes(root, clientX, clientY) : { x: clientX, y: clientY };
  const hitWord = document.elementFromPoint(point.x, point.y)?.closest(".reading-word");
  if (hitWord && (!root || root.contains(hitWord))) {
    return cleanWord(hitWord.textContent);
  }

  const caret = caretFromPoint(point.x, point.y);
  let node = caret.node;
  let offset = caret.offset;
  if (root && node && !root.contains(node)) {
    const box = pointOnLineBoxes(root, point.x, point.y);
    const next = caretFromPoint(box.x, box.y);
    node = next.node;
    offset = next.offset;
  }
  if (!node) return nearestWord(root, point.x, point.y);
  if (root && !root.contains(node)) return nearestWord(root, point.x, point.y);

  const el = node instanceof Element ? node : node.parentElement;
  const wordEl = el?.closest(".reading-word");
  if (wordEl && (!root || root.contains(wordEl))) {
    return cleanWord(wordEl.textContent);
  }
  if (node.nodeType !== Node.TEXT_NODE) {
    return (
      wordAtOffset((node.textContent ?? "").replace(/·/g, ""), Math.min(offset, node.textContent?.length ?? 0)) ??
      nearestWord(root, point.x, point.y)
    );
  }
  return expandWordFromTextNode(node, offset, root) ?? nearestWord(root, point.x, point.y);
}

function pointOnLineBoxes(root: Element, clientX: number, clientY: number): { x: number; y: number } {
  const rects = [...root.getClientRects()].filter((r) => r.width > 2 && r.height > 2);
  if (!rects.length) return { x: clientX, y: clientY };
  let best = rects[0]!;
  let bestD = Infinity;
  for (const r of rects) {
    const dx = clientX < r.left ? r.left - clientX : clientX > r.right ? clientX - r.right : 0;
    const dy = clientY < r.top ? r.top - clientY : clientY > r.bottom ? clientY - r.bottom : 0;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return {
    x: Math.min(Math.max(clientX, best.left + 2), best.right - 2),
    y: (best.top + best.bottom) / 2,
  };
}

function nearestWord(root: Element | null | undefined, clientX: number, clientY: number): string | null {
  if (!root) return null;
  const words = root.querySelectorAll(".reading-word");
  let best: Element | null = null;
  let bestD = Infinity;
  for (const word of words) {
    const r = word.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const dx = clientX < r.left ? r.left - clientX : clientX > r.right ? clientX - r.right : 0;
    const dy = clientY < r.top ? r.top - clientY : clientY > r.bottom ? clientY - r.bottom : 0;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = word;
    }
  }
  if (best && bestD < 6400) return cleanWord(best.textContent);
  return null;
}

function caretFromPoint(clientX: number, clientY: number): { node: Node | null; offset: number } {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  if (typeof doc.caretRangeFromPoint === "function") {
    const range = doc.caretRangeFromPoint(clientX, clientY);
    if (range) return { node: range.startContainer, offset: range.startOffset };
  }
  if (typeof doc.caretPositionFromPoint === "function") {
    const pos = doc.caretPositionFromPoint(clientX, clientY);
    if (pos) return { node: pos.offsetNode, offset: pos.offset };
  }
  return { node: null, offset: 0 };
}

function cleanWord(value: string | null | undefined): string | null {
  const raw = (value ?? "").replace(/·/g, "").replace(/^'+|'+$/g, "");
  return raw.length >= 2 ? raw : null;
}

function expandWordFromTextNode(node: Node, offset: number, root?: Element | null): string | null {
  const line = root ?? node.parentElement?.closest(".reading-line");
  if (!line) return wordAtOffset((node.textContent ?? "").replace(/·/g, ""), offset);
  const visual = line.querySelector("[aria-hidden='true']") ?? line;
  const scope = visual.contains(node) ? visual : line;

  const collect = (start: Node, direction: "prev" | "next") => {
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    walker.currentNode = start;
    let out = "";
    let cursor = direction === "prev" ? walker.previousNode() : walker.nextNode();
    while (cursor) {
      if (cursor.parentElement?.closest(".sr-only")) {
        cursor = direction === "prev" ? walker.previousNode() : walker.nextNode();
        continue;
      }
      const t = (cursor.textContent ?? "").replace(/·/g, "");
      if (!t) {
        cursor = direction === "prev" ? walker.previousNode() : walker.nextNode();
        continue;
      }
      const edge = direction === "prev" ? t[t.length - 1] : t[0];
      if (!/[A-Za-z']/.test(edge ?? "")) break;
      out = direction === "prev" ? t + out : out + t;
      cursor = direction === "prev" ? walker.previousNode() : walker.nextNode();
    }
    return out;
  };

  const before = collect(node, "prev");
  const after = collect(node, "next");
  const at = (node.textContent ?? "").replace(/·/g, "");
  return wordAtOffset(before + at + after, before.length + offset);
}

export function chunkByMinutes(text: string, wpm: number, minutes = 3): string[] {
  const target = Math.max(80, Math.round(wpm * minutes));
  const units = text.split(/\n{2,}|(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let bucket: string[] = [];
  let count = 0;
  const flush = () => {
    if (!bucket.length) return;
    chunks.push(bucket.join(" ").replace(/\s+/g, " ").trim());
    bucket = [];
    count = 0;
  };
  for (const unit of units) {
    const words = unit.trim().split(/\s+/).filter(Boolean).length;
    if (!words) continue;
    if (count && count + words > target) flush();
    if (words > target) {
      const tokens = unit.trim().split(/\s+/);
      for (let i = 0; i < tokens.length; i += target) {
        if (count) flush();
        chunks.push(tokens.slice(i, i + target).join(" "));
      }
      continue;
    }
    bucket.push(unit.trim());
    count += words;
  }
  flush();
  return chunks.length ? chunks : [text];
}
