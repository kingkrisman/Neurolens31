import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { lookupWord, normalizeLookupWord } from "./dictionary.ts";

describe("dictionary lookup", () => {
  it("normalizes punctuation and case", () => {
    assert.equal(normalizeLookupWord("Fixation,"), "fixation");
    assert.equal(normalizeLookupWord("ADHD"), "adhd");
  });

  it("returns a local sense for NeuroLens vocabulary without a network", async () => {
    const sense = await lookupWord("fixation");
    assert.ok(sense);
    assert.equal(sense?.word, "fixation");
    assert.ok((sense?.definition.length ?? 0) > 12);
    assert.equal(sense?.source, "local");
  });

  it("ignores one-letter tokens", async () => {
    assert.equal(await lookupWord("a"), null);
    assert.equal(await lookupWord("I"), null);
  });
});
