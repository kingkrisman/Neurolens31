import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyPlainLanguage, simplifyText, swapPlainWord } from "./text-simplifier.ts";

describe("simplifyText", () => {
  it("replaces a single occurrence of a dense word", () => {
    const result = simplifyText("NeuroLens utilizes a recursive method.");
    assert.ok(result.replacements >= 1);
    assert.match(result.simplified, /uses/i);
    assert.doesNotMatch(result.simplified, /\butilizes\b/i);
  });

  it("rewrites academic samples into plainer wording", () => {
    const result = simplifyText(
      "This study investigates how adaptive formatting reduces visual entropy and has significant implications for neurodivergent learners.",
    );
    assert.ok(result.replacements >= 2);
    assert.ok(result.simplified.length > 20);
    assert.notEqual(result.simplified, result.original);
  });

  it("returns the original when the page is already plain", () => {
    const result = simplifyText("The cat sat on the mat.");
    assert.equal(result.replacements, 0);
    assert.match(result.simplified, /cat sat/);
  });

  it("keeps a period when a long sentence is split on a clause", () => {
    const result = simplifyText(
      "Readers who already work harder to hold attention, decode letterforms, or recover after a pause pay it more often, and they pay it in shorter sessions.",
    );
    assert.match(result.simplified, /sessions\./);
    assert.doesNotMatch(result.simplified, /sessions [A-Z]/);
  });

  it("swaps one word while keeping the original for the tooltip", () => {
    const hit = swapPlainWord("utilizes");
    assert.equal(hit.next, "uses");
    assert.equal(hit.original, "utilizes");
    assert.equal(swapPlainWord("cat").original, null);
  });

  it("applies live swaps without splitting sentences", () => {
    const live = applyPlainLanguage("NeuroLens utilizes a recursive method in order to help.");
    assert.match(live, /uses/);
    assert.match(live, /repeating/);
    assert.match(live, / to help/);
    assert.doesNotMatch(live, /in order to/);
  });

  it("leaves hyphenated compounds alone", () => {
    const live = applyPlainLanguage("fixation-aware content utilizes a method.");
    assert.match(live, /fixation-aware/);
    assert.doesNotMatch(live, /pause on a word-aware/);
    assert.match(live, /uses/);
  });
});
