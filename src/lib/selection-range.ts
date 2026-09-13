/**
 * Turning a live text selection into something storable, and back again.
 *
 * A highlight has to survive a reload, a font change, and re-rendering the same
 * sentence with different bionic markup — so it cannot be stored as a DOM
 * Range. What is stable is the line it sits in and the character offsets within
 * that line's *plain text*, which is what these convert between.
 *
 * The awkward part is that a line is not one text node. Bionic formatting wraps
 * the lead of every word in its own element, so a sentence of ten words can be
 * twenty nodes, and the browser reports selection offsets against whichever node
 * the pointer happened to land in. Both directions here therefore walk the
 * line's text nodes and accumulate lengths.
 */

export interface LineRange {
  lineIdx: number;
  start: number;
  end: number;
  text: string;
}

/** Every text node inside a line, in document order. */
function textNodesOf(root: Element): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    nodes.push(node as Text);
    node = walker.nextNode();
  }
  return nodes;
}

/** Offset of a (node, offset) pair within the line's plain text. */
function offsetWithin(root: Element, target: Node, offset: number): number | null {
  let total = 0;
  for (const node of textNodesOf(root)) {
    if (node === target) return total + offset;
    total += node.data.length;
  }
  // The pair may address an element rather than a text node — a selection that
  // ends exactly on a boundary does this — so fall back to the element's own
  // extent rather than losing the selection entirely.
  if (root.contains(target)) return total;
  return null;
}

/**
 * Read the current selection as a range within one line.
 *
 * Returns null when there is nothing selected, when the selection is collapsed
 * (a plain click, which is not a highlight), or when it spans more than one
 * line. Cross-line selections are refused rather than clipped: silently marking
 * a different amount of text than someone dragged over is worse than declining.
 */
export function readSelection(container: Element): LineRange | null {
  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

  const range = selection.getRangeAt(0);
  const startLine = (range.startContainer.nodeType === Node.TEXT_NODE
    ? range.startContainer.parentElement
    : (range.startContainer as Element)
  )?.closest(".reading-line");
  const endLine = (range.endContainer.nodeType === Node.TEXT_NODE
    ? range.endContainer.parentElement
    : (range.endContainer as Element)
  )?.closest(".reading-line");

  if (!startLine || startLine !== endLine) return null;
  if (!container.contains(startLine)) return null;

  const start = offsetWithin(startLine, range.startContainer, range.startOffset);
  const end = offsetWithin(startLine, range.endContainer, range.endOffset);
  if (start == null || end == null || start === end) return null;

  const id = Number(startLine.id.replace("line-", ""));
  if (!Number.isFinite(id)) return null;

  const lineText = startLine.textContent ?? "";
  const snapped = snapToWords(lineText, Math.min(start, end), Math.max(start, end));
  if (!snapped) return null;

  return {
    lineIdx: id,
    start: snapped.start,
    end: snapped.end,
    text: lineText.slice(snapped.start, snapped.end).trim(),
  };
}

/**
 * Grow a raw drag out to whole words.
 *
 * A drag rarely begins and ends on a word boundary — starting a pixel late
 * gives "entence" instead of "Sentence" — and nobody means to mark half a word.
 * Every reading app that offers highlighting snaps for this reason.
 *
 * Trailing whitespace is trimmed back rather than included, so the stroke stops
 * at the last letter instead of running into the gap after it.
 */
export function snapToWords(text: string, rawStart: number, rawEnd: number): { start: number; end: number } | null {
  const isWord = (index: number) => index >= 0 && index < text.length && /[\p{L}\p{N}'’-]/u.test(text[index]!);

  let start = Math.max(0, Math.min(rawStart, text.length));
  let end = Math.max(0, Math.min(rawEnd, text.length));

  // Walk the start back to the beginning of the word it landed inside.
  while (start > 0 && isWord(start - 1)) start -= 1;
  // Walk the end forward to the end of its word.
  while (end < text.length && isWord(end)) end += 1;
  // Then pull back over any whitespace the drag overshot into.
  while (end > start && /\s/.test(text[end - 1]!)) end -= 1;

  if (end <= start) return null;
  return { start, end };
}

/** Rebuild a DOM Range from stored offsets, for painting a saved highlight. */
export function rangeFromOffsets(line: Element, start: number, end: number): Range | null {
  const nodes = textNodesOf(line);
  if (!nodes.length) return null;

  let startNode: Text | null = null;
  let startOffset = 0;
  let endNode: Text | null = null;
  let endOffset = 0;
  let seen = 0;

  for (const node of nodes) {
    const length = node.data.length;
    if (!startNode && seen + length >= start) {
      startNode = node;
      startOffset = start - seen;
    }
    if (seen + length >= end) {
      endNode = node;
      endOffset = end - seen;
      break;
    }
    seen += length;
  }

  if (!startNode || !endNode) return null;
  try {
    const range = document.createRange();
    range.setStart(startNode, Math.max(0, Math.min(startOffset, startNode.data.length)));
    range.setEnd(endNode, Math.max(0, Math.min(endOffset, endNode.data.length)));
    return range;
  } catch {
    // Offsets can fall outside the text if the line re-rendered shorter — a
    // simplified passage, say. A mark that cannot be placed is skipped rather
    // than thrown, so one stale highlight does not stop the rest painting.
    return null;
  }
}

export function customHighlightsSupported(): boolean {
  return typeof CSS !== "undefined" && "highlights" in CSS;
}

/**
 * Register the marker style at runtime.
 *
 * `::highlight()` cannot live in the stylesheet: Lightning CSS, which Tailwind
 * runs the sheet through, does not recognise the pseudo-element and drops the
 * rule silently. That failure is invisible from the outside — the ranges were
 * live and correctly registered, the highlight object existed, and nothing was
 * painted, because the stylesheet had no rule to paint with. A constructed
 * sheet goes straight to the document and never passes the build.
 *
 * Colours are read from the same custom properties the rest of the app uses, so
 * a scheme change is picked up by re-running this rather than by duplicating
 * the palette here.
 */
let sheet: CSSStyleSheet | null = null;

export function ensureHighlightStyle() {
  if (typeof document === "undefined") return;
  if (!("adoptedStyleSheets" in document)) return;
  if (!sheet) {
    try {
      sheet = new CSSStyleSheet();
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    } catch {
      sheet = null;
      return;
    }
  }
  // Light schemes tint, dark schemes lighten: the same wash over dark ink turns
  // to mud. Kept light enough either way that the letterforms stay fully
  // readable through it, which is the whole point of marking a passage.
  const scheme = document.documentElement.dataset.scheme ?? "paper";
  const dark = ["night", "ink", "dusk", "forest"].includes(scheme);
  const strength = dark ? 38 : 30;
  try {
    sheet.replaceSync(
      `::highlight(nl-mark){background-color:color-mix(in oklab, var(--color-accent) ${strength}%, transparent);color:var(--color-fg);}`,
    );
  } catch {
    /* a highlight that cannot be styled still exists in the list */
  }
}
