import { useAppStore } from "@/lib/store";
import { legacyBookKey } from "./rows.ts";
import * as repo from "./repository.ts";
import * as ids from "./identity.ts";
import {
  dequeue,
  enqueue,
  markFailed,
  readQueue,
  retryDelay,
  type PendingWrite,
} from "./queue.ts";

/**
 * Keeping a device and an account in step.
 *
 * The order is the design, and it is this:
 *
 *   1. pull — the account's state arrives and is merged in
 *   2. flush — anything queued on this device is sent, overwriting what it
 *      touches
 *
 * That way round on purpose. A reader who marked a passage on a train, closed
 * the laptop and opened it at home has a highlight in the queue and an older
 * book in the account. Flushing first would send it and then a pull would read
 * it straight back, which works; pulling first and flushing second also works
 * and is one round trip cheaper on the common case, where the queue is empty.
 * What matters is that flush comes last, so an edit made offline is never
 * quietly replaced by the older version it was made against.
 *
 * Conflict resolution beyond that is deliberately absent. Last write wins, per
 * book. Two devices editing the same book in the same minute is rare for a
 * reading app — a person reads one book in one place at a time — and the honest
 * alternatives (vector clocks, per-field merges, a conflict interface) cost more
 * than the problem. The queue's collapsing means "last write" is the last state
 * the reader actually saw, not the last keystroke.
 */

export type SyncPhase = "idle" | "pulling" | "pushing" | "offline" | "error";

export interface SyncState {
  phase: SyncPhase;
  /** Writes still waiting to reach the server. */
  pending: number;
  /** When a sync last completed, as epoch ms. */
  lastSyncedAt: number | null;
  /** The last failure, in words a reader could act on. */
  error: string | null;
}

let state: SyncState = { phase: "idle", pending: 0, lastSyncedAt: null, error: null };
const listeners = new Set<(state: SyncState) => void>();

function update(patch: Partial<SyncState>): void {
  state = { ...state, ...patch, pending: readQueue().length };
  for (const listener of listeners) listener(state);
}

export function syncState(): SyncState {
  return state;
}

