/**
 * Whether a reader has said their library may leave this device.
 *
 * Deliberately separate from the code that reads the library and queues it.
 * This half carries the promise — everyone who used NeuroLens before accounts
 * was told their files stayed on their device — and a promise is worth keeping
 * in a file with no dependencies, that can be tested on its own, and whose every
 * failure path falls towards asking again rather than towards uploading.
 *
 * There is no value that means "yes" by default. A missing record, an
 * unreadable one, a storage that throws: all of them mean the question has not
 * been answered, and the question gets asked.
 */

export type UploadChoice = "uploaded" | "declined";

const CHOICE_PREFIX = "neurolens-upload-choice:";
const DECLINED_KEY = "neurolens-upload-declined";

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * The decision for this account on this device, or null if never made.
 *
 * Keyed by account rather than device: somebody with two accounts is making two
 * different decisions, and the second must not inherit the first.
 */
export function uploadChoice(userId: string): UploadChoice | null {
  try {
    const value = storage()?.getItem(CHOICE_PREFIX + userId);
    return value === "uploaded" || value === "declined" ? value : null;
  } catch {
    return null;
  }
}

export function rememberChoice(userId: string, choice: UploadChoice): void {
  try {
    storage()?.setItem(CHOICE_PREFIX + userId, choice);
  } catch {
    // The question is asked again next time, which is a far better failure than
    // uploading without being asked.
  }
}

/** Book keys the reader chose to keep off their account. */
export function declinedKeys(): Set<string> {
  try {
    const raw = storage()?.getItem(DECLINED_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(parsed) ? (parsed as string[]) : []);
  } catch {
    return new Set();
  }
}

export function rememberDeclined(keys: string[]): void {
  try {
    storage()?.setItem(DECLINED_KEY, JSON.stringify([...new Set(keys)]));
  } catch {
    /* the decision itself is still recorded; only the per-book detail is lost */
  }
}

/** True when this book was kept off the account and must not be created there. */
export function isDeclined(bookKey: string): boolean {
  return declinedKeys().has(bookKey);
}
