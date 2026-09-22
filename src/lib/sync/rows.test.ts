import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bookmarkToRow,
  highlightToRow,
  inkToRow,
  legacyBookKey,
  rowToBookmark,
  rowToHighlight,
  rowToInk,
  rowToSession,
  rowToSettings,
  sessionToRow,
  settingsToRow,
  type BookRow,
  type HighlightRow,
} from "./rows.ts";
import type { Highlight, Session } from "@/lib/types";

const USER = "11111111-1111-1111-1111-111111111111";
const BOOK = "22222222-2222-2222-2222-222222222222";

/* ── Books ──────────────────────────────────────────────────────────────── */

const session: Session = {
  title: "The Old Man and the Sea",
  content: "He was an old man who fished alone in a skiff in the Gulf Stream.",
  openedAt: 1_700_000_000_000,
  progress: 0.42,
  section: 3,
  kind: "text",
  sourceId: "gutenberg-123",
  currentWpm: 210,
  pauseCount: 4,
  rereadCount: 1,
  elapsedMs: 900_000,
  comprehension: 0.8,
};

test("a book survives the round trip with every field intact", () => {
  const row = { id: BOOK, ...sessionToRow(session, USER) } as BookRow;
  const back = rowToSession(row);
  assert.equal(back.title, session.title);
  assert.equal(back.content, session.content);
  assert.equal(back.progress, session.progress);
  assert.equal(back.section, session.section);
  assert.equal(back.kind, session.kind);
  assert.equal(back.sourceId, session.sourceId);
  assert.equal(back.openedAt, session.openedAt);
});

test("the reading measurements survive, not just the text", () => {
  const row = { id: BOOK, ...sessionToRow(session, USER) } as BookRow;
  const back = rowToSession(row);
  assert.equal(back.currentWpm, 210);
  assert.equal(back.pauseCount, 4);
  assert.equal(back.rereadCount, 1);
  assert.equal(back.elapsedMs, 900_000);
  assert.equal(back.comprehension, 0.8);
});

test("progress is clamped, because the column refuses anything outside 0-1", () => {
  assert.equal(sessionToRow({ ...session, progress: 1.4 }, USER).progress, 1);
  assert.equal(sessionToRow({ ...session, progress: -0.2 }, USER).progress, 0);
});

test("a book with no progress yet is stored at the beginning, not as null", () => {
  const row = sessionToRow({ ...session, progress: undefined }, USER);
  assert.equal(row.progress, 0);
});

test("word count is counted, since nothing else computes it server-side", () => {
  assert.equal(sessionToRow(session, USER).word_count, 15);
  assert.equal(sessionToRow({ ...session, content: "   " }, USER).word_count, 0);
});

test("the row carries the owner, which is what the insert policy checks", () => {
  assert.equal(sessionToRow(session, USER).user_id, USER);
});

/* ── Highlights ─────────────────────────────────────────────────────────── */

const mark: Highlight = {
  lineIdx: 12,
  section: 2,
  start: 5,
  end: 19,
  text: "fished alone",
  note: "the whole book in three words",
  color: "butter",
  at: 1_700_000_500_000,
};

test("a highlight keeps its anchor through the round trip", () => {
  const row = { id: "h1", ...highlightToRow(mark, BOOK, USER) } as HighlightRow;
  const back = rowToHighlight(row);
  // These four are the anchor. Lose one and the mark lands on the wrong words.
  assert.equal(back.lineIdx, mark.lineIdx);
  assert.equal(back.section, mark.section);
  assert.equal(back.start, mark.start);
  assert.equal(back.end, mark.end);
  assert.equal(back.text, mark.text);
  assert.equal(back.note, mark.note);
  assert.equal(back.color, mark.color);
  assert.equal(back.at, mark.at);
});

test("an empty note is stored as absent, not as an empty note", () => {
  assert.equal(highlightToRow({ ...mark, note: "   " }, BOOK, USER).note, null);
  assert.equal(highlightToRow({ ...mark, note: undefined }, BOOK, USER).note, null);
  assert.equal(rowToHighlight({ ...highlightToRow(mark, BOOK, USER), id: "h", note: null } as HighlightRow).note, undefined);
});

test("a highlight made before the colour palette existed stays uncoloured", () => {
  const row = highlightToRow({ ...mark, color: undefined }, BOOK, USER);
  assert.equal(row.color, null);
  assert.equal(rowToHighlight({ ...row, id: "h" } as HighlightRow).color, undefined);
});

test("a highlight is tied to its book and its owner", () => {
  const row = highlightToRow(mark, BOOK, USER);
  assert.equal(row.book_id, BOOK);
  assert.equal(row.user_id, USER);
});

/* ── Bookmarks ──────────────────────────────────────────────────────────── */

