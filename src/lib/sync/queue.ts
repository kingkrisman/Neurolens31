/**
 * Writes that have not reached the server yet.
 *
 * The app has to keep working on a train, so a write can fail for reasons that
 * are nobody's fault and will stop being true in ten minutes. Losing a
 * highlight because the tunnel was long is not acceptable — marking a passage
 * is a deliberate act, and the reader has already moved on believing it saved.
 *
 * So every write is recorded here first, in localStorage, and removed only once
 * the server has taken it. The queue survives a reload, a crash and a closed
 * laptop, which are the three moments most likely to lose the work.
 *
 * Deliberately not a general-purpose offline database. It holds intents —
 * "this book's highlights now look like this" — not a log of every keystroke,
 * and intents for the same target collapse: the reader cares that their marks
 * are right, not that the journey to right had six steps.
 */

export type PendingWrite =
  | { kind: "book"; localId: string }
  | { kind: "progress"; localId: string }
  | { kind: "highlights"; localId: string }
  | { kind: "ink"; localId: string; section: number }
  | { kind: "bookmarks" }
  | { kind: "settings" };

export interface QueuedWrite {
  write: PendingWrite;
  /** When it was first queued, so a stuck item can be noticed. */
  at: number;
  /** How many times sending it has failed. */
  tries: number;
}

const KEY = "neurolens-sync-queue";

/**
 * A cap, because a device offline for a week with a busy reader should not fill
 * its storage with intents. Oldest first, since the newest state of anything is
 * the one worth keeping and older entries for the same target have usually
 * already collapsed into it.
 */
const MAX_QUEUED = 200;

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** What identifies a write's target, so two for the same thing collapse. */
export function writeKey(write: PendingWrite): string {
  switch (write.kind) {
    case "ink":
      return `ink:${write.localId}:${write.section}`;
    case "bookmarks":
    case "settings":
      return write.kind;
    default:
      return `${write.kind}:${write.localId}`;
  }
}

export function readQueue(): QueuedWrite[] {
  try {
    const raw = storage()?.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as QueuedWrite[]) : [];
  } catch {
    return [];
  }
}

function persist(queue: QueuedWrite[]): void {
  try {
    storage()?.setItem(KEY, JSON.stringify(queue.slice(-MAX_QUEUED)));
  } catch {
    // Storage full or blocked. The write is still in memory for this session,
    // and failing to record the intent must not fail the edit the reader made.
  }
}

/**
 * Record an intent, collapsing it with any already queued for the same target.
 *
 * A book edited five times offline is one write when the connection returns,
 * carrying the fifth state. Queueing five would send four versions nobody will
 * ever see, over the connection that was the problem in the first place.
 *
 * The original `at` is kept on collapse so an item that has been stuck since
 * Tuesday still looks like it has been stuck since Tuesday.
 */
export function enqueue(write: PendingWrite): void {
  const queue = readQueue();
  const key = writeKey(write);
  const existing = queue.findIndex((item) => writeKey(item.write) === key);
  if (existing >= 0) {
    queue[existing] = { write, at: queue[existing].at, tries: queue[existing].tries };
  } else {
    queue.push({ write, at: Date.now(), tries: 0 });
  }
  persist(queue);
}

/** Drop one, once the server has it. */
export function dequeue(write: PendingWrite): void {
  const key = writeKey(write);
  persist(readQueue().filter((item) => writeKey(item.write) !== key));
}

/** Record that sending failed, so repeated failures can be told from one. */
export function markFailed(write: PendingWrite): void {
  const key = writeKey(write);
  persist(
    readQueue().map((item) =>
      writeKey(item.write) === key ? { ...item, tries: item.tries + 1 } : item,
    ),
  );
}

export function clearQueue(): void {
  try {
    storage()?.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}

export function queueSize(): number {
  return readQueue().length;
}

/**
 * How long to wait before trying again, given how often this has failed.
 *
 * Backs off to a minute and stays there. A reader who has been offline for an
 * hour should not wait an hour more once they are back — the ceiling matters
 * more than the curve.
 */
export function retryDelay(tries: number): number {
  return Math.min(60_000, 1_000 * 2 ** Math.min(tries, 6));
}
