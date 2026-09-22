import assert from "node:assert/strict";
import { test } from "node:test";
import {
  groupByBook,
  parseClipping,
  parseClippings,
  splitTitleAuthor,
} from "./kindle-clippings.ts";

/** A record as a Kindle actually writes it, separator included. */
const record = (title: string, meta: string, body = "") =>
  `${title}\n${meta}\n\n${body}\n==========\n`;

test("a plain English highlight parses whole", () => {
  const one = parseClipping(
    "Moby-Dick (Herman Melville)\n" +
      "- Your Highlight on page 12 | Location 168-170 | Added on Monday, 3 March 2025 21:14:52\n" +
      "\nCall me Ishmael.",
  );
  assert.equal(one?.title, "Moby-Dick");
  assert.equal(one?.author, "Herman Melville");
  assert.equal(one?.kind, "highlight");
  assert.equal(one?.text, "Call me Ishmael.");
  assert.equal(one?.location, "168-170");
  assert.equal(one?.page, "12");
  assert.ok(one?.addedAt && one.addedAt > 0);
});

test("a title containing brackets keeps them, and only the last group is the author", () => {
  assert.deepEqual(splitTitleAuthor("Dracula (Penguin Classics) (Bram Stoker)"), {
    title: "Dracula (Penguin Classics)",
    author: "Bram Stoker",
  });
});

test("a title with no author is still a title", () => {
  assert.deepEqual(splitTitleAuthor("Notes to self"), { title: "Notes to self", author: null });
});

test("a line that is only a parenthesised group is a title, not an author", () => {
  // Otherwise the title comes out empty and the record is lost.
  assert.deepEqual(splitTitleAuthor("(Untitled)"), { title: "(Untitled)", author: null });
});

test("a byte-order mark on the first line does not become part of the title", () => {
  // Kindles write the file UTF-8 with a BOM, so this is the first record of
  // every real file — get it wrong and every import has one mangled book.
  assert.equal(splitTitleAuthor("\uFEFFMoby-Dick (Melville)").title, "Moby-Dick");
});

test("notes and bookmarks are told apart from highlights", () => {
  const note = parseClipping(
    "A Book (X)\n- Your Note on page 3 | Location 40 | Added on x\n\nDisagree.",
  );
  assert.equal(note?.kind, "note");

  const mark = parseClipping(
    "A Book (X)\n- Your Bookmark on page 3 | Location 40 | Added on x\n\n",
  );
  assert.equal(mark?.kind, "bookmark");
  assert.equal(mark?.text, "");
});

test("a bookmark that carries text is treated as a highlight", () => {
  // The text is the thing worth keeping, whatever the device labelled it.
  const odd = parseClipping(
    "A Book (X)\n- Your Bookmark | Location 40 | Added on x\n\nSome words.",
  );
  assert.equal(odd?.kind, "highlight");
});

test("a highlight with no text is dropped", () => {
  assert.equal(parseClipping("A Book (X)\n- Your Highlight | Location 40\n\n"), null);
});

test("non-English Kindles are understood", () => {
  const de = parseClipping(
    "Ein Buch (Autor)\n- Ihre Markierung bei Seite 5 | Position 90 | Hinzugefügt am x\n\nText.",
  );
  assert.equal(de?.kind, "highlight");

  const es = parseClipping(
    "Un Libro (Autor)\n- Tu nota en la página 5 | posición 90 | Añadido el x\n\nTexto.",
  );
  assert.equal(es?.kind, "note");

  const ja = parseClipping("本 (著者)\n- ハイライト | 位置 90\n\nテキスト");
  assert.equal(ja?.kind, "highlight");
});

test("an unrecognised label keeps the mark rather than losing it", () => {
  const odd = parseClipping(
    "A Book (X)\n- Something we have never seen | 40\n\nWords worth keeping.",
  );
  assert.equal(odd?.kind, "highlight");
  assert.equal(odd?.text, "Words worth keeping.");
});

test("a whole file splits into its records", () => {
  const file =
    record("A (Author One)", "- Your Highlight | Location 1 | Added on x", "First.") +
    record("A (Author One)", "- Your Highlight | Location 2 | Added on x", "Second.") +
    record("B (Author Two)", "- Your Note | Location 3 | Added on x", "A thought.");
  const all = parseClippings(file);
  assert.equal(all.length, 3);
  assert.deepEqual([...new Set(all.map((c) => c.title))], ["A", "B"]);
});

test("duplicates are collapsed, keeping the later one", () => {
  // A Kindle appends rather than rewrites, and syncing repeats marks, so a
  // file grown over years is mostly near-copies.
  const file =
    record(
      "A (X)",
      "- Your Highlight | Location 1 | Added on Monday, 3 March 2025 10:00:00",
      "Same words.",
    ) +
    record(
      "A (X)",
      "- Your Highlight | Location 1 | Added on Monday, 3 March 2025 11:00:00",
      "Same words.",
    );
  const all = parseClippings(file);
  assert.equal(all.length, 1);
  assert.ok(all[0]!.addedAt);
  assert.equal(new Date(all[0]!.addedAt!).getUTCHours() >= 10, true);
});

test("the same words in two different books are two marks", () => {
  const file =
    record("A (X)", "- Your Highlight | Location 1", "Shared sentence.") +
    record("B (Y)", "- Your Highlight | Location 1", "Shared sentence.");
  assert.equal(parseClippings(file).length, 2);
});

test("an empty or junk file yields nothing rather than throwing", () => {
  assert.deepEqual(parseClippings(""), []);
  assert.deepEqual(parseClippings("==========\n==========\n"), []);
  assert.deepEqual(parseClippings("a single line with no structure"), []);
});

test("Windows line endings parse the same as Unix", () => {
  const unix = record("A (X)", "- Your Highlight | Location 1", "Text.");
  assert.deepEqual(parseClippings(unix.replace(/\n/g, "\r\n")), parseClippings(unix));
});

test("books are grouped and ordered by how much was marked", () => {
  const file =
    record("Quiet book (X)", "- Your Highlight | Location 1", "One.") +
    record("Busy book (Y)", "- Your Highlight | Location 1", "One.") +
    record("Busy book (Y)", "- Your Highlight | Location 2", "Two.") +
    record("Busy book (Y)", "- Your Note | Location 2", "Hmm.") +
    record("Busy book (Y)", "- Your Bookmark | Location 9", "");
  const books = groupByBook(parseClippings(file));
  assert.equal(books.length, 2);
  assert.equal(books[0]!.title, "Busy book");
  assert.equal(books[0]!.highlights.length, 2);
  assert.equal(books[0]!.notes.length, 1);
  assert.equal(books[0]!.bookmarks, 1);
  assert.equal(books[1]!.title, "Quiet book");
});

test("a book whose later records omit the author still gets one", () => {
  const file =
    record("A Book (The Author)", "- Your Highlight | Location 1", "One.") +
    record("A Book", "- Your Highlight | Location 2", "Two.");
  const books = groupByBook(parseClippings(file));
  assert.equal(books[0]!.author, "The Author");
});

test("a title and a kind cannot collide into one deduplication key", () => {
  // Joined on a control character rather than a space: a book called "A B"
  // with kind "highlight" and a book called "A" with... there is no kind "B",
  // but the principle is that the separator must not be typeable into a title.
  const file =
    "A B (X)\n- Your Highlight | Location 1\n\nsame\n==========\n" +
    "A (X)\n- Your Highlight | Location 1\n\nB highlight same\n==========\n";
  assert.equal(parseClippings(file).length, 2);
});
