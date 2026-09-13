import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCheckpoints, scoreComprehension } from "./comprehension.ts";

const SAMPLE = `
The phenomenon of cognitive friction in digital reading environments has significant implications for neurodivergent learners.
This study investigates how adaptive formatting reduces visual entropy and enhances focus retention in ADHD populations.
When a page presents too many competing cues at once, the reader spends energy on orientation rather than meaning.
Results are discussed in terms of first-pass fluency rather than speed records.
A calmer page is not a shorter one. It is a page that asks less of the systems already under load.
`;

describe("buildCheckpoints", () => {
  it("builds three extractive questions from a real passage", () => {
    const questions = buildCheckpoints(SAMPLE);
    assert.equal(questions.length, 3);
    assert.deepEqual(
      questions.map((q) => q.kind),
      ["main", "detail", "recall"],
    );
    for (const question of questions) {
      assert.ok(question.options.length >= 2);
      assert.ok(question.answerIndex >= 0);
      assert.ok(question.options[question.answerIndex]);
    }
  });

  it("returns nothing for tiny text", () => {
    assert.deepEqual(buildCheckpoints("Too short."), []);
  });

  it("is stable for the same passage", () => {
    assert.deepEqual(buildCheckpoints(SAMPLE), buildCheckpoints(SAMPLE));
  });

  it("does not treat Dr. or U.S. as extra questions", () => {
    const questions = buildCheckpoints(`
Dr. Chen measured 3.14 ms of lag in the U.S. lab while the control group waited in a quieter room.
The next trial confirmed it, and the authors reported first-pass fluency rather than a speed record.
When a page presents too many competing cues at once, the reader spends energy on orientation rather than meaning.
A calmer page is not a shorter one. It is a page that asks less of the systems already under load.
`);
    assert.equal(questions.length, 3);
    const blob = questions.flatMap((q) => q.options).join(" ");
    assert.equal(blob.includes("Dr. Chen measured"), true);
    assert.equal(/U\.S\.\s+The/.test(blob), false);
  });
});

describe("scoreComprehension", () => {
  it("returns null until a checkpoint is answered", () => {
    assert.equal(scoreComprehension([]), null);
  });

  it("averages real answers instead of inventing a score", () => {
    assert.equal(scoreComprehension([true, true, false]), 2 / 3);
    assert.equal(scoreComprehension([true, true, true]), 1);
  });
});