test("a bookmark survives, and its book content is not duplicated into it", () => {
  const bookmark = {
    id: "local-1",
    title: "Chapter 4",
    content: "the entire book text",
    progress: 0.6,
    savedAt: 1_700_000_900_000,
    excerpt: "a line worth returning to",
    chapter: 4,
    pdfPage: 88,
  };
  const row = { id: "b1", ...bookmarkToRow(bookmark, USER, BOOK) };
  const back = rowToBookmark(row);
  assert.equal(back.title, bookmark.title);
  assert.equal(back.progress, bookmark.progress);
  assert.equal(back.excerpt, bookmark.excerpt);
  assert.equal(back.chapter, bookmark.chapter);
  assert.equal(back.pdfPage, bookmark.pdfPage);
  assert.equal(back.savedAt, bookmark.savedAt);
  // The book's text lives in the books table; storing it again per bookmark
  // would multiply a novel by however many places somebody marked in it.
  assert.equal(back.content, "");
  assert.equal(rowToBookmark(row, "restored text").content, "restored text");
});

/* ── Ink ────────────────────────────────────────────────────────────────── */

test("ink is grouped per section, and other sections are not swept in", () => {
  const strokes = [
    { id: "s1", section: 1, tool: "pen", color: "#000", points: [] },
    { id: "s2", section: 2, tool: "pen", color: "#000", points: [] },
    { id: "s3", section: 1, tool: "marker", color: "#f00", points: [] },
  ] as unknown as Parameters<typeof inkToRow>[0];

  const row = inkToRow(strokes, BOOK, 1, USER);
  assert.equal(row.strokes.length, 2, "only section 1 belongs in section 1's row");
  assert.deepEqual(row.strokes.map((s) => s.id), ["s1", "s3"]);
  assert.equal(row.book_id, BOOK);
  assert.equal(row.section, 1);
});

test("a row with no strokes reads as an empty page, never as a crash", () => {
  assert.deepEqual(rowToInk({ strokes: [] } as never), []);
  assert.deepEqual(rowToInk({ strokes: null } as never), []);
  assert.deepEqual(rowToInk({} as never), []);
});

/* ── Settings ───────────────────────────────────────────────────────────── */

const settings = {
  profile: { id: "default", fontSize: 18 } as never,
  mode: "adaptive",
  targetWpm: 240,
  lockedSettings: ["fontSize"],
  savedProfiles: [{ id: "p1", name: "Evening", profile: {} as never, targetWpm: 200 }],
  adaptiveMemory: { lineHeight: 2 },
  meta: { onboardedAt: 1_790_000_000_000 },
};

test("settings survive the round trip", () => {
  const row = settingsToRow(settings, USER);
  const back = rowToSettings(row);
  assert.deepEqual(back.profile, settings.profile);
  assert.equal(back.mode, settings.mode);
  assert.equal(back.targetWpm, settings.targetWpm);
  assert.deepEqual(back.lockedSettings, settings.lockedSettings);
  assert.deepEqual(back.savedProfiles, settings.savedProfiles);
  assert.deepEqual(back.adaptiveMemory, settings.adaptiveMemory);
  // The survey flag rides in its own column. If this is lost in translation
  // the survey comes back on every refresh, which is exactly what happened
  // when it lived on the profile.
  assert.deepEqual(back.meta, settings.meta);
});

test("account facts travel in their own column, not inside the profile", () => {
  const row = settingsToRow(settings, USER);
  assert.deepEqual(row.meta, settings.meta);
  assert.equal((row.profile as Record<string, unknown>).onboardedAt, undefined);
});

test("a partly-filled row returns only what it holds", () => {
  // Written by an older version of the app. The reader's local defaults must
  // survive this, rather than being overwritten with nulls.
  const back = rowToSettings({
    user_id: USER,
    profile: {},
    mode: null,
    target_wpm: null,
    locks: [],
    saved_profiles: [],
    adaptive_memory: {},
  });
  assert.ok(!("profile" in back), "an empty profile is absent, not an empty object");
  assert.ok(!("mode" in back));
  assert.ok(!("targetWpm" in back));
});

test("settings are keyed by the person, one row each", () => {
  assert.equal(settingsToRow(settings, USER).user_id, USER);
});

/* ── Identity ───────────────────────────────────────────────────────────── */

test("the legacy key is still what the old local data was filed under", () => {
  assert.equal(legacyBookKey("  Call me Ishmael.  "), "Call me Ishmael.");
  assert.equal(legacyBookKey(""), "default");
  assert.equal(legacyBookKey("   "), "default");
});

test("the legacy key collides where two books open alike — why ids replaced it", () => {
  const preamble = "THE PROJECT GUTENBERG EBOOK OF SOMETHING LONG ENOUGH TO CUT";
  assert.equal(legacyBookKey(`${preamble} — Moby Dick`), legacyBookKey(`${preamble} — Hamlet`));
});
