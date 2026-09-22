import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bestAcquisition,
  collapseEditions,
  entryByline,
  isNavigation,
  parseOpds,
  type OpdsEntry,
} from "./parse.ts";

/**
 * The OPDS 2.0 (JSON) path and the shared helpers.
 *
 * The Atom path needs `DOMParser`, which Node does not have, so it is covered
 * by `tests/connect.spec.ts` in a real browser against a real feed shape. Saying
 * so here because a file of tests that quietly skips half its module is worse
 * than one that admits where the other half lives.
 */

const entry = (over: Partial<OpdsEntry> = {}): OpdsEntry => ({
  id: "x",
  title: "A Book",
  authors: [],
  summary: null,
  language: null,
  updated: null,
  coverUrl: null,
  acquisitions: [],
  navigationUrl: null,
  ...over,
});

const BASE = "https://books.example.com/opds";

test("an OPDS 2.0 feed parses", () => {
  const feed = parseOpds(
    JSON.stringify({
      metadata: { title: "My Library" },
      publications: [
        {
          metadata: {
            identifier: "urn:isbn:1",
            title: "Moby-Dick",
            author: { name: "Herman Melville" },
            description: "A whale.",
            language: "en",
          },
          images: [{ href: "/covers/1.jpg" }],
          links: [{ href: "/books/1.epub", type: "application/epub+zip" }],
        },
      ],
      links: [{ href: "/opds?page=2", rel: "next" }],
    }),
    BASE,
  );

  assert.equal(feed?.title, "My Library");
  assert.equal(feed?.entries.length, 1);
  const book = feed!.entries[0]!;
  assert.equal(book.title, "Moby-Dick");
  assert.deepEqual(book.authors, ["Herman Melville"]);
  assert.equal(book.summary, "A whale.");
  // Relative hrefs are resolved against the feed, so nothing downstream needs
  // to know where the feed came from.
  assert.equal(book.coverUrl, "https://books.example.com/covers/1.jpg");
  assert.equal(book.acquisitions[0]!.href, "https://books.example.com/books/1.epub");
  assert.equal(feed?.nextUrl, "https://books.example.com/opds?page=2");
});

test("several authors, written either way, all arrive", () => {
  const feed = parseOpds(
    JSON.stringify({
      publications: [
        {
          metadata: { title: "A", author: ["One", { name: "Two" }] },
          links: [{ href: "/a.epub", type: "application/epub+zip" }],
        },
      ],
    }),
    BASE,
  );
  assert.deepEqual(feed?.entries[0]!.authors, ["One", "Two"]);
});

test("navigation links become entries that lead somewhere", () => {
  const feed = parseOpds(
    JSON.stringify({
      navigation: [{ href: "/opds/fiction", title: "Fiction", type: "application/opds+json" }],
    }),
    BASE,
  );
  const nav = feed!.entries[0]!;
  assert.equal(nav.title, "Fiction");
  assert.equal(isNavigation(nav), true);
  assert.equal(nav.navigationUrl, "https://books.example.com/opds/fiction");
});

test("a publication with no title is skipped rather than shown blank", () => {
  const feed = parseOpds(
    JSON.stringify({ publications: [{ metadata: {} }, { metadata: { title: "Real" } }] }),
    BASE,
  );
  assert.equal(feed?.entries.length, 1);
  assert.equal(feed?.entries[0]!.title, "Real");
});

test("junk yields null rather than throwing", () => {
  for (const body of ["", "   ", "{", "{}", "not xml or json", "<html><body>hi</body></html>"]) {
    assert.doesNotThrow(() => parseOpds(body, BASE), body);
  }
  assert.equal(parseOpds("{ broken", BASE), null);
  assert.equal(parseOpds("", BASE), null);
});

