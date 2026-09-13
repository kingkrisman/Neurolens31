import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { syllabify, withSyllableMarks } from "./syllables.ts";

describe("syllabify", () => {
  it("leaves short function words alone", () => {
    assert.deepEqual(syllabify("the"), ["the"]);
    assert.deepEqual(syllabify("of"), ["of"]);
  });

  it("breaks constitution into phonetic chunks", () => {
    assert.equal(withSyllableMarks("constitution"), "con·sti·tu·tion");
  });

  it("keeps prefixes and suffixes", () => {
    const marks = withSyllableMarks("rereading");
    assert.match(marks, /re/);
    assert.match(marks, /ing/);
    assert.ok(marks.includes("·"));
  });

  it("preserves capitalization and punctuation", () => {
    const parts = syllabify("Reading,");
    assert.ok(parts.join("").startsWith("Read"));
    assert.ok(parts.join("").endsWith(","));
  });
});
