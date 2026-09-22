/**
 * Whose data this is, on a device that more than one person may use.
 *
 * Local storage belongs to the browser, not to an account. Every reading key
 * was a single name — `neurolens-sessions` and the rest — so two people signing
 * in on one laptop shared one library: the second saw the first's books,
 * highlights and drawings, and any edit landed on top of them. On a family
 * computer that is somebody reading another person's private library.
 *
 * So every key is suffixed with the account it belongs to. Nothing is deleted
 * to achieve it, which matters: clearing on sign-out would destroy the books of
 * a reader who declined to upload, and losing somebody's library is a worse
 * failure than the one being fixed.
 *
 * Signed out there is no scope, and the bare keys are used. That is where data
 * from before accounts existed still lives, and `adoptLegacy` is how it becomes
 * the first account's — once, and only for an account that has none of its own.
 */

let scope: string | null = null;

/** Keys holding reading data, which is what has to be kept apart per account. */
const SCOPED = [
  "neurolens-sessions",
  "neurolens-highlights",
  "neurolens-ink",
  "neurolens-bookmarks",
  "neurolens-profile",
  "neurolens-mode",
  "neurolens-target-wpm",
  "neurolens-locks",
  "neurolens-saved-profiles",
  "neurolens-adaptive-memory",
  "neurolens-marker-color",
  "neurolens-ink-tool",
  "neurolens-ink-color",
  "neurolens-book-ids",
  // Account facts — per reader, like everything above. Two accounts on one
  // device must not share "has answered the survey" or a face.
  "neurolens-meta",
] as const;

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** The account whose data is currently in view, or null when signed out. */
export function currentScope(): string | null {
  return scope;
}

export function setScope(userId: string | null): void {
  scope = userId;
}

/**
 * The storage key for the account in scope.
 *
 * Unscoped keys are left exactly as they were, so a build without accounts and
 * this one read the same data — and so the pre-account library is still there
 * to be offered up rather than silently orphaned.
 */
export function scopedKey(key: string): string {
  if (!scope) return key;
  return `${key}::${scope}`;
}

/** Whether this account has any reading data of its own on this device. */
export function hasScopedData(userId: string): boolean {
  const store = storage();
  if (!store) return false;
  try {
    return SCOPED.some((key) => store.getItem(`${key}::${userId}`) !== null);
  } catch {
    // Reading can throw even when the object exists — a blocked or full store.
    // Answering "no data" is safe: it means an empty library, never somebody
    // else's, and it must not take the sign-in down with it.
    return false;
  }
}

/**
 * Give the pre-account data to this account, once.
 *
 * Only for an account with nothing of its own, and only while unscoped data
 * exists — so the first person to sign in on a device keeps the library they
 * were already reading, and the second person does not inherit it.
 *
 * Copied rather than moved. If this turns out to be the wrong account, the
 * original is still there for the right one.
 */
export function adoptLegacy(userId: string): boolean {
  const store = storage();
  if (!store || hasScopedData(userId)) return false;

  let adopted = false;
  for (const key of SCOPED) {
    try {
      const value = store.getItem(key);
      if (value === null) continue;
      store.setItem(`${key}::${userId}`, value);
      adopted = true;
    } catch {
      // Blocked, or out of room. Better to adopt part of a library, or none,
      // than to fail the sign-in over it.
    }
  }
  return adopted;
}

/** Remove one account's data from this device, leaving every other account's. */
export function clearScope(userId: string): void {
  const store = storage();
  if (!store) return;
  for (const key of SCOPED) {
    try {
      store.removeItem(`${key}::${userId}`);
    } catch {
      /* nothing to remove */
    }
  }
}

/** Every key this module namespaces, for the store and for tests. */
export const SCOPED_KEYS = SCOPED;
