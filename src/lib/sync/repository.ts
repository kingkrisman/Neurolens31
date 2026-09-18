import { getSupabase } from "@/lib/supabase/client";
import type { Bookmark, Highlight, Session } from "@/lib/types";
import type { InkStroke } from "@/lib/ink";
import {
  bookmarkToRow,
  highlightToRow,
  inkToRow,
  rowToBookmark,
  rowToHighlight,
  rowToInk,
  rowToSession,
  rowToSettings,
  sessionToRow,
  settingsToRow,
  type BookRow,
  type BookmarkRow,
  type HighlightRow,
  type InkRow,
  type LocalSettings,
  type SettingsRow,
} from "./rows";

/**
 * Every read and write the app makes against its own tables.
 *
 * Two rules run through all of it.
 *
 * **Text is fetched separately from everything else.** A book's `content` is
 * the whole book — a novel is comfortably half a megabyte — so a library of
 * twenty would be ten megabytes before the reader has opened anything. Every
 * listing here therefore selects columns explicitly and leaves `content` out;
 * `fetchContent` gets it for the one book being opened. The temptation is
 * `select("*")`, and on a phone on mobile data it is the difference between an
 * app that opens and one that does not.
 *
 * **Ownership is the database's job, not this file's.** Row-level security
 * scopes every select to the signed-in reader, so none of these queries filter
 * by user — a `where user_id = …` here would be a second, weaker copy of a rule
 * that already holds. The id is still written on insert, because the column
 * requires it and the insert policy checks it matches.
 */

/** Columns that make a library list: everything except the book itself. */
const BOOK_META =
  "id, user_id, title, kind, source_id, word_count, page_count, progress, section, reading_stats, opened_at, created_at, updated_at";

function client() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Not connected to your account.");
  return supabase;
}

/** Supabase reports failure in the payload rather than by throwing. */
function orThrow<T>({ data, error }: { data: T | null; error: { message: string } | null }, what: string): T {
  if (error) throw new Error(`Could not ${what}: ${error.message}`);
  if (data === null) throw new Error(`Could not ${what}.`);
  return data;
}

/* ── Books ──────────────────────────────────────────────────────────────── */

/** Every book in the account, newest first, without their text. */
export async function listBooks(): Promise<Array<Session & { id: string }>> {
  const result = await client().from("books").select(BOOK_META).order("opened_at", { ascending: false });
  const rows = orThrow(result, "load your library") as unknown as BookRow[];
  // `content` is absent by design; the reader fills it on open.
  return rows.map((row) => rowToSession({ ...row, content: "" }));
}

/** The text of one book. Null when it has been removed elsewhere. */
export async function fetchContent(bookId: string): Promise<string | null> {
  const { data, error } = await client().from("books").select("content").eq("id", bookId).maybeSingle();
  if (error) throw new Error(`Could not open that book: ${error.message}`);
  return (data as { content: string } | null)?.content ?? null;
}

/**
 * Save a book, and return the id the database gave it.
 *
 * `id` is optional because a book is new exactly once. With one, this updates;
 * without, it inserts and the caller records the id it gets back — which is
 * what ties the reader's highlights to the right book from then on.
 */
export async function saveBook(
  session: Session,
  userId: string,
  id?: string,
): Promise<string> {
  const row = sessionToRow(session, userId);
  const query = id
    ? client().from("books").update(row).eq("id", id).select("id").single()
    : client().from("books").insert(row).select("id").single();
  const saved = orThrow(await query, "save that book") as { id: string };
  return saved.id;
}

/** Progress moves constantly; this writes only the columns that carry it. */
export async function saveProgress(
  bookId: string,
  progress: number,
  section: number | undefined,
): Promise<void> {
  const { error } = await client()
    .from("books")
    .update({
      progress: Math.min(1, Math.max(0, progress)),
      section: section ?? null,
      opened_at: new Date().toISOString(),
    })
    .eq("id", bookId);
  if (error) throw new Error(`Could not save your place: ${error.message}`);
}

/** Removes the book and, by the schema's cascade, everything marked in it. */
export async function deleteBook(bookId: string): Promise<void> {
  const { error } = await client().from("books").delete().eq("id", bookId);
  if (error) throw new Error(`Could not remove that book: ${error.message}`);
}

/* ── Highlights ─────────────────────────────────────────────────────────── */

/** Every highlight in the account, grouped by the book it belongs to. */
export async function listHighlights(): Promise<Record<string, Highlight[]>> {
  const result = await client()
    .from("highlights")
    .select("*")
    .order("created_at", { ascending: true });
  const rows = orThrow(result, "load your highlights") as HighlightRow[];

  const byBook: Record<string, Highlight[]> = {};
  for (const row of rows) {
    (byBook[row.book_id] ??= []).push(rowToHighlight(row));
  }
  return byBook;
}

/**
 * Replace one book's highlights with the set given.
 *
 * Replacement rather than a diff because the local model is an array per book
 * with no per-mark identity: merging overlapping marks rewrites the array, so
 * there is no stable id to match rows against. Scoped to a single book and run
 * as delete-then-insert, so the blast radius of getting it wrong is one book's
 * marks rather than the account's.
 */
