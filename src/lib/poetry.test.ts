import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FEATURED_POEMS,
  OZYMANDIAS_LINES_URL,
  poemToReaderText,
  poetryAuthorUrl,
  poetryTitleUrl,
} from "./poetry.ts";

describe("PoetryDB", () => {
  it("uses the specified Ozymandias lines endpoint", () => {
    assert.equal(OZYMANDIAS_LINES_URL, "https://poetrydb.org/title/Ozymandias/lines.json");
    assert.equal(FEATURED_POEMS[0]?.url, OZYMANDIAS_LINES_URL);
    assert.equal(FEATURED_POEMS[0]?.title, "Ozymandias");
  });

  it("builds title and author urls", () => {
    assert.equal(poetryTitleUrl("Ozymandias"), "https://poetrydb.org/title/Ozymandias");
    assert.equal(
      poetryAuthorUrl("Percy Bysshe Shelley"),
      "https://poetrydb.org/author/Percy%20Bysshe%20Shelley",
    );
  });

  it("encodes Dickinson’s quoted title", () => {
    const title = FEATURED_POEMS[3]?.title ?? "";
    assert.match(title, /^"Hope"/);
    assert.match(poetryTitleUrl(title), /poetrydb\.org\/title\/%22Hope%22/);
  });

  it("formats a poem for the reader", () => {
    const text = poemToReaderText({
      title: "Ozymandias",
      author: "Percy Bysshe Shelley",
      lines: ["I met a traveller from an antique land", "Who said: Two vast and trunkless legs of stone"],
    });
    assert.match(text, /^Ozymandias/);
    assert.match(text, /Percy Bysshe Shelley/);
    assert.match(text, /antique land/);
  });
});
