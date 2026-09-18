import { useAppStore } from "@/lib/store";
import type { Session } from "@/lib/types";
import type { StartReadingMeta } from "@/lib/store";
import { fetchContent } from "./repository.ts";

/**
 * Open a book, fetching its text first if this device does not have it.
 *
 * A library listed from the account arrives without any text: a novel is half a
 * megabyte and twenty of them would be ten before the reader had opened
 * anything. So a book synced from another device is a title, a position and
 * nothing to read — and opening one went straight to the reader, which rendered
 * an empty page reading "0 words".
 *
 * This is the missing step. It lives outside the store because fetching is
 * asynchronous and `startReading` is not: every one of its callers is a click
 * handler that expects the reader to open now, and making that path await a
 * network request would have meant changing all of them.
 *
 * Returns false when the text cannot be had — offline, or the book was removed
 * from the account elsewhere — so the caller can say so instead of opening
 * nothing.
 */
export async function openBook(session: Session, meta?: StartReadingMeta): Promise<boolean> {
  const store = useAppStore.getState();

  if (session.content.trim()) {
    store.startReading(session.content, meta ?? { title: session.title, kind: session.kind });
    return true;
  }

  // No text and no row to ask for it: nothing can be done.
  if (!session.remoteId) return false;

  const content = await fetchContent(session.remoteId).catch(() => null);
  if (!content?.trim()) return false;

  // Kept, so the next open needs no network and offline reading works from here
  // on. The store's own persistence handles writing it to the device.
  const filled = { ...session, content };
  useAppStore.setState({
    sessions: store.sessions.map((item) =>
      item.remoteId === session.remoteId || item.title === session.title ? filled : item,
    ),
  });

  useAppStore
    .getState()
    .startReading(content, meta ?? { title: session.title, kind: session.kind });
  return true;
}

/** Whether this book still needs its text fetched before it can be read. */
export function needsContent(session: Session): boolean {
  return !session.content.trim() && Boolean(session.remoteId);
}

/**
 * The thing to open for a bookmark.
 *
 * A bookmark pulled from the account carries no text: a book's text lives in
 * the books table rather than being copied into every mark that points at it.
 * So the book of the same title supplies it, and the bookmark's own text is
 * used when it has some — which it does for anything saved on this device.
 */
export function sourceFor(bookmark: { title: string; content?: string }): Session {
  if (bookmark.content?.trim()) {
    return { title: bookmark.title, content: bookmark.content, openedAt: Date.now() };
  }
  const match = useAppStore
    .getState()
    .sessions.find((session) => session.title === bookmark.title);
  return match ?? { title: bookmark.title, content: "", openedAt: Date.now() };
}
