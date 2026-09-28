import { useSyncExternalStore } from "react";
import { scopedKey } from "./storage-scope";
import { EMPTY_RETURNS, normalizeReturns, withRetired, withSeen, type Returns } from "./resurface";

/**
 * Which highlights have come back, and when — kept in this browser under the
 * reader's account scope. It holds ids and dates only, never a passage's text,
 * and it is not synced: seeing a passage again on a phone and not on a laptop
 * costs nothing.
 */

const KEY = "neurolens-returns";
const listeners = new Set<() => void>();

function rawValue(): string | null {
  try {
    return localStorage.getItem(scopedKey(KEY));
  } catch {
    return null;
  }
}

// Cached by the stored string, so a sign-in (different scope) or "erase
// everything" (key removed) is followed without anyone having to say so.
let cachedRaw: string | null | undefined;
let cached: Returns = EMPTY_RETURNS;
function snapshot(): Returns {
  const raw = rawValue();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cached = raw ? normalizeReturns(JSON.parse(raw)) : EMPTY_RETURNS;
    } catch {
      cached = EMPTY_RETURNS;
    }
  }
  return cached;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useReturns(): Returns {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY_RETURNS);
}

function save(next: Returns): void {
  try {
    localStorage.setItem(scopedKey(KEY), JSON.stringify(next));
  } catch {
    // Nowhere to keep it: the passage may come back again sooner than it
    // should, which is harmless.
  }
  for (const listener of listeners) listener();
}

export function markSeen(id: string): void {
  save(withSeen(snapshot(), id, Date.now()));
}

export function markRetired(id: string): void {
  save(withRetired(snapshot(), id, Date.now()));
}
