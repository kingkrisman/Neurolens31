import { useSyncExternalStore } from "react";
import { scopedKey } from "./storage-scope";
import type { PageLayout } from "./page-layout";

/**
 * One book flipped to pages or to scrolling, remembered on this device.
 *
 * Kept out of the reading profile on purpose: the profile follows the account
 * and says how someone likes to read in general. "This particular PDF, but in
 * pages" is about one book on one screen. Scoped per account, like the books.
 */

const KEY = "neurolens-layouts";
const EMPTY: Record<string, PageLayout> = {};
const listeners = new Set<() => void>();

function rawValue(): string | null {
  try {
    return localStorage.getItem(scopedKey(KEY));
  } catch {
    return null;
  }
}

function parse(raw: string | null): Record<string, PageLayout> {
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, PageLayout>) : EMPTY;
  } catch {
    return EMPTY;
  }
}

/**
 * Cached by the stored string rather than held until told to forget. A sign-in
 * changes which key is read and "erase everything" deletes it; comparing what
 * is actually stored follows both without either having to know about this.
 */
let cachedRaw: string | null | undefined;
let cached: Record<string, PageLayout> = EMPTY;
function snapshot(): Record<string, PageLayout> {
  const raw = rawValue();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = parse(raw);
  }
  return cached;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The layout this book was flipped to, or null if it follows the setting. */
export function useBookLayout(bookKey: string): PageLayout | null {
  const all = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  return all[bookKey] ?? null;
}

export function setBookLayout(bookKey: string, layout: PageLayout | null): void {
  const next = { ...parse(rawValue()) };
  if (layout) next[bookKey] = layout;
  else delete next[bookKey];
  try {
    localStorage.setItem(scopedKey(KEY), JSON.stringify(next));
  } catch {
    // Private mode or full storage: nothing to remember it in. The flip is
    // lost on reload, which is the honest outcome.
  }
  for (const listener of listeners) listener();
}
