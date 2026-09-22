import type { Bookmark, Highlight, ReadingProfile, SavedProfile, Session } from "@/lib/types";
import type { InkStroke } from "@/lib/ink";

/**
 * The boundary where this app's types meet the database's rows.
 *
 * Kept as pure functions with no Supabase client anywhere near them, because
 * this is the part most worth testing: a field dropped in translation does not
 * throw, it silently loses somebody's highlights, and it does so on the device
 * that syncs second.
 *
 * Two conventions differ across the boundary and both are handled here rather
 * than at call sites — the database is snake_case where the app is camelCase,
 * and it stores times as ISO strings where the app uses epoch milliseconds.
 */

/* ── Identity ─────────────────────────────────────────────────────────────
 *
 * Locally a book is identified by the first 48 characters of its text. That is
 * enough to tell two books apart on one device and not enough to do it across
 * an account: two Gutenberg texts that open with the same licence header, or
 * two chapters pasted from the same document, collide — and once synced, one
 * reader's highlights would land on the other's book.
 *
 * So the database keys books by a uuid it assigns, and this module keeps the
 * old key alongside it. Nothing reads `legacyKey` except the one-time upload of
 * what is already on a device, which is the only place the old scheme still has
 * to be understood.
 */
export function legacyBookKey(text: string): string {
  return text.trim().slice(0, 48) || "default";
}

const iso = (ms: number | undefined): string => new Date(ms ?? Date.now()).toISOString();
const ms = (value: string | null | undefined): number =>
  value ? Date.parse(value) : Date.now();

/* ── Books ──────────────────────────────────────────────────────────────── */

