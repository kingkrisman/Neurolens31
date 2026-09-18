import { legacyBookKey } from "./rows.ts";

/**
 * Which local book is which remote book.
 *
 * The store keys a book by the first 48 characters of its text, and its
 * highlights and ink are filed under that key. The database keys a book by a
 * uuid. Neither can be changed without disturbing the other — rewriting the
 * store's model would touch the reader, the library, the highlight list and the
 * ink layer at once — so this sits between them and remembers the pairing.
 *
 * Kept on the device rather than derived, because it cannot be derived: the
 * uuid is assigned by the database on first insert and there is nothing in the
 * text that predicts it.
 *
 * It is a cache, not a record. Losing it costs a re-pull, which re-learns every
 * pairing from the titles and text that come back; it never costs a book.
 */

const KEY = "neurolens-book-ids";

type Pairs = Record<string, string>;

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function read(): Pairs {
  try {
    const raw = storage()?.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return parsed && typeof parsed === "object" ? (parsed as Pairs) : {};
  } catch {
    return {};
  }
}

function write(pairs: Pairs): void {
  try {
    storage()?.setItem(KEY, JSON.stringify(pairs));
  } catch {
    // Without this the app still works; every lookup simply misses and the
    // book is treated as new, which the caller resolves by matching on title.
  }
}

/** The remote id for this text, if this device has seen it paired. */
export function remoteIdFor(text: string): string | null {
  return read()[legacyBookKey(text)] ?? null;
}

/** The local key for a remote id, for going the other way after a pull. */
export function localKeyFor(remoteId: string): string | null {
  const pairs = read();
  for (const [key, id] of Object.entries(pairs)) {
    if (id === remoteId) return key;
  }
  return null;
}

export function remember(text: string, remoteId: string): void {
  const pairs = read();
  pairs[legacyBookKey(text)] = remoteId;
  write(pairs);
}

/** Forget one pairing — after the book is deleted, so the key can be reused. */
export function forget(text: string): void {
  const pairs = read();
  delete pairs[legacyBookKey(text)];
  write(pairs);
}

/**
 * Drop pairings whose remote book no longer exists.
 *
 * Run after a pull with the ids that came back. A book deleted on another
 * device would otherwise keep its pairing here forever, and the next edit would
 * be written against a row that is gone — which fails quietly, because
 * updating no rows is not an error.
 */
export function keepOnly(remoteIds: string[]): void {
  const live = new Set(remoteIds);
  const pairs = read();
  let changed = false;
  for (const [key, id] of Object.entries(pairs)) {
    if (live.has(id)) continue;
    delete pairs[key];
    changed = true;
  }
  if (changed) write(pairs);
}

export function clearPairs(): void {
  try {
    storage()?.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}

/** Every pairing, for the upload that has to walk all of them at once. */
export function allPairs(): Pairs {
  return read();
}
