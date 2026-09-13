export interface ChapterSpan {
  title: string;
  startPage: number;
  endPage: number;
}

export interface TextChapter {
  title: string;
  body: string;
}

const KIND = "chapter|chapters|chap\\.?|book|part|canto|act|scene|letter|stave";
const ORDINAL =
  "first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth";
const WORDS =
  "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty";
const ROMAN = "[ivxlcdm]{1,8}";
const NUM = `(?:\\d{1,3}|${ROMAN}|${WORDS}|${ORDINAL})`;
const SMALL = "a|an|the|of|in|on|and|or|to|for|from|at|by|with";

const HEADING = new RegExp(`^(${KIND})\\s+(${NUM})\\b(?:[.:)\\]—–-]+\\s*(.*))?$`, "i");
const HEADING_PREFIX = new RegExp(`^(${KIND})\\s+(${NUM})\\b[.:)\\]—–-]*\\s*`, "i");
const ROMAN_TITLE = new RegExp(
  `^(${ROMAN})\\.\\s+((?:[A-Z][-\\w'’]*|${SMALL})(?:\\s+(?:(?:${SMALL})|[A-Z][-\\w'’]+)){0,12})\\.?$`,
  "i",
);
const SKIP = /^(contents|table of contents|illustrations|index|cover|title page)\.?$/i;

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (ch) => ch.toUpperCase())
    .replace(/\b(Of|The|And|Or|To|In|On|A|An|For|From|At|By|With)\b/g, (word, offset) =>
      offset === 0 ? word : word.toLowerCase(),
    );
}

function tidyRest(rest: string): string {
  const clipped = rest.replace(/^[.:)\-—–\s]+/, "").trim();
  if (!clipped) return "";
  if (clipped.length > 52) return "";
  if (/^[a-z]/.test(clipped)) return "";
  const cut = clipped.replace(/\s+[a-z][\s\S]*$/, "").trim();
  if (cut.length < 2) return "";
  return cut.replace(/[.:]+$/, "");
}

/** Pull a chapter heading from a short line or the start of extracted PDF text. */
export function headingTitle(raw: string): string | null {
  const line = raw.replace(/\s+/g, " ").trim();
  if (!line || line.length > 160) return null;
  if (SKIP.test(line)) return null;

  const candidate = line.length > 90 ? line.slice(0, 90) : line;
  const exact = candidate.match(HEADING);
  if (exact) {
    const kind = titleCase(exact[1].replace(/\.$/, ""));
    const num = /[ivxlcdm]+/i.test(exact[2]) ? exact[2].toUpperCase() : titleCase(exact[2]);
    const rest = tidyRest(exact[3] ?? "");
    return rest ? `${kind} ${num} · ${rest}` : `${kind} ${num}`;
  }

  const prefix = candidate.match(HEADING_PREFIX);
  if (prefix && prefix.index === 0) {
    const kind = titleCase(prefix[1].replace(/\.$/, ""));
    const num = /[ivxlcdm]+/i.test(prefix[2]) ? prefix[2].toUpperCase() : titleCase(prefix[2]);
    const after = candidate.slice(prefix[0].length);
    const rest = tidyRest(after);
    return rest ? `${kind} ${num} · ${rest}` : `${kind} ${num}`;
  }

  const roman = candidate.match(ROMAN_TITLE);
  if (roman) return `${roman[1].toUpperCase()}. ${roman[2].trim()}`;

  return null;
}

function headingCount(text: string): number {
  const lines = text.split(/\n+/);
  let count = 0;
  for (const line of lines) {
    if (headingTitle(line.trim())) count += 1;
    if (count >= 4) return count;
  }
  const blob = text.replace(/\s+/g, " ");
  const re = new RegExp(`(?:${KIND})\\s+(${NUM})\\b`, "gi");
  const extra = blob.match(re);
  return Math.max(count, extra?.length ?? 0);
}

function firstHeading(page: string): string | null {
  const trimmed = page.trim();
  if (!trimmed) return null;
  if (headingCount(trimmed) >= 3 && trimmed.length < 2200) return null;
  const lines = trimmed.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines.slice(0, 8)) {
    const title = headingTitle(line);
    if (title) return title;
  }
  return headingTitle(trimmed.slice(0, 120));
}

