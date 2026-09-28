import type { ContentKind } from "./types.ts";

/**
 * Turning pages instead of scrolling.
 *
 * A tester asked for it in so many words: "a format more like the Kindle, with
 * turning pages, for fiction — but long formatting like this when reading
 * documents." So the default follows the material. A book with chapters opens
 * in pages; a PDF, a pasted passage, a psalm or a poem keeps scrolling. Either
 * can be flipped for one book, or overridden everywhere from Settings.
 *
 * Pages are CSS columns, one screen wide, and turning is a horizontal scroll by
 * exactly one screen. That is how web e-readers do it, and it is the only way
 * that survives this app's premise: the reader changes font, size and spacing
 * constantly, and columns re-flow to fit where fixed page breaks would not.
 *
 * Everything here is pure — geometry and rules — so it is tested on its own.
 */

export type PageLayoutChoice = "auto" | "pages" | "scroll";
export type PageLayout = "pages" | "scroll";

export const PAGE_LAYOUT_CHOICES: { id: PageLayoutChoice; label: string; hint: string }[] = [
  { id: "auto", label: "Auto", hint: "Pages for books, scrolling for documents." },
  { id: "pages", label: "Pages", hint: "Turn pages, like an e-reader." },
  { id: "scroll", label: "Scroll", hint: "One long page you scroll." },
];

export function isPageLayoutChoice(value: unknown): value is PageLayoutChoice {
  return value === "auto" || value === "pages" || value === "scroll";
}

/**
 * The layout a book opens in.
 *
 * "A book" is text split into chapters — which is what every Gutenberg,
 * Standard Ebooks and EPUB title becomes, and what a pasted paragraph or a
 * work document almost never is. A PDF has its own printed pages and stays as
 * it is; Bible passages and poems are short and meant to be scrolled.
 */
export function resolvePageLayout(
  choice: PageLayoutChoice,
  book: { kind: ContentKind; chaptered: boolean },
  override?: PageLayout | null,
): PageLayout {
  if (override) return override;
  if (choice !== "auto") return choice;
  return book.kind === "text" && book.chaptered ? "pages" : "scroll";
}

export interface PageMetrics {
  /** Horizontal padding each side of the text on every page. */
  pad: number;
  /** Width of the text column — never wider than a comfortable line. */
  column: number;
  /** Gap between columns: both pads, so each page is exactly one screen. */
  gap: number;
  /** Distance from one page to the next. */
  step: number;
}

/**
 * Column geometry for a pane `width` wide.
 *
 * The text is centred at no more than `maxText`, the same measure the scroll
 * view uses, and the gap between columns is both side margins. That makes one
 * column plus one gap exactly the pane width, so page N always starts at
 * `N * width` and a turn is a whole-screen move with nothing peeking in.
 */
export function pageMetrics(width: number, maxText: number, minPad: number): PageMetrics {
  const safe = Math.max(1, width);
  const column = Math.max(1, Math.min(maxText, safe - 2 * minPad));
  const pad = (safe - column) / 2;
  return { pad, column, gap: 2 * pad, step: safe };
}

/** How many pages the laid-out content fills. */
export function countPages(scrollWidth: number, step: number): number {
  if (step <= 0) return 1;
  // Rounded, not ceiled: sub-pixel column widths leave scrollWidth a fraction
  // over a whole number of pages, and ceiling that invents a blank last page.
  return Math.max(1, Math.round(scrollWidth / step));
}

/** The page an element sits on, from its offset into the content. */
export function pageOf(offset: number, step: number): number {
  if (step <= 0) return 0;
  // Half a pixel of slack, for sub-pixel column positions just short of a
  // boundary. Real lines never sit there — that is the gap between columns —
  // so this only ever rescues rounding, never moves a genuine line.
  return Math.max(0, Math.floor((offset + 0.5) / step));
}

/**
 * Where a finger swipe lands.
 *
 * A quarter of the page, or a flick, turns it; anything less springs back.
 * The flick threshold matters most: people turn pages with a quick short
 * swipe, and a rule that wanted distance alone felt stuck. May return -1 or
 * `pages` — the caller decides what crossing into the next chapter means.
 */
export function swipeTarget(page: number, dx: number, velocity: number, width: number): number {
  const flicked = Math.abs(velocity) > 0.35 && Math.abs(dx) > 12;
  const far = Math.abs(dx) > width * 0.25;
  if (!flicked && !far) return page;
  return dx < 0 ? page + 1 : page - 1;
}

/**
 * Whether a jump in progress is just a page turn.
 *
 * The reading tracker calls a big fast jump in progress a skip. In pages, one
 * turn of a six-page chapter is a sixth of it in an instant, which looked
 * exactly like skipping — so a move of about one page is a step, however large
 * a fraction of the chapter that page happens to be.
 */
export function isSinglePageTurn(from: number, to: number, pages: number): boolean {
  if (pages <= 1) return false;
  const onePage = 1 / (pages - 1);
  return Math.abs(to - from) <= onePage * 1.5;
}

/** Progress through the section, for either layout. */
export function scrollProgress(node: {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
  dataset?: DOMStringMap;
}): number {
  const paged = node.dataset?.layout === "pages";
  const at = paged ? node.scrollLeft : node.scrollTop;
  const room = paged ? node.scrollWidth - node.clientWidth : node.scrollHeight - node.clientHeight;
  return room > 1 ? Math.min(1, Math.max(0, at / room)) : 1;
}

/**
 * How long a page may sit still before stillness means a pause.
 *
 * Scrolling readers move the page every few seconds, so the tracker calls
 * eight still seconds a pause. In pages the page is *meant* to be still: the
 * eyes move down it and nothing else does until the turn. Left alone, every
 * page read became a long pause, and a few of those set off the "lost your
 * place?" prompt — interrupting the reader for reading.
 *
 * So a page gets the time it should take at the reader's pace, with half as
 * much again for slower passages, inside sensible bounds. Past that, a still
 * page is a pause like any other.
 */
export function pageReadingAllowanceMs(words: number, pages: number, wpm: number): number {
  const perPage = words / Math.max(1, pages);
  const pace = Math.max(60, wpm || 220);
  const expected = (perPage / pace) * 60_000;
  return Math.min(240_000, Math.max(15_000, expected * 1.5));
}
