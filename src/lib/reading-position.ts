import { paginateLongText, splitTextChapters } from "./chapters.ts";
import { splitPdfPages } from "./pdf-pages.ts";
import type { Session } from "./types.ts";

/**
 * Where a reader is in a book, and how long the rest of this part will take.
 *
 * Both numbers exist to answer a question the app could not answer before:
 * *should I start now?* A percentage cannot answer it — "34% through chapter
 * four" is a fact about the book, not about the next few minutes of your life.
 * "About nine minutes left in this Part" is a decision someone can actually
 * make, which matters especially for readers whose sense of elapsed time is
 * unreliable.
 *
 * Everything is derived from what a Session already stores. No new tracking.
 */

export interface ReadingPosition {
  /** 1-based, or 0 when the book is not divided. */
  part: number;
  totalParts: number;
  /** Words between here and the end of the current part. */
  wordsLeft: number;
  /** Minutes for those words at this reader's pace, rounded. Null if unknown. */
  minutesLeft: number | null;
  /** Whether the reader had reached the end of the book. */
  finished: boolean;
  /**
   * How far through the current part, 0–1 — the reader's scroll within it.
   *
   * Separate from the book-wide progress a Session stores, and necessary
   * because the reader restores scroll as a fraction of whatever section is
   * open. Handing it the book-wide figure would scroll a third of the way into
   * Part 2 when the reader had actually stopped at its start.
   */
  within: number;
}

/** Pace floor, so a stalled session cannot claim an eight-hour part. */
const MIN_WPM = 80;

function wordsIn(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

/**
 * Divide a book the way the reader divides it.
 *
 * Declared chapters first, then automatic Parts for anything long enough to
 * need them, and a single undivided section otherwise — the same order the
 * reader itself uses, so the Part number shown here is the Part number shown
 * there.
 */
export function sectionsOf(text: string, kind?: string): string[] {
  if (kind === "pdf") {
    const pages = splitPdfPages(text);
    if (pages.length) return pages;
  }
  const declared = splitTextChapters(text);
  if (declared.length > 1) return declared.map((chapter) => chapter.body);
  const paginated = paginateLongText(text);
  if (paginated.length > 1) return paginated.map((part) => part.body);
  return [text];
}

export function positionOf(session: Session, targetWpm = 220): ReadingPosition {
  const sections = sectionsOf(session.content, session.kind);
  // A scroll fraction of the section that was open — never of the book. The
  // reader writes it from `scrollTop / scrollHeight` of one part, so reading it
  // as a book-wide figure puts someone 30% into Part 1 at "Part 2 of 6": the
  // number is real, the meaning was wrong.
  const within = Math.min(1, Math.max(0, session.progress ?? 0));

  // Pace: what this reader actually did, falling back to their target. A
  // measured pace from a two-minute sitting is noisy, so the floor guards
  // against a stalled session projecting an absurd figure.
  const wpm = Math.max(MIN_WPM, session.currentWpm || targetWpm || 220);

  if (sections.length <= 1) {
    const total = wordsIn(session.content);
    const left = Math.max(0, Math.round(total * (1 - within)));
    return {
      part: 0,
      totalParts: 1,
      wordsLeft: left,
      minutesLeft: left ? Math.max(1, Math.round(left / wpm)) : 0,
      finished: within >= 0.995,
      within,
    };
  }

  // Which part, from what the session recorded. Sessions saved before parts
  // were tracked have no answer, and Part 1 is the only honest guess — better
  // than inferring a part from a fraction that does not encode one.
  const part = Math.min(sections.length, Math.max(1, Math.round(session.section ?? 1)));
  const sectionWords = wordsIn(sections[part - 1] ?? "");
  const left = Math.max(0, Math.round(sectionWords * (1 - within)));

  return {
    part,
    totalParts: sections.length,
    wordsLeft: left,
    minutesLeft: left ? Math.max(1, Math.round(left / wpm)) : 0,
    // Only the end of the last part is the end of the book.
    finished: part >= sections.length && within >= 0.995,
    within,
  };
}

/** "about 9 min left", or null when there is nothing useful to say. */
export function describeTimeLeft(position: ReadingPosition): string | null {
  if (position.finished) return "finished";
  const minutes = position.minutesLeft;
  if (minutes == null || minutes <= 0) return null;
  // Past an hour the estimate is guesswork dressed as precision, so it stops
  // pretending and rounds hard.
  if (minutes >= 60) return `about ${Math.round(minutes / 60)} hr left`;
  return `about ${minutes} min left`;
}

/** "Part 4 of 12", or null for a book that is not divided. */
export function describePart(position: ReadingPosition): string | null {
  if (!position.part || position.totalParts <= 1) return null;
  return `Part ${position.part} of ${position.totalParts}`;
}

/**
 * Where a tap on Continue should actually land.
 *
 * Usually where the reader stopped. The exception is a part they finished
 * without turning the page: sending them back to the top of it — which is what
 * the reader does with a scroll fraction that close to the end — replays
 * fifteen minutes they already read. Offering the next part instead is what the
 * completion card at the bottom of that part offered them.
 */
export function resumeTarget(position: ReadingPosition): { part: number; within: number } {
  const done = position.within >= 0.98;
  if (done && position.part > 0 && position.part < position.totalParts) {
    return { part: position.part + 1, within: 0 };
  }
  // A finished last part has nowhere to go but its own start.
  return { part: position.part, within: done ? 0 : position.within };
}
