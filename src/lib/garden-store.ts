import { useSyncExternalStore } from "react";
import { scopedKey } from "./storage-scope";
import {
  EMPTY_GARDEN,
  describeGrowth,
  normalizeGarden,
  withBloom,
  withChapterFinished,
  type Garden,
} from "./garden";

/**
 * The garden, kept in this browser under the reader's account scope. See
 * `garden.ts` for why it is never synced.
 */

const KEY = "neurolens-garden";
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
let cached: Garden = EMPTY_GARDEN;
function snapshot(): Garden {
  const raw = rawValue();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cached = raw ? normalizeGarden(JSON.parse(raw)) : EMPTY_GARDEN;
    } catch {
      cached = EMPTY_GARDEN;
    }
  }
  return cached;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useGarden(): Garden {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY_GARDEN);
}

function save(next: Garden): void {
  try {
    localStorage.setItem(scopedKey(KEY), JSON.stringify(next));
  } catch {
    // Nowhere to keep it. The garden simply does not grow on this device,
    // which is better than a reading session failing over a flower.
  }
  for (const listener of listeners) listener();
}

type Growth = { id: string; title: string; section: number };

/** Returns the sentence to show, or null if nothing new happened. */
export function recordChapterFinished(growth: Growth): string | null {
  const before = snapshot();
  const after = withChapterFinished(before, { ...growth, at: Date.now() });
  if (after === before) return null;
  save(after);
  return describeGrowth(before, after, growth.id);
}

export function recordBloom(growth: Growth): string | null {
  const before = snapshot();
  const after = withBloom(before, { ...growth, at: Date.now() });
  if (after === before) return null;
  save(after);
  return describeGrowth(before, after, growth.id);
}
