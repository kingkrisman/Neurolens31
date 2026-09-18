import { enqueue, type PendingWrite } from "./queue.ts";

/**
 * What the store calls when something worth syncing changes.
 *
 * A deliberately thin seam. The store imports only this; this imports only the
 * queue. Nothing here reaches back into the store, and the engine is not
 * involved at all — which is what keeps `store -> sync -> store` from becoming
 * a cycle, and what lets every one of these calls be a no-op for a reader who
 * is not signed in.
 *
 * Queueing is unconditional on purpose. Whether a write is worth sending is the
 * engine's decision, made when it drains the queue; deciding it here would mean
 * the store had to know about sessions and connectivity, and an edit made in
 * the second before a session resolves would be dropped.
 */

let armed = false;

/** Turned on when a reader signs in, off when they leave. */
export function armSync(on: boolean): void {
  armed = on;
}

function record(write: PendingWrite): void {
  if (!armed) return;
  enqueue(write);
}

/** A book was added, or its text or title changed. */
export function bookChanged(bookKey: string): void {
  record({ kind: "book", localId: bookKey });
}

/**
 * Reading position moved.
 *
 * Separate from `bookChanged` because it happens constantly and writes three
 * columns rather than the whole book — sending a novel's text every time
 * somebody scrolls would be absurd.
 */
export function progressChanged(bookKey: string): void {
  record({ kind: "progress", localId: bookKey });
}

export function highlightsChanged(bookKey: string): void {
  record({ kind: "highlights", localId: bookKey });
}

export function inkChanged(bookKey: string, section: number): void {
  record({ kind: "ink", localId: bookKey, section });
}

export function bookmarksChanged(): void {
  record({ kind: "bookmarks" });
}

export function settingsChanged(): void {
  record({ kind: "settings" });
}
