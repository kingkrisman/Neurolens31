import { searchBook } from "../book-search.ts";
import { paginateLongText, splitTextChapters } from "../chapters.ts";
import type { Highlight, Session } from "../types.ts";
import type { ClippingBook } from "./kindle-clippings.ts";

/**
 * Put imported highlights where they belong.
 *
 * A Kindle clipping is a quote and a title, nothing more — no chapter, no line
 * number, and Kindle's own "location" is meaningless outside a Kindle. A
 * highlight in this app is a position: a section, a line, and offsets within
 * it. Bridging the two means finding the quoted words in the book's own text,
 * which only works when the book is actually here.
 *
 * So each clipping ends one of three ways, and the difference is reported
 * rather than smoothed over:
 *
 *  - **anchored** — the book is in the library and the passage was found. It
 *    becomes a real highlight, on the page, searchable and synced.
 *  - **kept** — the book is not here. The quote is preserved as a bookmark
 *    holding its own text, because a highlight you can still read is worth
 *    more than one dropped for want of somewhere to put it.
 *  - **not found** — the book is here but the passage is not, which almost
 *    always means a different edition. Counted and reported, never silently
 *    discarded.
 */

export interface AnchorResult {
  anchored: number;
  kept: number;
  notFound: number;
  matchedBooks: number;
}

/** Just enough of the store to do this, so the function stays testable. */
export interface AnchorTarget {
  sessions: Session[];
  highlights: Record<string, Highlight[]>;
  bookmarks: { id: string; title: string; content: string; progress: number; savedAt: number }[];
}

export interface AnchorPlan {
  /** New highlights per book key, to merge into what is already stored. */
  highlights: Record<string, Highlight[]>;
  bookmarks: AnchorTarget["bookmarks"];
  result: AnchorResult;
}

/** The store keys highlights by the first 48 characters of the text. */
function bookKey(text: string): string {
  return text.trim().slice(0, 48) || "default";
}

/** Loose title match: punctuation and case differ constantly between editions. */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[‘’“”]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findSession(sessions: Session[], title: string): Session | null {
  const wanted = normalizeTitle(title);
  if (!wanted) return null;

  let best: Session | null = null;
  for (const session of sessions) {
    const have = normalizeTitle(session.title);
    if (!have) continue;
    if (have === wanted) return session;
    // A Kindle title is often the full subtitle where the local one is short,
    // or the other way round. Containment catches both without matching two
    // unrelated books, so long as the shorter side is substantial.
    const shorter = have.length < wanted.length ? have : wanted;
    if (shorter.length >= 8 && (have.includes(wanted) || wanted.includes(have))) {
      best ??= session;
    }
  }
  return best;
}

/**
 * The sections the reader would render this book as.
 *
 * A highlight is addressed by section index, so this has to split the text the
 * same way the reader does or every anchor lands in the wrong chapter — and
 * nothing would throw when it did. Mirrors `searchSections` in `reader.tsx`:
 * declared chapters if there are any, otherwise the automatic pagination a
 * long book gets, otherwise the whole text as one section.
 *
 * PDFs return null rather than a guess. The reader sections those by *page*,
 * and a page list cannot be recovered from the flattened text stored on the
 * session — so any anchor computed here would be confidently wrong. Their
 * clippings are kept as notes instead.
 */
function sectionsOf(session: Session): string[] | null {
  if (session.kind === "pdf") return null;

  const declared = splitTextChapters(session.content);
  const chapters = declared.length > 0 ? declared : paginateLongText(session.content);
  if (chapters.length > 1) return chapters.map((chapter) => chapter.body);
  return [session.content];
}

/**
 * Kindle wraps quotes oddly and editions differ in punctuation, so the search
 * uses a distinctive middle slice rather than the whole passage. Long enough to
 * be unique, short enough to survive a stray ellipsis at either end.
 */
function needleFor(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= 60) return clean;
  const start = Math.floor((clean.length - 60) / 2);
  const slice = clean.slice(start, start + 60);
  // Start and end on word boundaries so the search is not hunting a fragment.
  return slice.replace(/^\S*\s/, "").replace(/\s\S*$/, "") || clean.slice(0, 60);
}

export function planAnchoring(books: ClippingBook[], target: AnchorTarget): AnchorPlan {
  const highlights: Record<string, Highlight[]> = {};
  const bookmarks: AnchorTarget["bookmarks"] = [];
  let anchored = 0;
  let kept = 0;
  let notFound = 0;
  const matched = new Set<string>();

  for (const book of books) {
    const session = findSession(target.sessions, book.title);

    const sections = session?.content?.trim() ? sectionsOf(session) : null;

    if (!session || !sections) {
      // No text to search. Keep the quotes so they are not lost.
      for (const clipping of book.highlights) {
        bookmarks.push({
          id: `kindle-${book.title}-${clipping.text.slice(0, 24)}-${clipping.addedAt ?? 0}`,
          title: book.title,
          content: clipping.text,
          progress: 0,
          savedAt: clipping.addedAt ?? Date.now(),
        });
        kept += 1;
      }
      continue;
    }

    const key = bookKey(session.content);
    const existing = new Set(
      (target.highlights[key] ?? []).map((mark) => `${mark.section}:${mark.lineIdx}:${mark.start}`),
    );
    const added: Highlight[] = [];

    for (const clipping of book.highlights) {
      const hits = searchBook(sections, needleFor(clipping.text), { limit: 1 });
      const hit = hits[0];
      if (!hit) {
        notFound += 1;
        continue;
      }

      const identity = `${hit.section}:${hit.lineIdx}:${hit.start}`;
      // Importing the same file twice should not double every mark.
      if (existing.has(identity)) continue;
      existing.add(identity);

      added.push({
        lineIdx: hit.lineIdx,
        section: hit.section,
        start: hit.start,
        end: hit.end,
        text: hit.text,
        color: "butter",
        at: clipping.addedAt ?? Date.now(),
      });
      anchored += 1;
    }

    if (added.length > 0) {
      highlights[key] = added;
      matched.add(book.title);
    }
  }

  return {
    highlights,
    bookmarks,
    result: { anchored, kept, notFound, matchedBooks: matched.size },
  };
}

/**
 * Work out the plan and apply it.
 *
 * Split from `planAnchoring` so the decision can be tested without a store —
 * which matters, because getting a section wrong puts somebody's highlight on
 * the wrong page and nothing throws when it happens.
 */
export function anchorClippings(
  books: ClippingBook[],
  store: AnchorTarget & {
    addHighlight?: unknown;
    applyImportedMarks?: (plan: Pick<AnchorPlan, "highlights" | "bookmarks">) => void;
  },
): AnchorResult {
  const plan = planAnchoring(books, store);
  store.applyImportedMarks?.({ highlights: plan.highlights, bookmarks: plan.bookmarks });
  return plan.result;
}
