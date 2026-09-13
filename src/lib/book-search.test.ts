import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { lineIdOf, searchBook } from "./book-search.ts";

const CH1 = "The quiet room held its breath. She opened the book slowly.\n\nReading felt easier here.";
const CH2 = "He returned to the quiet room at dusk.\n\nNothing had moved since morning.";

describe("searchBook", () => {
  it("finds a phrase and reports where to go for it", () => {
    const hits = searchBook([CH1, CH2], "quiet room");
    assert.equal(hits.length, 2);
    assert.equal(hits[0]!.section, 1);
    assert.equal(hits[1]!.section, 2);
    assert.ok(hits[0]!.text.includes("quiet room"));
  });

  it("numbers a single-section book as section 0, the way the reader does", () => {
    const hits = searchBook([CH1], "book");
    assert.equal(hits[0]!.section, 0);
  });

  it("ignores case", () => {
    assert.equal(searchBook([CH1], "QUIET ROOM").length, 1);
  });

  it("matches across accents, and still slices the original text", () => {
    const hits = searchBook(["They met at the café on Tuesday."], "cafe");
    assert.equal(hits.length, 1);
    const hit = hits[0]!;
    // The offsets must address the real string, not the folded one — otherwise
    // the highlight lands a character off on any accented line.
    assert.equal(hit.text.slice(hit.start, hit.end), "café");
  });

  it("points offsets at the matched span, not the start of the line", () => {
    const hits = searchBook(["The quiet room held its breath."], "room");
    const hit = hits[0]!;
    assert.equal(hit.text.slice(hit.start, hit.end), "room");
  });

  it("returns nothing for a query too short to be meaningful", () => {
    assert.deepEqual(searchBook([CH1], "a"), []);
    assert.deepEqual(searchBook([CH1], "   "), []);
  });

  it("returns nothing when the phrase is absent", () => {
    assert.deepEqual(searchBook([CH1, CH2], "helicopter"), []);
  });

  it("stops at the limit rather than walking a whole novel", () => {
    const many = Array.from({ length: 50 }, () => "the word appears here.").join("\n\n");
    assert.equal(searchBook([many], "word", { limit: 5 }).length, 5);
  });

  it("derives line ids the same way the reader does", () => {
    assert.equal(lineIdOf(0, 0, 0), 0);
    assert.equal(lineIdOf(1, 0, 0), 1000);
    assert.equal(lineIdOf(0, 1, 0), 40);
    assert.equal(lineIdOf(2, 1, 3), 2043);
  });

  it("gives a second sentence in the same block a distinct id", () => {
    const hits = searchBook(["First sentence here. Second sentence here."], "sentence");
    assert.equal(hits.length, 2);
    assert.notEqual(hits[0]!.lineIdx, hits[1]!.lineIdx);
  });
});
