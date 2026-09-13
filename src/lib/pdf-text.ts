/**
 * Rebuild readable prose from the fragments pdf.js hands back.
 *
 * A PDF stores placed glyph runs, not sentences. `getTextContent()` returns
 * those runs, and a run boundary means nothing linguistically — a kerned pair,
 * a font switch, or a ligature all split one. Joining them with a space, which
 * is what this used to do, inserts spaces inside words: "CHAPTER" arrives as
 * "CHAPT" + "ER" and reads as "CHAPT ER". Collapsing all whitespace on top of
 * that throws away every line and paragraph boundary, so a chapter heading runs
 * straight into the first sentence beneath it.
 *
 * So: join runs by geometry rather than by hope. Two decisions, both from
 * coordinates the items already carry — where a space belongs inside a line,
 * and where one paragraph ends and the next begins.
 */

/** The parts of a pdf.js text item this needs. Structural, so it can be tested. */
export interface PdfTextItem {
  str?: string;
  /** pdf.js sets this on the item that ends a visual line. */
  hasEOL?: boolean;
  /** [a, b, c, d, x, y] — the text matrix. */
  transform?: number[];
  width?: number;
  height?: number;
}

interface Line {
  text: string;
  /** Baseline, in PDF units: larger is further up the page. */
  y: number;
  /** Tallest glyph on the line, which stands in for font size. */
  size: number;
}

/**
 * A gap wider than this share of the font size is a real space.
 *
 * Tight enough to survive the loose tracking in a heading, wide enough not to
 * invent a space out of ordinary kerning.
 */
const SPACE_RATIO = 0.22;

/** A line further from the last one than this multiple of the norm starts a paragraph. */
const PARAGRAPH_GAP = 1.45;

/** A font-size change this large is a heading meeting body text. */
const SIZE_JUMP = 0.25;

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function itemX(item: PdfTextItem): number | null {
  return num(item.transform?.[4]);
}

function itemY(item: PdfTextItem): number | null {
  return num(item.transform?.[5]);
}

function itemSize(item: PdfTextItem): number {
  // `height` is absent on some producers; the matrix's vertical scale is the
  // same number by another route.
  return num(item.height) ?? Math.abs(num(item.transform?.[3]) ?? 0);
}

/** Group runs into visual lines, inserting spaces only where the geometry wants one. */
function linesFrom(items: PdfTextItem[]): Line[] {
  const lines: Line[] = [];
  let buf = "";
  let y: number | null = null;
  let size = 0;
  let endX: number | null = null;

  function flush() {
    const text = buf.replace(/[^\S\n]+/g, " ").trim();
    if (text) lines.push({ text, y: y ?? 0, size });
    buf = "";
    y = null;
    size = 0;
    endX = null;
  }

  for (const item of items) {
    const str = typeof item.str === "string" ? item.str : "";

    if (str) {
      const x = itemX(item);
      const height = itemSize(item);

      if (!buf) {
        y = itemY(item);
        size = height;
      } else if (endX != null && x != null) {
        // The only question inside a line: did the pen move further than
        // setting these glyphs would have moved it? If so, something was
        // skipped, and that something was a space.
        const reference = size || height || 10;
        if (x - endX > reference * SPACE_RATIO && !/\s$/.test(buf) && !/^\s/.test(str)) {
          buf += " ";
        }
      }

      buf += str;
      if (height > size) size = height;
      endX = x != null ? x + (num(item.width) ?? 0) : null;
    }

    if (item.hasEOL) flush();
  }

  flush();
  return lines;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Whether a new line starts a new paragraph, or continues the one above.
 *
 * Leading is the tell. Lines inside a paragraph sit one leading apart; a
 * paragraph break, a heading, or a scene break opens that up. Measured against
 * this page's own median rather than a fixed number, because leading is a
 * choice each book makes.
 */
function startsParagraph(prev: Line, line: Line, normalGap: number): boolean {
  const gap = Math.abs(prev.y - line.y);
  if (normalGap > 0 && gap > normalGap * PARAGRAPH_GAP) return true;
  // A heading and the text under it are different sizes even when their
  // spacing is not, which is what merged "CHAPTER ONE" into the sentence
  // beneath it.
  const base = Math.max(prev.size, line.size);
  return base > 0 && Math.abs(prev.size - line.size) > base * SIZE_JUMP;
}

/**
 * Join the lines of a paragraph back into flowing prose.
 *
 * The reader re-wraps text to its own measure, so a PDF's hard line breaks are
 * not worth keeping — kept, they would lock the reader to the column width of
 * a book they are not holding. A word broken across a line break rejoins
 * without its hyphen.
 */
function appendLine(paragraph: string, line: string): string {
  if (!paragraph) return line;
  // Only a hyphen directly after a letter is hyphenation; a dash standing on
  // its own is punctuation and stays.
  if (/[A-Za-zÀ-ɏ][-‐­]$/.test(paragraph)) {
    return paragraph.replace(/[-‐­]$/, "") + line;
  }
  return `${paragraph} ${line}`;
}

/** Readable text for one page: paragraphs separated by a blank line. */
export function textFromItems(items: PdfTextItem[]): string {
  const lines = linesFrom(items ?? []);
  if (!lines.length) return "";

  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const gap = Math.abs(lines[i - 1]!.y - lines[i]!.y);
    // Zero gaps are the same baseline reached twice, which says nothing about
    // leading and would drag the median to nothing.
    if (gap > 0.5) gaps.push(gap);
  }
  const normalGap = median(gaps);

  const paragraphs: string[] = [];
  let current = lines[0]!.text;

  for (let i = 1; i < lines.length; i += 1) {
    const prev = lines[i - 1]!;
    const line = lines[i]!;
    if (startsParagraph(prev, line, normalGap)) {
      paragraphs.push(current);
      current = line.text;
    } else {
      current = appendLine(current, line.text);
    }
  }
  paragraphs.push(current);

  return paragraphs
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .join("\n\n");
}
