/**
 * Read a Kindle's `My Clippings.txt`.
 *
 * Every Kindle writes one, at the root of the device, and it is the only way
 * to get years of highlights out of Amazon without an API they do not offer.
 * It is also the reader's own file on their own hardware — plugging a Kindle in
 * and dragging the file over asks nobody's permission and breaks nobody's terms.
 *
 * The format is a stack of records separated by a line of equals signs:
 *
 *     Moby-Dick (Herman Melville)
 *     - Your Highlight on page 12 | Location 168-170 | Added on Monday, 3 March 2025 21:14:52
 *
 *     Call me Ishmael.
 *     ==========
 *
 * It is not a real format — it is a debug log that became one — so this parses
 * defensively. The pieces that matter are the title, the kind of mark, and the
 * text; page, location and date are taken when they are there and shrugged at
 * when they are not.
 *
 * Non-English Kindles write the second line in the device's language, so the
 * kind is decided by structure and keyword together: a record with no body is a
 * bookmark whatever it calls itself, and the keyword lists below cover the
 * languages Kindle ships with. An unrecognised one is kept as a highlight
 * rather than dropped, because a mark somebody made is worth more than our
 * confidence about which sort it was.
 */

export type ClippingKind = "highlight" | "note" | "bookmark";

export interface Clipping {
  title: string;
  author: string | null;
  kind: ClippingKind;
  text: string;
  /** Kindle's own position, kept verbatim — it means nothing outside a Kindle. */
  location: string | null;
  page: string | null;
  /** Epoch ms, when the line could be understood. */
  addedAt: number | null;
}

const SEPARATOR = /^={5,}$/m;

/**
 * Joins the parts of a deduplication key.
 *
 * A character that cannot occur in a title or a highlight, so two different
 * records cannot produce the same key by accident — a book called `A B` and a
 * book called `A` with kind `B` would collide on any separator somebody could
 * actually type. Built from its code point for the same reason as the BOM
 * above: no invisible characters in the source.
 */
const KEY_SEP = String.fromCharCode(0x1f);

/** Kindle's word for each kind, in the languages it ships in. */
const KEYWORDS: Record<ClippingKind, string[]> = {
  note: [
    "note",
    "notiz",
    "nota",
    "note personnelle",
    "notitie",
    "anteckning",
    "メモ",
    "注释",
    "備註",
  ],
  bookmark: [
    "bookmark",
    "lesezeichen",
    "marcador",
    "signet",
    "bladwijzer",
    "bokmärke",
    "ブックマーク",
    "书签",
  ],
  highlight: [
    "highlight",
    "markierung",
    "subrayado",
    "destacado",
    "surlignement",
    "passage surligné",
    "markering",
    "evidenziazione",
    "överstrykning",
    "ハイライト",
    "标注",
    "標註",
  ],
};

/**
 * Split "Title (Author)" — and cope with the many titles that contain brackets.
 *
 * Only a trailing parenthesised group is an author, and only when it is the
 * last thing on the line, so "Dracula (Penguin Classics) (Bram Stoker)" gives
 * up the right half.
 */
export function splitTitleAuthor(line: string): { title: string; author: string | null } {
  // Built from its code point rather than written out. A Kindle saves the
  // file UTF-8 with a byte-order mark, so this has to strip one — and a raw
  // BOM sitting invisibly in the source is exactly what the irregular-
  // whitespace lint rule exists to catch, so the character never appears here.
  const bom = String.fromCharCode(0xfeff);
  const trimmed = (line.startsWith(bom) ? line.slice(1) : line).trim();
  const match = /^(.*)\(([^()]*)\)\s*$/.exec(trimmed);
  if (!match) return { title: trimmed, author: null };
  const title = match[1]!.trim();
  const author = match[2]!.trim();
  if (!title) return { title: trimmed, author: null };
  return { title, author: author || null };
}