export async function replaceHighlights(
  bookId: string,
  marks: Highlight[],
  userId: string,
): Promise<void> {
  const supabase = client();
  const { error: cleared } = await supabase.from("highlights").delete().eq("book_id", bookId);
  if (cleared) throw new Error(`Could not update your highlights: ${cleared.message}`);
  if (marks.length === 0) return;

  const { error } = await supabase
    .from("highlights")
    .insert(marks.map((mark) => highlightToRow(mark, bookId, userId)));
  if (error) throw new Error(`Could not save your highlights: ${error.message}`);
}

/* ── Bookmarks ──────────────────────────────────────────────────────────── */

export async function listBookmarks(): Promise<Bookmark[]> {
  const result = await client()
    .from("bookmarks")
    .select("*")
    .order("created_at", { ascending: false });
  return (orThrow(result, "load your bookmarks") as BookmarkRow[]).map((row) => rowToBookmark(row));
}

export async function saveBookmark(
  bookmark: Bookmark,
  userId: string,
  bookId: string | null,
): Promise<string> {
  const saved = orThrow(
    await client()
      .from("bookmarks")
      .insert(bookmarkToRow(bookmark, userId, bookId))
      .select("id")
      .single(),
    "save that bookmark",
  ) as { id: string };
  return saved.id;
}

export async function deleteBookmark(id: string): Promise<void> {
  const { error } = await client().from("bookmarks").delete().eq("id", id);
  if (error) throw new Error(`Could not remove that bookmark: ${error.message}`);
}

/* ── Ink ────────────────────────────────────────────────────────────────── */

/** Every stroke in the account, flattened per book the way the reader holds it. */
export async function listInk(): Promise<Record<string, InkStroke[]>> {
  const result = await client().from("ink_strokes").select("*");
  const rows = orThrow(result, "load your drawings") as InkRow[];

  const byBook: Record<string, InkStroke[]> = {};
  for (const row of rows) {
    (byBook[row.book_id] ??= []).push(...rowToInk(row));
  }
  return byBook;
}

/**
 * Save one section's strokes.
 *
 * `upsert` on the (book, section) pair the schema declares unique, so drawing
 * on a page already drawn on replaces that page rather than accumulating a
 * second row the reader would see as doubled ink.
 */
export async function saveInk(
  bookId: string,
  section: number,
  strokes: InkStroke[],
  userId: string,
): Promise<void> {
  const { error } = await client()
    .from("ink_strokes")
    .upsert(inkToRow(strokes, bookId, section, userId), { onConflict: "book_id,section" });
  if (error) throw new Error(`Could not save your drawing: ${error.message}`);
}

/* ── Settings ───────────────────────────────────────────────────────────── */

/** The reading profile, or null for an account that has never saved one. */
export async function fetchSettings(): Promise<Partial<LocalSettings> | null> {
  const { data, error } = await client().from("reading_settings").select("*").maybeSingle();
  if (error) throw new Error(`Could not load your settings: ${error.message}`);
  return data ? rowToSettings(data as SettingsRow) : null;
}

/** One row per person, so this upserts on the primary key. */
export async function saveSettings(settings: LocalSettings, userId: string): Promise<void> {
  const { error } = await client()
    .from("reading_settings")
    .upsert(settingsToRow(settings, userId), { onConflict: "user_id" });
  if (error) throw new Error(`Could not save your settings: ${error.message}`);
}

/* ── Account ────────────────────────────────────────────────────────────── */

/**
 * Everything the account holds, in one round trip each.
 *
 * Four requests rather than one join: the shapes are different enough that a
 * join would return a book's row once per highlight in it, and a book's row is
 * the expensive thing here even without its text.
 */
export async function pullEverything(): Promise<{
  books: Array<Session & { id: string }>;
  highlights: Record<string, Highlight[]>;
  bookmarks: Bookmark[];
  ink: Record<string, InkStroke[]>;
  settings: Partial<LocalSettings> | null;
}> {
  const [books, highlights, bookmarks, ink, settings] = await Promise.all([
    listBooks(),
    listHighlights(),
    listBookmarks(),
    listInk(),
    fetchSettings(),
  ]);
  return { books, highlights, bookmarks, ink, settings };
}

/**
 * Erase the account's contents.
 *
 * Deleting the books is almost enough on its own — highlights, bookmarks and
 * ink all cascade from them — but bookmarks may have no book, and the settings
 * row hangs off the account rather than off any book, so both are named.
 */
export async function eraseEverything(userId: string): Promise<void> {
  const supabase = client();
  for (const table of ["ink_strokes", "highlights", "bookmarks", "books"]) {
    const { error } = await supabase.from(table).delete().eq("user_id", userId);
    if (error) throw new Error(`Could not erase your ${table.replace("_", " ")}: ${error.message}`);
  }
  const { error } = await supabase.from("reading_settings").delete().eq("user_id", userId);
  if (error) throw new Error(`Could not erase your settings: ${error.message}`);
}
