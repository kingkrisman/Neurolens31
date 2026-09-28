import type { Highlight } from "./types";

/**
 * Passages the reader marked, brought back a few days later.
 *
 * Marking a sentence is a decision that it mattered, and the usual fate of a
 * highlight is never to be looked at again. Seeing it once more after a gap —
 * three days, a week, three weeks, two months — is the spacing memory research
 * keeps finding works, and all it asks is a glance.
 *
 * What it deliberately does not have: a streak, a count of days missed, or
 * anything that goes red. Missing a day means the passage waits for the next
 * visit; "Not this one" retires it for good. A few a day at most, so it stays a
 * pleasure rather than a queue.
 *
 * Kept on this device only (see resurface-store.ts), like the garden.
 */

/** Days until a passage comes back, after it was marked and after each return. */
export const INTERVALS_DAYS = [3, 7, 21, 60] as const;
/** How many passages a day, at most. */
export const PER_DAY = 3;
/** Shorter than this is a word or two — nothing to come back to. */
const MIN_CHARS = 12;
const DAY_MS = 86_400_000;

export interface ReturnMark {
  /** How many times it has come back. At INTERVALS_DAYS.length it is retired. */
  step: number;
  seenAt: number;
}

export interface Returns {
  marks: Record<string, ReturnMark>;
  /** The local day `shown` counts for, as YYYY-MM-DD. */
  day: string;
  shown: number;
}

export const EMPTY_RETURNS: Returns = { marks: {}, day: "", shown: 0 };

export interface DuePassage {
  id: string;
  bookKey: string;
  mark: Highlight;
  due: number;
}

/** FNV-1a, so an id does not carry the opening of somebody's book. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function passageId(bookKey: string, mark: Highlight): string {
  return `${hash(bookKey)}:${mark.at}:${mark.start}`;
}

/** The local calendar day, so "today" turns over at the reader's midnight. */
export function localDay(now: number): string {
  const date = new Date(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** When a passage is next due, or null once it has been retired. */
export function dueAt(mark: Highlight, state: ReturnMark | undefined): number | null {
  const step = state?.step ?? 0;
  const days = INTERVALS_DAYS[step];
  if (days === undefined) return null;
  return (state ? state.seenAt : mark.at) + days * DAY_MS;
}

/** How many more may come back today. */
export function leftToday(returns: Returns, now: number): number {
  return returns.day === localDay(now) ? Math.max(0, PER_DAY - returns.shown) : PER_DAY;
}

/**
 * The passages to bring back now, longest-waiting first.
 *
 * Ordered by when each fell due, then by when it was marked, so the same
 * visit twice shows the same passages — a deck that reshuffled on every
 * render would feel random rather than kept.
 */
export function duePassages(
  highlights: Record<string, Highlight[]>,
  returns: Returns,
  now: number,
): DuePassage[] {
  const room = leftToday(returns, now);
  if (room === 0) return [];
  const due: DuePassage[] = [];
  for (const [bookKey, marks] of Object.entries(highlights)) {
    if (!Array.isArray(marks)) continue;
    for (const mark of marks) {
      if (typeof mark?.text !== "string" || mark.text.trim().length < MIN_CHARS) continue;
      if (typeof mark.at !== "number" || !Number.isFinite(mark.at)) continue;
      const id = passageId(bookKey, mark);
      const when = dueAt(mark, returns.marks[id]);
      if (when === null || when > now) continue;
      due.push({ id, bookKey, mark, due: when });
    }
  }
  due.sort((a, b) => a.due - b.due || a.mark.at - b.mark.at);
  return due.slice(0, room);
}

/** Seen: it comes back after the next, longer interval, and counts for today. */
export function withSeen(returns: Returns, id: string, now: number): Returns {
  const today = localDay(now);
  const step = (returns.marks[id]?.step ?? 0) + 1;
  return {
    marks: { ...returns.marks, [id]: { step, seenAt: now } },
    day: today,
    shown: (returns.day === today ? returns.shown : 0) + 1,
  };
}

/** "Not this one": never again. Counts for today like any other. */
export function withRetired(returns: Returns, id: string, now: number): Returns {
  const seen = withSeen(returns, id, now);
  return {
    ...seen,
    marks: { ...seen.marks, [id]: { step: INTERVALS_DAYS.length, seenAt: now } },
  };
}

/** Anything unreadable becomes a clean start rather than a crash. */
export function normalizeReturns(value: unknown): Returns {
  if (!value || typeof value !== "object") return EMPTY_RETURNS;
  const raw = value as Partial<Returns>;
  const marks: Record<string, ReturnMark> = {};
  if (raw.marks && typeof raw.marks === "object") {
    for (const [id, entry] of Object.entries(raw.marks)) {
      const step = (entry as ReturnMark | undefined)?.step;
      const seenAt = (entry as ReturnMark | undefined)?.seenAt;
      if (Number.isInteger(step) && step! >= 0 && Number.isFinite(seenAt)) {
        marks[id] = { step: step!, seenAt: seenAt! };
      }
    }
  }
  return {
    marks,
    day: typeof raw.day === "string" ? raw.day : "",
    shown: Number.isInteger(raw.shown) && raw.shown! > 0 ? raw.shown! : 0,
  };
}

/** "Marked 12 days ago", in words a person would use. */
export function markedAgo(at: number, now: number): string {
  const days = Math.floor((now - at) / DAY_MS);
  if (days < 1) return "Marked today";
  if (days === 1) return "Marked yesterday";
  if (days < 14) return `Marked ${days} days ago`;
  if (days < 60) return `Marked ${Math.round(days / 7)} weeks ago`;
  if (days < 365) return `Marked ${Math.round(days / 30)} months ago`;
  const years = Math.round(days / 365);
  return `Marked ${years === 1 ? "a year" : `${years} years`} ago`;
}
