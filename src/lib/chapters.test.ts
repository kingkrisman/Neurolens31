import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  chapterAtPage,
  detectChapters,
  headingTitle,
  joinTextChapters,
  paginateLongText,
  splitTextChapters,
} from "./chapters.ts";

const pride = `PRIDE AND PREJUDICE

CHAPTER I.

It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.

"My dear Mr. Bennet," said his lady to him one day, "have you heard that Netherfield Park is let at last?"

CHAPTER II.

Mr. Bennet was among the earliest of those who waited on Mr. Bingley. He had always intended to visit him, though to the last always assuring his wife that he should not go.

CHAPTER III.

Not all that Mrs. Bennet, however, with the assistance of her five daughters, could ask on the subject, was sufficient to draw from her husband any satisfactory description of Mr. Bingley.
`;

const sherlock = `THE ADVENTURES OF SHERLOCK HOLMES

I. A Scandal in Bohemia

To Sherlock Holmes she is always the woman. I have seldom heard him mention her under any other name. In his eyes she eclipses and predominates the whole of her sex.

II. The Red-Headed League

I had called upon my friend, Mr. Sherlock Holmes, one day in the autumn of last year and found him in deep conversation with a very stout, florid-faced, elderly gentleman with fiery red hair.

III. A Case of Identity

"My dear fellow," said Sherlock Holmes as we sat on either side of the fire, "life is infinitely stranger than anything which the mind of man could invent. We would not dare to conceive the things which are really mere commonplaces of existence."
`;

describe("headingTitle", () => {
  it("reads Gutenberg chapter labels", () => {
    assert.equal(headingTitle("CHAPTER I."), "Chapter I");
    assert.equal(headingTitle("CHAPTER 1. Loomings."), "Chapter 1 · Loomings");
    assert.equal(headingTitle("Letter 1"), "Letter 1");
    assert.equal(headingTitle("I. A Scandal in Bohemia"), "I. A Scandal in Bohemia");
  });

  it("ignores ordinary prose", () => {
    assert.equal(headingTitle("I went down to the village that morning."), null);
    assert.equal(headingTitle("The chapter was long and the night was longer still."), null);
  });
});

describe("splitTextChapters", () => {
  it("pages Pride and Prejudice by chapter", () => {
    const chapters = splitTextChapters(pride);
    assert.equal(chapters.length, 3);
    assert.equal(chapters[0].title, "Chapter I");
    assert.match(chapters[0].body, /truth universally acknowledged/);
    assert.match(chapters[1].body, /Mr\. Bennet was among/);
  });

  it("pages Sherlock-style roman titles", () => {
    const chapters = splitTextChapters(sherlock);
    assert.equal(chapters.length, 3);
    assert.equal(chapters[1].title, "II. The Red-Headed League");
  });

  it("does not split a short article", () => {
    assert.deepEqual(splitTextChapters("A brief note with no headings at all. Just a paragraph of reading."), []);
  });

  it("skips a table of contents cluster", () => {
    const withToc = `CONTENTS

CHAPTER I.
CHAPTER II.
CHAPTER III.

CHAPTER I.

${"It is a truth universally acknowledged. ".repeat(12)}

CHAPTER II.

${"Mr. Bennet was among the earliest of those who waited. ".repeat(12)}
`;
    const chapters = splitTextChapters(withToc);
    assert.equal(chapters.length, 2);
    assert.match(chapters[0].body, /truth universally/);
  });

  it("round-trips join then split", () => {
    const chapters = splitTextChapters(pride);
    const again = splitTextChapters(joinTextChapters(chapters));
    assert.equal(again.length, chapters.length);
  });
});

describe("detectChapters", () => {
  it("maps PDF pages onto chapter starts", () => {
    const pages = [
      "Title page of a novel",
      "CHAPTER I. It is a truth universally acknowledged, that a single man in possession of a good fortune must be in want of a wife. The family talked of little else.",
      "More of the first chapter continues on this leaf with dialogue between Mr. and Mrs. Bennet about Netherfield Park.",
      "CHAPTER II. Mr. Bennet was among the earliest of those who waited on Mr. Bingley. He had always intended to visit him.",
      "The visit itself, and the return, occupy the rest of this chapter with neighbourhood gossip.",
    ];
    const chapters = detectChapters(pages);
    assert.equal(chapters.length, 2);
    assert.equal(chapters[0].startPage, 2);
    assert.equal(chapters[0].endPage, 3);
    assert.equal(chapters[1].startPage, 4);
    assert.equal(chapterAtPage(chapters, 3), 1);
    assert.equal(chapterAtPage(chapters, 4), 2);
  });
});

describe("paginateLongText", () => {
  const para = (n: number) =>
    `${"word ".repeat(200).trim()} This is paragraph ${n} of the sample text.`;
  const long = Array.from({ length: 80 }, (_, i) => para(i + 1)).join("\n\n");

  it("leaves short text alone", () => {
    assert.deepEqual(paginateLongText("A short note that nobody needs paged."), []);
  });

  it("splits a long text into multiple parts", () => {
    const parts = paginateLongText(long);
    assert.ok(parts.length > 1, "expected more than one part");
    assert.equal(parts[0].title, "Part 1");
  });

  it("preserves every word and the paragraph breaks", () => {
    const parts = paginateLongText(long);
    const rejoined = parts.map((part) => part.body).join("\n\n");
    assert.equal(
      rejoined.split(/\s+/).length,
      long.split(/\s+/).length,
      "pagination must not drop or add words",
    );
    assert.ok(parts[0].body.includes("\n\n"), "paragraph breaks should survive");
  });

  it("never splits mid-paragraph", () => {
    for (const part of paginateLongText(long)) {
      for (const block of part.body.split("\n\n")) {
        assert.match(block.trim(), /paragraph \d+ of the sample text\.$/);
      }
    }
  });
});