export function detectChapters(pages: string[]): ChapterSpan[] {
  if (pages.length < 2) return [];
  const hits: { page: number; title: string }[] = [];
  pages.forEach((page, index) => {
    const title = firstHeading(page);
    if (title) hits.push({ page: index + 1, title });
  });
  const kept = hits.filter((hit, index) => {
    const next = hits[index + 1];
    const span = (next ? next.page : pages.length + 1) - hit.page;
    const body = pages[hit.page - 1] ?? "";
    if (span <= 1 && body.length < 220) return false;
    return true;
  });
  if (kept.length < 2) return [];
  return kept.map((hit, index) => ({
    title: hit.title,
    startPage: hit.page,
    endPage: index + 1 < kept.length ? kept[index + 1].page - 1 : pages.length,
  }));
}

function isAllCapsTitle(line: string): boolean {
  const t = line.trim();
  return t.length >= 3 && t.length <= 48 && /^[A-Z][A-Z\s,'’:-]+$/.test(t) && /[A-Z]{3}/.test(t);
}

export function splitTextChapters(text: string): TextChapter[] {
  const source = text.replace(/\r\n/g, "\n").trim();
  if (!source) return [];
  const lines = source.split("\n");
  const hits: { index: number; title: string }[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const title = headingTitle(lines[i]);
    if (!title) continue;
    let label = title;
    const next = lines[i + 1]?.trim() ?? "";
    if (next && isAllCapsTitle(next) && !headingTitle(next)) {
      label = `${title} · ${titleCase(next)}`;
    }
    hits.push({ index: i, title: label });
  }

  const kept: TextChapter[] = [];
  for (let i = 0; i < hits.length; i += 1) {
    const start = hits[i].index;
    const end = i + 1 < hits.length ? hits[i + 1].index : lines.length;
    const skipSubtitle = isAllCapsTitle(lines[start + 1] ?? "") && !headingTitle(lines[start + 1] ?? "");
    const bodyStart = start + 1 + (skipSubtitle ? 1 : 0);
    const body = lines.slice(bodyStart, end).join("\n").trim();
    if (body.length < 160) continue;
    kept.push({ title: hits[i].title, body });
  }

  if (kept.length < 2) return [];

  const preamble = lines.slice(0, hits[0]?.index ?? 0).join("\n").trim();
  if (preamble.length >= 480) {
    return [{ title: "Front matter", body: preamble }, ...kept];
  }
  return kept;
}

export function joinTextChapters(chapters: TextChapter[]): string {
  return chapters
    .map((chapter) => `${chapter.title.replace(" · ", "\n")}\n\n${chapter.body}`.trim())
    .join("\n\n");
}

export function chapterAtPage(chapters: ChapterSpan[], page: number): number {
  if (!chapters.length || page < 1) return 0;
  if (page < chapters[0].startPage) return 0;
  for (let i = chapters.length - 1; i >= 0; i -= 1) {
    if (page >= chapters[i].startPage) return i + 1;
  }
  return 0;
}

/** Above this, an unbroken text is long enough that paging it beats scrolling it. */
const LONG_TEXT_WORDS = 12_000;
/** Words per synthetic section — roughly ten minutes at an average pace. */
const SECTION_WORDS = 2_500;

/**
 * Fallback pagination for a long text that declares no chapters.
 *
 * Plenty of Gutenberg plain-text files format their headings in a way
 * `splitTextChapters` cannot recognise, and those books then arrive as one
 * continuous document: every paragraph laid out, measured, and painted at once.
 *
 * This splits on paragraph boundaries only, and rejoins with the blank line it
 * split on, so the text is paged without being rewritten — unlike
 * `chunkByMinutes`, which collapses paragraphs into a single run and is a
 * reading mode rather than a way to divide a book.
 *
 * Returns `[]` for anything short enough to read in one go, so the reader keeps
 * its plain scrolling view when paging would only add navigation nobody needs.
 */
export function paginateLongText(text: string): TextChapter[] {
  const source = text.replace(/\r\n/g, "\n").trim();
  if (!source) return [];
  if (source.split(/\s+/).length < LONG_TEXT_WORDS) return [];

  const paragraphs = source.split(/\n{2,}/);
  const sections: TextChapter[] = [];
  let bucket: string[] = [];
  let words = 0;

  const flush = () => {
    if (!bucket.length) return;
    sections.push({ title: `Part ${sections.length + 1}`, body: bucket.join("\n\n") });
    bucket = [];
    words = 0;
  };

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;
    // Flush before adding, so a section ends on a paragraph boundary rather
    // than overshooting by however long the next paragraph happens to be.
    if (words && words + trimmed.split(/\s+/).length > SECTION_WORDS) flush();
    bucket.push(trimmed);
    words += trimmed.split(/\s+/).length;
  }
  flush();

  return sections.length > 1 ? sections : [];
}
