import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { highlightsToMarkdown } from "./reading-export.ts";

const groups = [
  {
    title: "Moby Dick",
    marks: [
      { text: "Call me Ishmael.", section: 1 },
      { text: "It is a way I have of driving off the spleen.", note: "The thesis.", section: 2 },
    ],
  },
  { title: "Empty Book", marks: [] },
];

describe("highlightsToMarkdown", () => {
  it("groups passages under the book they came from", () => {
    const md = highlightsToMarkdown(groups);
    assert.match(md, /^# Highlights/);
    assert.match(md, /## Moby Dick/);
    assert.match(md, /> Call me Ishmael\./);
  });

  it("quotes passages so they survive as blockquotes", () => {
    const md = highlightsToMarkdown([{ title: "B", marks: [{ text: "One.", section: 0 }] }]);
    assert.ok(md.includes("> One."));
  });

  it("keeps a note with the passage it belongs to", () => {
    const md = highlightsToMarkdown(groups);
    const quoteAt = md.indexOf("driving off the spleen");
    const noteAt = md.indexOf("The thesis.");
    assert.ok(noteAt > quoteAt, "the note must follow its own passage");
  });

  it("flattens a multi-line passage, so the blockquote stays one block", () => {
    const md = highlightsToMarkdown([
      { title: "B", marks: [{ text: "First line\n\nsecond line", section: 0 }] },
    ]);
    assert.ok(md.includes("> First line second line"));
    assert.ok(!md.includes("> First line\n\nsecond"));
  });

  it("omits a book with nothing marked in it", () => {
    assert.ok(!highlightsToMarkdown(groups).includes("Empty Book"));
  });

  it("counts what it exported", () => {
    assert.match(highlightsToMarkdown(groups), /2 passages from NeuroLens\./);
  });

  it("uses the singular for one passage", () => {
    const md = highlightsToMarkdown([{ title: "B", marks: [{ text: "One.", section: 0 }] }]);
    assert.match(md, /1 passage from NeuroLens\./);
  });

  it("produces a valid document when nothing is marked at all", () => {
    const md = highlightsToMarkdown([]);
    assert.match(md, /^# Highlights/);
    assert.match(md, /0 passages/);
  });
});
