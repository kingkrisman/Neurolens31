import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isSentenceBoundary, splitSentenceSpans, splitSentences } from "./sentences.ts";

describe("isSentenceBoundary", () => {
  it("does not split on titles, initials, or geographic abbreviations", () => {
    assert.equal(isSentenceBoundary("Dr.", "Chen"), false);
    assert.equal(isSentenceBoundary("Mrs.", "Nguyen"), false);
    assert.equal(isSentenceBoundary("Prof.", "Adebayo"), false);
    assert.equal(isSentenceBoundary("J.", "K."), false);
    assert.equal(isSentenceBoundary("K.", "Rowling"), false);
    assert.equal(isSentenceBoundary("U.S.", "Army"), false);
    assert.equal(isSentenceBoundary("e.g.", "when"), false);
    assert.equal(isSentenceBoundary("vs.", "the"), false);
  });

  it("does not split decimals or file-like tokens", () => {
    assert.equal(isSentenceBoundary("3.14"), false);
    assert.equal(isSentenceBoundary("3.14", "ms"), false);
    assert.equal(isSentenceBoundary("readme.md", "Next"), false);
  });

  it("splits a real sentence end", () => {
    assert.equal(isSentenceBoundary("lab.", "The"), true);
    assert.equal(isSentenceBoundary("clarity.", "This"), true);
    assert.equal(isSentenceBoundary("clarity.”", "This"), true);
    assert.equal(isSentenceBoundary("left!", "Then"), true);
    assert.equal(isSentenceBoundary("end."), true);
  });

  it("splits after U.S. only when the next token starts a sentence", () => {
    assert.equal(isSentenceBoundary("U.S.", "The"), true);
    assert.equal(isSentenceBoundary("etc.", "The"), true);
    assert.equal(isSentenceBoundary("etc.", "more"), false);
  });

  it("does not split when the next token is lowercase", () => {
    assert.equal(isSentenceBoundary("wait.", "and"), false);
    assert.equal(isSentenceBoundary("Hello?", "she"), false);
  });
});

describe("splitSentences", () => {
  it("keeps Dr., U.S., and 3.14 inside the same sentence", () => {
    const sentences = splitSentences(
      "Dr. Chen measured 3.14 ms of lag in the U.S. lab. The next trial confirmed it.",
    );
    assert.deepEqual(sentences, [
      "Dr. Chen measured 3.14 ms of lag in the U.S. lab.",
      "The next trial confirmed it.",
    ]);
  });

  it("keeps initials together", () => {
    const sentences = splitSentences("He saw J. K. Rowling. Then he left.");
    assert.deepEqual(sentences, ["He saw J. K. Rowling.", "Then he left."]);
  });

  it("treats ! and ? as ends unless a lowercase continuation follows", () => {
    assert.deepEqual(splitSentences("Stop! Then go."), ["Stop!", "Then go."]);
    assert.deepEqual(splitSentences("Ready? Yes."), ["Ready?", "Yes."]);
  });

  it("round-trips spans so the reader can rejoin a paragraph", () => {
    const source = "Dr. Chen measured 3.14 seconds. The next trial confirmed it.";
    const spans = splitSentenceSpans(source);
    assert.equal(spans.join("").trim(), source);
    assert.equal(spans.length, 2);
  });
});
