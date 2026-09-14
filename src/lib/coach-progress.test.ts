import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resumeStep } from "./coach-progress.ts";

describe("resumeStep", () => {
  it("starts a new reader at the beginning", () => {
    assert.equal(resumeStep(null, 5), 0);
  });

  it("resumes where someone left off mid-tour", () => {
    assert.equal(resumeStep("2", 5), 2);
  });

  it("says nothing to someone who finished this tour", () => {
    assert.equal(resumeStep("done:5", 5), null);
  });

  it("shows the new steps to someone who finished a shorter tour", () => {
    // The whole point: adding a step must reach people who already finished,
    // and must start at the first one they have not seen.
    assert.equal(resumeStep("done:3", 5), 3);
  });

  it("treats the old bare 'done' as the three steps that existed then", () => {
    // Written before the marker carried a count. Reading it as "everything"
    // would hide every future step from everyone who used the app early.
    assert.equal(resumeStep("done", 5), 3);
  });

  it("stays quiet when the old marker covers the whole tour", () => {
    assert.equal(resumeStep("done", 3), null);
    assert.equal(resumeStep("done", 2), null);
  });

  it("says nothing when a newer build finished a longer tour", () => {
    // Rolling back must not replay the tour.
    assert.equal(resumeStep("done:9", 5), null);
  });

  it("restarts rather than trusting a corrupted marker", () => {
    assert.equal(resumeStep("banana", 5), 0);
    assert.equal(resumeStep("done:banana", 5), null);
  });

  it("resumes at the start when the stored step is past the end", () => {
    assert.equal(resumeStep("99", 5), 0);
  });

  it("stays quiet when there are no steps to show", () => {
    assert.equal(resumeStep(null, 0), null);
    assert.equal(resumeStep("done:0", 0), null);
  });
});
