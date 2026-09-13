import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { textFromItems, type PdfTextItem } from "./pdf-text.ts";

/**
 * A pdf.js text item. `width` is the advance of the run, which is what makes
 * the gap between one run and the next measurable.
 */
function item(
  str: string,
  x: number,
  y: number,
  width: number,
  size = 11,
  hasEOL = false,
): PdfTextItem {
  return { str, transform: [size, 0, 0, size, x, y], width, height: size, hasEOL };
}

/** One visual line: runs laid left to right, the last one ending the line. */
function line(y: number, size: number, runs: Array<[string, number, number]>): PdfTextItem[] {
  return runs.map(([str, x, width], i) =>
    item(str, x, y, width, size, i === runs.length - 1),
  );
}

describe("textFromItems", () => {
  it("does not break a word apart at a kerning boundary", () => {
    // The bug as it appeared in a real book: pdf.js splits "CHAPTER" into two
    // runs, and joining runs with a space rendered it "CHAPT ER".
    const items = line(700, 11, [
      ["CHAPT", 100, 40],
      ["ER", 140, 16],
    ]);
    assert.equal(textFromItems(items), "CHAPTER");
  });

  it("still puts a space where the page left one", () => {
    const items = line(700, 11, [
      ["Four", 100, 30],
      ["Walls", 138, 34],
    ]);
    assert.equal(textFromItems(items), "Four Walls");
  });

  it("keeps a heading off the front of the sentence below it", () => {
    // "CHAPTER ONE" set large, body text beneath. These used to arrive as one
    // run-on line.
    const items = [
      ...line(700, 20, [["CHAPTER ONE", 100, 160]]),
      ...line(660, 11, [["It was not so much that", 100, 150]]),
    ];
    assert.equal(textFromItems(items), "CHAPTER ONE\n\nIt was not so much that");
  });

  it("reflows the lines inside a paragraph", () => {
    // Hard line breaks belong to the book's column, not to the reader's.
    const items = [
      ...line(660, 11, [["the complacent normality of", 100, 150]]),
      ...line(647, 11, [["butcher's shop and royal parlour", 100, 150]]),
      ...line(634, 11, [["alike.", 100, 40]]),
    ];
    assert.equal(
      textFromItems(items),
      "the complacent normality of butcher's shop and royal parlour alike.",
    );
  });

  it("splits a paragraph where the leading opens up", () => {
    const items = [
      ...line(660, 11, [["end of the first paragraph.", 100, 150]]),
      ...line(647, 11, [["still the first paragraph.", 100, 150]]),
      // A gap well beyond the 13pt leading above.
      ...line(600, 11, [["A second paragraph.", 100, 150]]),
    ];
    assert.equal(
      textFromItems(items),
      "end of the first paragraph. still the first paragraph.\n\nA second paragraph.",
    );
  });

  it("rejoins a word hyphenated across a line break", () => {
    const items = [
      ...line(660, 11, [["conscious-", 100, 60]]),
      ...line(647, 11, [["ness", 100, 30]]),
    ];
    assert.equal(textFromItems(items), "consciousness");
  });

  it("leaves a real dash alone", () => {
    // An em-dash ending a line is punctuation, not a broken word.
    const items = [
      ...line(660, 11, [["not simply breaking —", 100, 120]]),
      ...line(647, 11, [["it shattered", 100, 80]]),
    ];
    assert.equal(textFromItems(items), "not simply breaking — it shattered");
  });

  it("survives items with no geometry at all", () => {
    // Some producers omit the matrix. Better plain text than a crash.
    const items: PdfTextItem[] = [
      { str: "Hello" },
      { str: "world", hasEOL: true },
    ];
    assert.equal(typeof textFromItems(items), "string");
    assert.match(textFromItems(items), /Hello/);
  });

  it("returns nothing for a page with no text", () => {
    assert.equal(textFromItems([]), "");
    assert.equal(textFromItems([{ str: "   ", hasEOL: true }]), "");
  });
});
