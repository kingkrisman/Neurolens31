import { useAppStore } from "@/lib/store";
import { legacyBookKey } from "./rows.ts";
import { enqueue } from "./queue.ts";
import { remoteIdFor } from "./identity.ts";
import { rememberChoice, rememberDeclined, uploadChoice } from "./upload-choice.ts";

/**
 * Moving what is already on a device into an account, if the reader says so.
 *
 * This exists because of a promise. Everyone who used NeuroLens before accounts
 * was told their files stayed on their device, and that was true. Signing in
 * cannot quietly make it false — uploading somebody's library because they
 * created an account is exactly the kind of thing the rest of this app is
 * written not to do.
 *
 * So the upload is one explicit answer to one plain question, and the answer is
 * remembered per account rather than per device: a reader with two accounts is
 * making two different decisions, and the second must not inherit the first.
 *
 * Declining is not permanent and not destructive. The books stay where they
 * are, fully readable, and the account page can offer the upload again later.
 * What declining does mean is that those books are not created in the account
 * behind the reader's back — so a highlight added to one afterwards stays on
 * the device with it.
 */

export { isDeclined, uploadChoice, declinedKeys } from "./upload-choice.ts";

export interface LocalOnly {
  /** Books on this device that the account does not have. */
  books: Array<{ key: string; title: string; words: number }>;
  highlights: number;
  bookmarks: number;
  /** Nothing to ask about. */
  empty: boolean;
}

/**
 * What is on this device and not in the account.
 *
 * Counted rather than described in the abstract, because "we found some books"
 * is not enough to decide on. A reader should see that it is nine books and two
 * hundred highlights before agreeing to send them anywhere.
 */
export function localOnly(): LocalOnly {
  const store = useAppStore.getState();
  const books = store.sessions
    .filter((session) => session.content.trim() && !remoteIdFor(session.content))
    .map((session) => ({
      key: legacyBookKey(session.content),
      title: session.title,
      words: session.content.trim().split(/\s+/).length,
    }));

  const keys = new Set(books.map((book) => book.key));
  const highlights = Object.entries(store.highlights)
    .filter(([key]) => keys.has(key))
    .reduce((total, [, marks]) => total + marks.length, 0);

  return {
    books,
    highlights,
    bookmarks: store.bookmarks.length,
    empty: books.length === 0 && store.bookmarks.length === 0,
  };
}

/**
 * Queue everything on this device for upload.
 *
 * Queued rather than sent, so this behaves the same on a bad connection as on a
 * good one: the engine drains it, retries what fails, and the reader can close
 * the tab without losing the decision they just made.
 *
 * Settings go too. A reading profile is the most personal thing here — it is
 * how somebody has learned to read comfortably — and an account that carried
 * the books but not the profile would be the wrong half.
 */
export function uploadLocal(userId: string): void {
  const store = useAppStore.getState();
  const found = localOnly();

  for (const book of found.books) {
    enqueue({ kind: "book", localId: book.key });
    if (store.highlights[book.key]?.length) {
      enqueue({ kind: "highlights", localId: book.key });
    }
    for (const section of new Set((store.ink[book.key] ?? []).map((stroke) => stroke.section))) {
      enqueue({ kind: "ink", localId: book.key, section });
    }
  }

  if (store.bookmarks.length) enqueue({ kind: "bookmarks" });
  enqueue({ kind: "settings" });

  // Anything previously declined has now been offered up deliberately.
  rememberDeclined([]);
  rememberChoice(userId, "uploaded");
}

/** Keep this device's library off the account, for now. */
export function declineUpload(userId: string): void {
  rememberDeclined(localOnly().books.map((book) => book.key));
  rememberChoice(userId, "declined");
}

/**
 * Whether to put the question to this reader.
 *
 * Only once per account per device, and only when there is something to ask
 * about. A prompt offering to upload nothing is a prompt that teaches people to
 * dismiss prompts.
 */
export function shouldAskToUpload(userId: string): boolean {
  return uploadChoice(userId) === null && !localOnly().empty;
}
