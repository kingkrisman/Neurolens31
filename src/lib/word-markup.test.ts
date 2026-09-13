import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chunkByMinutes, decorateLine, decorateWord, wordAtChar, wordAtOffset } from "./word-markup.ts";

describe("word markup", () => {
  it("marks syllables inside constitution", () => {
    const html = decorateWord("constitution", { syllables: true });
    assert.match(html, /syl-dot/);
    assert.match(html, /con/);
  });

  it("color-codes confusing letters", () => {
    const html = decorateWord("bed", { letterGuide: true });
    assert.match(html, /letter-b/);
    assert.match(html, /letter-d/);
  });

  it("maps speech char index onto a word", () => {
    assert.equal(wordAtChar("The cat sat.", 4), 1);
  });

  it("chunks a long passage by minutes", () => {
    const words = Array.from({ length: 900 }, (_, i) => `word${i}`).join(" ");
    const chunks = chunkByMinutes(words, 200, 3);
    assert.ok(chunks.length >= 2);
  });

  it("pulls a word from a character offset without wrapping the line", () => {
    assert.equal(wordAtOffset("The cat sat.", 5), "cat");
    assert.equal(wordAtOffset("The cat sat.", 3), "The");
    assert.equal(wordAtOffset("The cat sat.", 7), "cat");
    assert.equal(wordAtOffset("I am.", 0), null);
  });

  it("keeps every letter when marking a cluster", () => {
    const html = decorateWord("The", { letterGuide: true });
    assert.equal(html.replace(/<[^>]+>/g, ""), "The");
    assert.match(html, /letter-cluster/);
  });

  it("decorates a whole line as one HTML string", () => {
    const html = decorateLine("The bed.", { letterGuide: true });
    assert.match(html, /letter-b/);
    assert.match(html, /letter-d/);
    assert.match(html, /\./);
  });

  it("wraps a swapped word so the original can be read on hover", () => {
    const html = decorateWord("utilizes", { plainLanguage: true });
    assert.match(html, /plain-swap/);
    assert.match(html, /Was: utilizes/);
    assert.match(html.replace(/<[^>]+>/g, ""), /uses/);
  });

  it("does not rewrite a hyphenated compound from one of its halves", () => {
    const html = decorateLine("fixation-aware content utilizes a method.", { plainLanguage: true });
    assert.match(html, /fixation-aware/);
    assert.doesNotMatch(html.replace(/<[^>]+>/g, ""), /pause on a word-aware/);
    assert.match(html, /plain-swap/);
    assert.match(html.replace(/<[^>]+>/g, ""), /uses/);
  });
});
