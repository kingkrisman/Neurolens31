import assert from "node:assert/strict";
import { test } from "node:test";
import { planAnchoring, type AnchorTarget } from "./anchor-clippings.ts";
import { groupByBook, parseClippings } from "./kindle-clippings.ts";
import type { Session } from "../types.ts";

/**
 * Anchoring is the part that fails silently.
 *
 * A wrong section index does not throw — it puts somebody's highlight on a
 * different chapter's page and looks like it worked. So these check where
 * marks land, not just how many.
 */

const BOOK = [
  "Call me Ishmael. Some years ago, never mind how long precisely,",
  "having little or no money in my purse, I thought I would sail about a little",
  "and see the watery part of the world.",
].join(" ");

const session = (over: Partial<Session> = {}): Session => ({
  title: "Moby-Dick",
  content: BOOK,
  openedAt: Date.now(),
  ...over,
});

const target = (over: Partial<AnchorTarget> = {}): AnchorTarget => ({
  sessions: [],
  highlights: {},
  bookmarks: [],
  ...over,
});

const clippings = (title: string, ...texts: string[]) =>
  groupByBook(
    parseClippings(
      texts
        .map(
          (text) =>
            `${title} (Author)\n- Your Highlight | Location 1 | Added on x\n\n${text}\n==========\n`,
        )
        .join(""),
    ),
  );

test("a quote found in a book becomes a real highlight", () => {
  const plan = planAnchoring(
    clippings("Moby-Dick", "and see the watery part of the world"),
    target({ sessions: [session()] }),
  );

  assert.equal(plan.result.anchored, 1);
  assert.equal(plan.result.notFound, 0);
  assert.equal(plan.result.kept, 0);

  const marks = Object.values(plan.highlights)[0]!;
  assert.equal(marks.length, 1);
  // Addressed, not merely counted.
  assert.equal(typeof marks[0]!.lineIdx, "number");
  assert.equal(typeof marks[0]!.section, "number");
  assert.ok(marks[0]!.end > marks[0]!.start);
  assert.match(marks[0]!.text, /watery part/);
});

test("a book that is not in the library keeps its quotes as notes", () => {
  const plan = planAnchoring(clippings("Some Other Book", "A line from it."), target());
  assert.equal(plan.result.anchored, 0);
  assert.equal(plan.result.kept, 1);
  assert.equal(plan.bookmarks[0]!.title, "Some Other Book");
  assert.equal(plan.bookmarks[0]!.content, "A line from it.");
});

test("a quote that is not in the text is reported, not invented", () => {
  const plan = planAnchoring(
    clippings("Moby-Dick", "This sentence appears in no edition of this book."),
    target({ sessions: [session()] }),
  );
  assert.equal(plan.result.anchored, 0);
  assert.equal(plan.result.notFound, 1);
  assert.equal(plan.result.kept, 0, "the book was here, so this is not a 'kept' case");
});

test("titles are matched across the punctuation editions disagree about", () => {
  const plan = planAnchoring(
    clippings("Moby Dick; or, The Whale", "and see the watery part of the world"),
    target({ sessions: [session({ title: "Moby-Dick" })] }),
  );
  assert.equal(plan.result.anchored, 1);
});

test("two unrelated short titles are not matched to each other", () => {
  // Containment on very short titles would match "It" to almost anything.
  const plan = planAnchoring(
    clippings("It", "and see the watery part of the world"),
    target({ sessions: [session({ title: "Fit" })] }),
  );
  assert.equal(plan.result.anchored, 0);
  assert.equal(plan.result.kept, 1);
});

test("importing the same file twice does not double the marks", () => {
  const books = clippings("Moby-Dick", "and see the watery part of the world");
  const first = planAnchoring(books, target({ sessions: [session()] }));
  const key = Object.keys(first.highlights)[0]!;

  const second = planAnchoring(
    books,
    target({ sessions: [session()], highlights: { [key]: first.highlights[key]! } }),
  );
  assert.equal(second.result.anchored, 0, "the mark was already there");
});

test("an existing highlight made in the app is never overwritten", () => {
  const books = clippings("Moby-Dick", "and see the watery part of the world");
  const plan = planAnchoring(books, target({ sessions: [session()] }));
  // The plan only ever adds; merging is the store's job and it concatenates.
  for (const marks of Object.values(plan.highlights)) {
    assert.ok(marks.every((mark) => mark.at > 0));
  }
});

test("a PDF keeps its quotes as notes rather than guessing a page", () => {
  // The reader sections PDFs by page, and the page list cannot be recovered
  // from the flattened text — so any anchor here would be confidently wrong.
  const plan = planAnchoring(
    clippings("Moby-Dick", "and see the watery part of the world"),
    target({ sessions: [session({ kind: "pdf" })] }),
  );
  assert.equal(plan.result.anchored, 0);
  assert.equal(plan.result.kept, 1);
});

test("a long quote still matches when the edition differs at its edges", () => {
  // Kindle wraps oddly and editions differ in punctuation, so the search uses
  // a middle slice rather than the whole passage.
  const plan = planAnchoring(
    clippings(
      "Moby-Dick",
      "“Call me Ishmael. Some years ago, never mind how long precisely, having little or no money in my purse…”",
    ),
    target({ sessions: [session()] }),
  );
  assert.equal(plan.result.anchored, 1);
});

test("an empty library and no clippings does nothing quietly", () => {
  const plan = planAnchoring([], target());
  assert.deepEqual(plan.highlights, {});
  assert.deepEqual(plan.bookmarks, []);
  assert.deepEqual(plan.result, { anchored: 0, kept: 0, notFound: 0, matchedBooks: 0 });
});
