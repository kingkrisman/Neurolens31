import { useSyncExternalStore } from "react";
import { scopedKey } from "./storage-scope";
import * as sync from "./sync/notify";
import {
  EMPTY_GARDEN,
  describeGrowth,
  mergeSynced,
  normalizeGarden,
  syncedGarden,
  withBloom,
  withChapterFinished,
  type Garden,
  type GardenPlant,
  type SyncedPlant,
} from "./garden";

/**
 * The garden, kept in this browser under the reader's account scope. See
 * `garden.ts` for what of it reaches the account, and why no title does.
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

type Growth = { id: string; title: string; section: number; book?: string | null };

function record(
  growth: Growth,
  apply: (garden: Garden, growth: Growth & { at: number }) => Garden,
): string | null {
  const before = snapshot();
  const after = apply(before, { ...growth, at: Date.now() });
  if (after === before) return null;
  save(after);
  // Only a plant whose book is in the account travels; for any other, the
  // settings write that follows carries nothing new about it.
  if (growth.book) sync.settingsChanged();
  return describeGrowth(before, after, after.plants.find((p) => p.book && p.book === growth.book)?.id ?? growth.id);
}

/** Returns the sentence to show, or null if nothing new happened. */
export function recordChapterFinished(growth: Growth): string | null {
  return record(growth, withChapterFinished);
}

export function recordBloom(growth: Growth): string | null {
  return record(growth, withBloom);
}

/** What to send to the account: plants for books that are in it, untitled. */
export function accountGarden(bookOf: (plant: GardenPlant) => string | null): SyncedPlant[] {
  return syncedGarden(snapshot(), bookOf);
}

/** Fold in what the account has. True when this device's garden changed. */
export function mergeAccountGarden(
  incoming: SyncedPlant[],
  place: (book: string) => { id: string; title: string } | null,
): boolean {
  const before = snapshot();
  const after = mergeSynced(before, incoming, place);
  if (after === before) return false;
  save(after);
  return true;
}