test("plain text is preferred over EPUB, and EPUB over PDF", () => {
  // The order the reader handles best, not the order the server listed.
  const all = entry({
    acquisitions: [
      { href: "/a.pdf", type: "application/pdf", rel: null },
      { href: "/a.epub", type: "application/epub+zip", rel: null },
      { href: "/a.txt", type: "text/plain; charset=utf-8", rel: null },
    ],
  });
  assert.equal(bestAcquisition(all)?.href, "/a.txt");

  const noText = entry({
    acquisitions: [
      { href: "/a.pdf", type: "application/pdf", rel: null },
      { href: "/a.epub", type: "application/epub+zip", rel: null },
    ],
  });
  assert.equal(bestAcquisition(noText)?.href, "/a.epub");
});

test("borrow and buy links are never offered as downloads", () => {
  // Those are DRM flows this app has no part in; a download that turns into a
  // paywall is worse than no download.
  const loan = entry({
    acquisitions: [
      { href: "/borrow/1", type: "application/epub+zip", rel: "borrow" },
      { href: "/buy/1", type: "application/epub+zip", rel: "buy" },
    ],
  });
  assert.equal(bestAcquisition(loan), null);
});

test("open-access is offered", () => {
  const free = entry({
    acquisitions: [{ href: "/a.epub", type: "application/epub+zip", rel: "open-access" }],
  });
  assert.equal(bestAcquisition(free)?.href, "/a.epub");
});

test("a format the reader cannot open is not offered", () => {
  const audio = entry({ acquisitions: [{ href: "/a.mp3", type: "audio/mpeg", rel: null }] });
  assert.equal(bestAcquisition(audio), null);
});

test("an entry with files is a book, not a folder", () => {
  assert.equal(
    isNavigation(
      entry({ acquisitions: [{ href: "/a.epub", type: "application/epub+zip", rel: null }] }),
    ),
    false,
  );
  assert.equal(isNavigation(entry({ navigationUrl: "/more" })), true);
  assert.equal(isNavigation(entry()), false);
});

test("a plain Atom enclosure counts as a download", () => {
  // Standard Ebooks publishes a straight Atom feed whose books hang off
  // `rel="enclosure"` rather than the OPDS acquisition rel. Treating only the
  // OPDS rel as a file made every entry there look unopenable — the catalogue
  // loaded and was full of books that could not be read.
  const feed = parseOpds(
    JSON.stringify({
      publications: [
        {
          metadata: { title: "Contending Forces", author: "Pauline E. Hopkins" },
          links: [
            {
              href: "/downloads/contending-forces.epub",
              type: "application/epub+zip",
              rel: "enclosure",
            },
          ],
        },
      ],
    }),
    BASE,
  );
  // The JSON path routes any non-catalogue link to acquisitions, so this
  // asserts the shared outcome; the Atom path is covered in tests/opds.spec.ts.
  assert.equal(bestAcquisition(feed!.entries[0]!)?.type, "application/epub+zip");
});

test("two editions of one book collapse to one row", () => {
  const epub = { href: "https://x.test/a.epub", type: "application/epub+zip", rel: null };
  const rows = collapseEditions([
    entry({
      id: "1",
      title: "Pride and Prejudice",
      authors: ["Austen, Jane"],
      acquisitions: [epub],
    }),
    entry({
      id: "2",
      title: "Pride and Prejudice",
      authors: ["Austen, Jane"],
      acquisitions: [epub],
    }),
    entry({ id: "3", title: "Emma", authors: ["Austen, Jane"], acquisitions: [epub] }),
  ]);
  assert.deepEqual(
    rows.map((row) => row.id),
    ["1", "3"],
  );
});

test("folders are never collapsed, even with the same title", () => {
  const folder = (id: string) =>
    entry({ id, title: "Fiction", navigationUrl: `https://x.test/${id}`, acquisitions: [] });
  assert.equal(collapseEditions([folder("a"), folder("b")]).length, 2);
});

test("the byline falls back to a short summary, never a long one", () => {
  assert.equal(entryByline(entry({ authors: ["Mary Shelley"] })), "Mary Shelley");
  assert.equal(entryByline(entry({ summary: "  Jane\n Austen " })), "Jane Austen");
  assert.equal(entryByline(entry({ summary: "x".repeat(200) })), null);
  assert.equal(entryByline(entry()), null);
});