export interface BookRow {
  id: string;
  user_id: string;
  title: string;
  content: string;
  kind: string;
  source_id: string | null;
  word_count: number;
  page_count: number | null;
  progress: number;
  section: number | null;
  reading_stats: Record<string, unknown>;
  opened_at: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * A session becomes a book row.
 *
 * `reading_stats` carries the measurements the adaptive reader collects — words
 * per minute, pauses, rereads, elapsed time, the pattern it inferred. They go in
 * one jsonb column rather than six: the set changes as the engine learns more,
 * and a migration per measurement would be absurd for numbers nothing queries
 * by.
 */
export function sessionToRow(session: Session, userId: string): Omit<BookRow, "id"> {
  return {
    user_id: userId,
    title: session.title,
    content: session.content,
    kind: session.kind ?? "text",
    source_id: session.sourceId ?? null,
    word_count: session.content.trim() ? session.content.trim().split(/\s+/).length : 0,
    page_count: null,
    // Clamped rather than trusted: a value outside 0–1 fails the column's check
    // constraint, and losing a whole book to a rounding error is a poor trade.
    progress: Math.min(1, Math.max(0, session.progress ?? 0)),
    section: session.section ?? null,
    reading_stats: {
      currentWpm: session.currentWpm ?? null,
      pauseCount: session.pauseCount ?? 0,
      rereadCount: session.rereadCount ?? 0,
      elapsedMs: session.elapsedMs ?? 0,
      comprehension: session.comprehension ?? null,
      pattern: session.pattern ?? null,
    },
    opened_at: iso(session.openedAt),
  };
}

export function rowToSession(row: BookRow): Session & { id: string } {
  const stats = (row.reading_stats ?? {}) as Record<string, unknown>;
  const num = (key: string): number | undefined =>
    typeof stats[key] === "number" ? (stats[key] as number) : undefined;

  return {
    id: row.id,
    remoteId: row.id,
    title: row.title,
    content: row.content,
    openedAt: ms(row.opened_at),
    progress: row.progress,
    section: row.section ?? undefined,
    kind: (row.kind as Session["kind"]) ?? "text",
    sourceId: row.source_id ?? undefined,
    currentWpm: num("currentWpm") ?? null,
    pauseCount: num("pauseCount"),
    rereadCount: num("rereadCount"),
    elapsedMs: num("elapsedMs"),
    comprehension: num("comprehension") ?? null,
    pattern: (stats.pattern as Session["pattern"]) ?? undefined,
  };
}

/* ── Highlights ─────────────────────────────────────────────────────────── */

export interface HighlightRow {
  id: string;
  user_id: string;
  book_id: string;
  section: number;
  line_idx: number;
  start_offset: number;
  end_offset: number;
  text: string;
  note: string | null;
  color: string | null;
  created_at?: string;
}

export function highlightToRow(
  mark: Highlight,
  bookId: string,
  userId: string,
): Omit<HighlightRow, "id"> {
  return {
    user_id: userId,
    book_id: bookId,
    section: mark.section ?? 0,
    line_idx: mark.lineIdx,
    start_offset: mark.start,
    end_offset: mark.end,
    text: mark.text,
    // An absent note and an empty one mean the same thing to a reader, and
    // storing "" would make the list show a note that is not there.
    note: mark.note?.trim() ? mark.note : null,
    color: mark.color ?? null,
    created_at: iso(mark.at),
  };
}

export function rowToHighlight(row: HighlightRow): Highlight {
  return {
    lineIdx: row.line_idx,
    section: row.section,
    start: row.start_offset,
    end: row.end_offset,
    text: row.text,
    note: row.note ?? undefined,
    color: (row.color as Highlight["color"]) ?? undefined,
    at: ms(row.created_at),
  };
}

/* ── Bookmarks ──────────────────────────────────────────────────────────── */

export interface BookmarkRow {
  id: string;
  user_id: string;
  book_id: string | null;
  title: string;
  excerpt: string | null;
  progress: number;
  section: number | null;
  pdf_page: number | null;
  created_at?: string;
}

export function bookmarkToRow(
  bookmark: Bookmark,
  userId: string,
  bookId: string | null,
): Omit<BookmarkRow, "id"> {
  return {
    user_id: userId,
    book_id: bookId,
    title: bookmark.title,
    excerpt: bookmark.excerpt ?? null,
    progress: Math.min(1, Math.max(0, bookmark.progress ?? 0)),
    section: bookmark.chapter ?? null,
    pdf_page: bookmark.pdfPage ?? null,
    created_at: iso(bookmark.savedAt),
  };
}

export function rowToBookmark(row: BookmarkRow, content = ""): Bookmark {
  return {
    id: row.id,
    title: row.title,
    content,
    progress: row.progress,
    savedAt: ms(row.created_at),
    excerpt: row.excerpt ?? undefined,
    chapter: row.section ?? undefined,
    pdfPage: row.pdf_page ?? undefined,
  };
}

/* ── Ink ────────────────────────────────────────────────────────────────── */

export interface InkRow {
  id: string;
  user_id: string;
  book_id: string;
  section: number;
  strokes: InkStroke[];
  updated_at?: string;
}

/**
 * Strokes are grouped, not stored one per row.
 *
 * A single annotated chapter is easily hundreds of strokes, and a row each
 * would mean hundreds of inserts to save one page of drawing. They are written
 * per book and section instead, which is also how the reader loads them.
 */
export function inkToRow(
  strokes: InkStroke[],
  bookId: string,
  section: number,
  userId: string,
): Omit<InkRow, "id"> {
  return {
    user_id: userId,
    book_id: bookId,
    section,
    strokes: strokes.filter((stroke) => stroke.section === section),
  };
}

export function rowToInk(row: InkRow): InkStroke[] {
  return Array.isArray(row.strokes) ? row.strokes : [];
}

/* ── Settings ───────────────────────────────────────────────────────────── */

export interface SettingsRow {
  user_id: string;
  profile: ReadingProfile | Record<string, never>;
  mode: string | null;
  target_wpm: number | null;
  locks: string[];
  saved_profiles: SavedProfile[];
  adaptive_memory: Record<string, unknown>;
  /** Account facts — onboarding, avatar. Kept out of `profile`; see lib/account-meta.ts. */
  meta?: Record<string, unknown>;
  updated_at?: string;
}

export interface LocalSettings {
  profile: ReadingProfile;
  mode: string;
  targetWpm: number;
  lockedSettings: string[];
  savedProfiles: SavedProfile[];
  adaptiveMemory: Record<string, unknown>;
  meta: Record<string, unknown>;
}

export function settingsToRow(settings: LocalSettings, userId: string): SettingsRow {
  return {
    user_id: userId,
    profile: settings.profile,
    mode: settings.mode,
    target_wpm: settings.targetWpm,
    locks: settings.lockedSettings,
    saved_profiles: settings.savedProfiles,
    adaptive_memory: settings.adaptiveMemory,
    meta: settings.meta,
  };
}

/**
 * Returns only what the row actually carries.
 *
 * Every field is optional on the way back because a row written by an older
 * version of the app will not have the newest ones, and a reader signing in on
 * a second device should not have their local defaults overwritten by nulls
 * from a partially-filled row.
 */
export function rowToSettings(row: SettingsRow): Partial<LocalSettings> {
  const out: Partial<LocalSettings> = {};
  if (row.profile && Object.keys(row.profile).length > 0) {
    out.profile = row.profile as ReadingProfile;
  }
  if (row.mode) out.mode = row.mode;
  if (typeof row.target_wpm === "number") out.targetWpm = row.target_wpm;
  if (Array.isArray(row.locks)) out.lockedSettings = row.locks;
  if (Array.isArray(row.saved_profiles)) out.savedProfiles = row.saved_profiles;
  if (row.adaptive_memory && typeof row.adaptive_memory === "object") {
    out.adaptiveMemory = row.adaptive_memory;
  }
  if (row.meta && typeof row.meta === "object") out.meta = row.meta;
  return out;
}