function kindOf(meta: string, hasBody: boolean): ClippingKind {
  const lower = meta.toLowerCase();
  for (const kind of ["note", "bookmark", "highlight"] as const) {
    if (KEYWORDS[kind].some((word) => lower.includes(word))) {
      // A bookmark has nothing to quote. If something calls itself a bookmark
      // but carries text, the text is what matters.
      if (kind === "bookmark" && hasBody) return "highlight";
      return kind;
    }
  }
  return hasBody ? "highlight" : "bookmark";
}

/** "Added on Monday, 3 March 2025 21:14:52" → epoch ms, or null. */
function parseAdded(meta: string): number | null {
  const tail = meta.split("|").pop();
  if (!tail) return null;
  // Everything up to the first digit is the localised "Added on"; the date
  // itself is what `Date.parse` has any chance with.
  const stripped = tail.replace(/^[^\d]*/, "").trim();
  if (!stripped) return null;
  const parsed = Date.parse(stripped);
  return Number.isFinite(parsed) ? parsed : null;
}

function field(meta: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const found = pattern.exec(meta);
    if (found?.[1]) return found[1].trim();
  }
  return null;
}

/** One record, or null when it is a separator artefact or unparseable. */
export function parseClipping(block: string): Clipping | null {
  const lines = block.replace(/\r/g, "").split("\n");
  // Leading blank lines are normal — the separator is followed by a newline.
  while (lines.length && !lines[0]!.trim()) lines.shift();
  if (lines.length < 2) return null;

  const { title, author } = splitTitleAuthor(lines[0]!);
  if (!title) return null;

  const meta = lines[1]!.trim();
  const body = lines.slice(2).join("\n").trim();
  const kind = kindOf(meta, body.length > 0);

  // A highlight with no text is a record of nothing.
  if (kind !== "bookmark" && !body) return null;

  return {
    title,
    author,
    kind,
    text: body,
    location: field(meta, [/location\s+([\d-]+)/i, /position\s+([\d-]+)/i, /posición\s+([\d-]+)/i]),
    page: field(meta, [/page\s+([\divxlcIVXLC-]+)/i, /seite\s+([\d-]+)/i, /página\s+([\d-]+)/i]),
    addedAt: parseAdded(meta),
  };
}

/**
 * Parse a whole file.
 *
 * Duplicates are dropped. A Kindle appends rather than rewrites, so extending a
 * highlight by a word leaves both versions in the file, and syncing across
 * devices can write the same mark several times — importing a clippings file
 * that has been growing for five years otherwise produces thousands of near
 * copies. Two records match when the book and the text match exactly; the
 * later one wins, because that is the one the reader ended up with.
 */
export function parseClippings(content: string): Clipping[] {
  const seen = new Map<string, Clipping>();

  for (const block of content.split(SEPARATOR)) {
    const clipping = parseClipping(block);
    if (!clipping) continue;
    const key = `${clipping.title}${KEY_SEP}${clipping.kind}${KEY_SEP}${clipping.text}`;
    const previous = seen.get(key);
    if (!previous || (clipping.addedAt ?? 0) >= (previous.addedAt ?? 0)) {
      seen.set(key, clipping);
    }
  }

  return [...seen.values()];
}

/** What came in, grouped the way somebody would want to see it. */
export interface ClippingBook {
  title: string;
  author: string | null;
  highlights: Clipping[];
  notes: Clipping[];
  bookmarks: number;
}

export function groupByBook(clippings: Clipping[]): ClippingBook[] {
  const books = new Map<string, ClippingBook>();

  for (const clipping of clippings) {
    let book = books.get(clipping.title);
    if (!book) {
      book = {
        title: clipping.title,
        author: clipping.author,
        highlights: [],
        notes: [],
        bookmarks: 0,
      };
      books.set(clipping.title, book);
    }
    // The first record with an author names the book; later ones often omit it.
    book.author ??= clipping.author;
    if (clipping.kind === "highlight") book.highlights.push(clipping);
    else if (clipping.kind === "note") book.notes.push(clipping);
    else book.bookmarks += 1;
  }

  return [...books.values()].sort((a, b) => b.highlights.length - a.highlights.length);
}
