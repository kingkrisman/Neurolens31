import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isAllowedGutenbergUrl,
  pickGutendexCover,
  pickGutendexTextUrl,
  stripGutenbergBoilerplate,
  gutendexSearchParams,
  fallbackGutendexSearch,
} from "./gutendex.ts";

describe("Gutendex helpers", () => {
  it("prefers UTF-8 plain text over HTML", () => {
    const url = pickGutendexTextUrl({
      "text/html": "https://www.gutenberg.org/ebooks/1342.html.images",
      "application/epub+zip": "https://www.gutenberg.org/ebooks/1342.epub3.images",
      "image/jpeg": "https://www.gutenberg.org/cache/epub/1342/pg1342.cover.medium.jpg",
      "text/plain; charset=utf-8": "https://www.gutenberg.org/ebooks/1342.txt.utf-8",
    });
    assert.equal(url, "https://www.gutenberg.org/ebooks/1342.txt.utf-8");
  });

  it("picks the cover jpeg", () => {
    assert.equal(
      pickGutendexCover({
        "image/jpeg": "https://www.gutenberg.org/cache/epub/11/pg11.cover.medium.jpg",
      }),
      "https://www.gutenberg.org/cache/epub/11/pg11.cover.medium.jpg",
    );
  });

  it("only allows Gutenberg file URLs", () => {
    assert.equal(isAllowedGutenbergUrl("https://www.gutenberg.org/ebooks/11.txt.utf-8"), true);
    assert.equal(isAllowedGutenbergUrl("https://www.gutenberg.org/cache/epub/11/pg11.txt"), true);
    assert.equal(isAllowedGutenbergUrl("https://evil.example/ebooks/11.txt"), false);
    assert.equal(isAllowedGutenbergUrl("https://www.gutenberg.org/about/"), false);
  });

  it("strips the Project Gutenberg header and footer", () => {
    const raw = `Preface junk
*** START OF THE PROJECT GUTENBERG EBOOK PRIDE AND PREJUDICE ***

It is a truth universally acknowledged.

*** END OF THE PROJECT GUTENBERG EBOOK PRIDE AND PREJUDICE ***
License text`;
    assert.equal(stripGutenbergBoilerplate(raw), "It is a truth universally acknowledged.");
  });

  it("searches English plain-text books by default", () => {
    const params = gutendexSearchParams("Austen");
    assert.equal(params.get("search"), "Austen");
    assert.equal(params.get("languages"), "en");
    assert.equal(params.get("mime_type"), "text/plain");
  });

  it("filters a local Gutenberg shelf when Gutendex is unreachable", () => {
    const austen = fallbackGutendexSearch("Austen");
    assert.equal(austen.source, "fallback");
    assert.ok(austen.results.some((book) => /Pride and Prejudice/i.test(book.title)));
    const darwin = fallbackGutendexSearch("Darwin");
    assert.ok(darwin.results.some((book) => /Origin of Species/i.test(book.title)));
  });
});