export function subscribeSync(listener: (state: SyncState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let currentUser: string | null = null;
let flushing = false;
let retryTimer: number | undefined;

/** Reading a book means fetching its text, which a listing deliberately omits. */
export async function loadContent(text: string): Promise<string | null> {
  const remoteId = ids.remoteIdFor(text);
  if (!remoteId) return null;
  return repo.fetchContent(remoteId);
}

/* ── Pull ───────────────────────────────────────────────────────────────── */

/**
 * Bring the account's state onto this device.
 *
 * Books arrive without their text — a library of twenty would be ten megabytes
 * otherwise — so a book that is only in the account is listed with empty
 * content and filled when the reader opens it. Books this device already has
 * keep the text they have.
 */
export async function pull(): Promise<void> {
  if (!currentUser) return;
  update({ phase: "pulling", error: null });

  const account = await repo.pullEverything();
  const store = useAppStore.getState();

  // Pair every book that came back, so highlights and ink can be filed under
  // the key the store actually uses.
  const byLocalKey = new Map<string, (typeof account.books)[number]>();
  for (const book of account.books) {
    const key = book.content ? legacyBookKey(book.content) : legacyBookKey(book.title);
    byLocalKey.set(key, book);
  }

  // Local text wins where this device has it: the account's copy is the same
  // book, and re-downloading it to replace identical text is pure cost.
  const localByKey = new Map(store.sessions.map((s) => [legacyBookKey(s.content), s]));
  const merged = account.books.map((book) => {
    const local = localByKey.get(legacyBookKey(book.title)) ?? null;
    const content = book.content || local?.content || "";
    if (content) ids.remember(content, book.id);
    return { ...book, content };
  });

  // Books only on this device are kept and queued, not dropped. They are
  // usually the ones added before signing in.
  const remoteTitles = new Set(merged.map((book) => book.title));
  const localOnly = store.sessions.filter((session) => !remoteTitles.has(session.title));
  for (const session of localOnly) {
    enqueue({ kind: "book", localId: legacyBookKey(session.content) });
  }

  // Marks come back keyed by remote id; the store files them by text key.
  const highlights: typeof store.highlights = {};
  const ink: typeof store.ink = {};
  for (const book of merged) {
    const key = legacyBookKey(book.content || book.title);
    if (account.highlights[book.id]) highlights[key] = account.highlights[book.id];
    if (account.ink[book.id]) ink[key] = account.ink[book.id];
  }

  ids.keepOnly(merged.map((book) => book.id));

  useAppStore.getState().applyAccountData({
    sessions: [...merged, ...localOnly],
    highlights: { ...store.highlights, ...highlights },
    ink: { ...store.ink, ...ink },
    bookmarks: account.bookmarks,
    settings: account.settings ?? undefined,
  });

  update({ phase: "idle", lastSyncedAt: Date.now() });
}

/* ── Push ───────────────────────────────────────────────────────────────── */

/** Send one queued intent. Throws so the caller can count the failure. */
async function send(write: PendingWrite, userId: string): Promise<void> {
  const store = useAppStore.getState();

  switch (write.kind) {
    case "book":
    case "progress": {
      const session = store.sessions.find((s) => legacyBookKey(s.content) === write.localId);
      if (!session) return; // Deleted since it was queued; nothing to send.
      const existing = ids.remoteIdFor(session.content);
      if (write.kind === "progress" && existing) {
        await repo.saveProgress(existing, session.progress ?? 0, session.section);
        return;
      }
      const id = await repo.saveBook(session, userId, existing ?? undefined);
      ids.remember(session.content, id);
      return;
    }

    case "highlights": {
      const marks = store.highlights[write.localId] ?? [];
      const session = store.sessions.find((s) => legacyBookKey(s.content) === write.localId);
      // A book must exist remotely before anything can point at it.
      let bookId = session ? ids.remoteIdFor(session.content) : null;
      if (!bookId && session) {
        bookId = await repo.saveBook(session, userId);
        ids.remember(session.content, bookId);
      }
      if (!bookId) return;
      await repo.replaceHighlights(bookId, marks, userId);
      return;
    }

    case "ink": {
      const session = store.sessions.find((s) => legacyBookKey(s.content) === write.localId);
      let bookId = session ? ids.remoteIdFor(session.content) : null;
      if (!bookId && session) {
        bookId = await repo.saveBook(session, userId);
        ids.remember(session.content, bookId);
      }
      if (!bookId) return;
      const strokes = store.ink[write.localId] ?? [];
      await repo.saveInk(bookId, write.section, strokes, userId);
      return;
    }

    case "bookmarks": {
      // Replaced wholesale: the local list has no per-item remote identity, and
      // a reader's bookmarks are few enough that this is cheaper than tracking
      // one.
      const existing = await repo.listBookmarks();
      await Promise.all(existing.map((bookmark) => repo.deleteBookmark(bookmark.id)));
      for (const bookmark of store.bookmarks) {
        const session = store.sessions.find((s) => s.title === bookmark.title);
        const bookId = session ? ids.remoteIdFor(session.content) : null;
        await repo.saveBookmark(bookmark, userId, bookId);
      }
      return;
    }

    case "settings": {
      await repo.saveSettings(
        {
          profile: store.profile,
          mode: store.mode,
          targetWpm: store.targetWpm,
          lockedSettings: store.lockedSettings,
          savedProfiles: store.savedProfiles,
          adaptiveMemory: store.adaptiveMemory as Record<string, unknown>,
        },
        userId,
      );
      return;
    }
  }
}

/**
 * Drain the queue.
 *
 * One at a time and in order, because the writes are not independent: a book
 * must exist before its highlights can point at it, and sending them at once
 * would race that. A reading app's queue is short; the simplicity is worth more
 * than the parallelism.
 */
export async function flush(): Promise<void> {
  if (flushing || !currentUser) return;
  const queue = readQueue();
  if (queue.length === 0) return;

  flushing = true;
  update({ phase: "pushing", error: null });

  try {
    for (const item of queue) {
      try {
        await send(item.write, currentUser);
        dequeue(item.write);
      } catch (error) {
        markFailed(item.write);
        const message = error instanceof Error ? error.message : "Could not sync.";
        const offline = typeof navigator !== "undefined" && navigator.onLine === false;
        update({ phase: offline ? "offline" : "error", error: message });
        // Stop at the first failure rather than hammering a server that is
        // down, or sending the rest of a chain whose first link did not land.
        scheduleRetry(item.tries + 1);
        return;
      }
    }
    update({ phase: "idle", lastSyncedAt: Date.now(), error: null });
  } finally {
    flushing = false;
  }
}

function scheduleRetry(tries: number): void {
  if (typeof window === "undefined") return;
  window.clearTimeout(retryTimer);
  retryTimer = window.setTimeout(() => void flush(), retryDelay(tries));
}

/* ── Lifecycle ──────────────────────────────────────────────────────────── */

function onOnline(): void {
  update({ phase: "idle", error: null });
  void flush();
}

function onOffline(): void {
  update({ phase: "offline" });
}

/**
 * Begin syncing for a signed-in reader.
 *
 * A failed pull is not fatal: the device already holds everything it had a
 * moment ago, so the app keeps working from local state and tries again. What
 * it must not do is leave the reader looking at an empty library because a
 * request timed out.
 */
export async function startSync(userId: string): Promise<void> {
  currentUser = userId;
  if (typeof window !== "undefined") {
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
  }

  try {
    await pull();
  } catch (error) {
    update({
      phase: "error",
      error: error instanceof Error ? error.message : "Could not reach your account.",
    });
  }
  await flush();
}

export function stopSync(): void {
  currentUser = null;
  if (typeof window !== "undefined") {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    window.clearTimeout(retryTimer);
  }
  update({ phase: "idle", error: null, lastSyncedAt: null });
}

/** Signed in, and therefore worth queueing writes for. */
export function syncing(): boolean {
  return currentUser !== null;
}
