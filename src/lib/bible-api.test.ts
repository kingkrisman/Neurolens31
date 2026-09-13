import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { BIBLE_BOOKS } from "./bible.ts";
import {
  BIBLE_TRANSLATIONS,
  HELLOAO_BOOK_IDS,
  bibleApiUrl,
  fetchPassage,
  helloaoUrl,
  parseReference,
  passageToReaderText,
  resolveBookName,
} from "./bible-api.ts";
import { RemoteError } from "./remote.ts";

describe("bible-api.com references", () => {
  it("builds BOOK+CHAPTER:VERSE urls with translation query", () => {
    assert.equal(bibleApiUrl({ book: "John", chapter: 3, verse: 16 }), "https://bible-api.com/John+3:16");
    assert.equal(bibleApiUrl({ book: "John", chapter: 3 }), "https://bible-api.com/John+3");
    assert.equal(
      bibleApiUrl({ book: "1 Corinthians", chapter: 13 }),
      "https://bible-api.com/1+Corinthians+13",
    );
    assert.equal(
      bibleApiUrl({ book: "Psalms", chapter: 23, verse: "1-3" }),
      "https://bible-api.com/Psalms+23:1-3",
    );
    assert.equal(
      bibleApiUrl({ book: "John", chapter: 3, verse: 16 }, "kjv"),
      "https://bible-api.com/John+3:16?translation=kjv",
    );
    assert.equal(
      bibleApiUrl({ book: "John", chapter: 3, verse: 16 }, "bsb"),
      "https://bible-api.com/John+3:16",
    );
  });

  it("builds HelloAO chapter urls", () => {
    assert.equal(
      helloaoUrl({ book: "John", chapter: 3 }, "BSB"),
      "https://bible.helloao.org/api/BSB/JHN/3.json",
    );
    assert.equal(
      helloaoUrl({ book: "Song of Solomon", chapter: 1 }, "ENGWEBP"),
      "https://bible.helloao.org/api/ENGWEBP/SNG/1.json",
    );
  });

  it("maps every canon book to a HelloAO id", () => {
    assert.equal(BIBLE_BOOKS.length, 66);
    for (const book of BIBLE_BOOKS) {
      assert.ok(HELLOAO_BOOK_IDS[book.name], `missing HelloAO id for ${book.name}`);
    }
  });

  it("lists English translations from bible-api and HelloAO", () => {
    assert.ok(BIBLE_TRANSLATIONS.some((item) => item.id === "web" && item.bibleApi && item.helloao));
    assert.ok(BIBLE_TRANSLATIONS.some((item) => item.id === "kjv"));
    assert.ok(BIBLE_TRANSLATIONS.some((item) => item.id === "bsb" && item.helloao === "BSB"));
  });

  it("parses typed references and aliases", () => {
    assert.deepEqual(parseReference("John 3:16"), { book: "John", chapter: 3, verse: "16" });
    assert.deepEqual(parseReference("psalm 23"), { book: "Psalms", chapter: 23 });
    assert.deepEqual(parseReference("1 cor 13"), { book: "1 Corinthians", chapter: 13 });
    assert.equal(parseReference("not a verse"), null);
    assert.equal(parseReference("John 999"), null);
  });

  it("resolves the 66-book catalog", () => {
    assert.equal(resolveBookName("jn"), "John");
    assert.equal(resolveBookName("Song of Songs"), "Song of Solomon");
  });

  it("formats a passage for the reader", () => {
    const text = passageToReaderText({
      reference: "John 3:16",
      text: "For God so loved the world.",
      verses: [{ book: "John", chapter: 3, verse: 16, text: "For God so loved the world." }],
      translationId: "web",
      translationName: "World English Bible",
      source: "bible-api",
    });
    assert.match(text, /^John 3:16/);
    assert.match(text, /World English Bible/);
    // `{2}` rather than two literal spaces: the double gap after the verse
    // number is the thing being asserted, and two spaces in a row are
    // invisible in review — easy to "fix" to one and silently weaken the test.
    assert.match(text, /16 {2}For God so loved the world\./);
  });
});

describe("fetchPassage errors", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("surfaces a RemoteError when both bible-api and HelloAO fail", async () => {
    globalThis.fetch = (async () => new Response("down", { status: 503 })) as typeof fetch;
    await assert.rejects(
      () => fetchPassage({ book: "John", chapter: 3, verse: 16 }, { translation: "web" }),
      (error: unknown) => {
        assert.ok(error instanceof RemoteError);
        assert.equal(error.kind, "http");
        assert.equal(error.status, 503);
        return true;
      },
    );
  });

  it("falls back to HelloAO when bible-api is empty", async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input);
      if (url.includes("bible-api.com")) {
        return new Response(JSON.stringify({ verses: [] }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          translation: { englishName: "World English Bible" },
          book: { name: "John" },
          chapter: {
            number: 3,
            content: [{ type: "verse", number: 16, content: "For God so loved the world." }],
          },
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const passage = await fetchPassage({ book: "John", chapter: 3, verse: 16 }, { translation: "web" });
    assert.equal(passage.source, "helloao");
    assert.equal(passage.verses[0]?.text, "For God so loved the world.");
  });
});
