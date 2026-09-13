import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyMove,
  demoScanpath,
  detectPassiveState,
  scanpathFromEvents,
  summarizeNeural,
  type NeuralEvent,
} from "./neural.ts";

const NOW = 1_700_000_000_000;

function event(kind: NeuralEvent["kind"], overrides: Partial<NeuralEvent> = {}): NeuralEvent {
  return {
    kind,
    at: NOW - 8_000,
    line: 4,
    ms: 800,
    ...overrides,
  };
}

describe("classifyMove", () => {
  it("treats a one-line advance after a real hold as a saccade", () => {
    assert.equal(classifyMove(4, 5, 900), "saccade");
    assert.equal(classifyMove(4, 6, 700), "saccade");
  });

  it("treats a wrap inside the same sentence as a saccade", () => {
    assert.equal(classifyMove(4, 4, 500), "saccade");
  });

  it("names a backward step as a regression", () => {
    assert.equal(classifyMove(8, 5, 600), "regression");
  });

  it("names a long jump, or a jump with no time to land, as a skip", () => {
    assert.equal(classifyMove(2, 8, 900), "skip");
    assert.equal(classifyMove(4, 5, 120), "skip");
  });
});

describe("summarizeNeural", () => {
  it("counts each kind and the mean hold", () => {
    const summary = summarizeNeural([
      event("fixation", { ms: 500 }),
      event("fixation", { ms: 1_700 }),
      event("saccade"),
      event("skip"),
      event("regression"),
      event("disengage"),
    ]);
    assert.equal(summary.fixations, 2);
    assert.equal(summary.longFixations, 1);
    assert.equal(summary.saccades, 1);
    assert.equal(summary.skips, 1);
    assert.equal(summary.meanFixationMs, 1_100);
  });
});

describe("detectPassiveState", () => {
  it("stays in gathering until the sitting has a rhythm", () => {
    const reading = detectPassiveState([event("fixation", { at: NOW - 1_000 })], NOW);
    assert.equal(reading.state, "gathering");
  });

  it("names successive holds and forward moves as reading", () => {
    const reading = detectPassiveState(
      [
        event("fixation", { at: NOW - 6_000, line: 1, ms: 700 }),
        event("saccade", { at: NOW - 5_000, line: 2, fromLine: 1 }),
        event("fixation", { at: NOW - 4_000, line: 2, ms: 640 }),
        event("saccade", { at: NOW - 3_000, line: 3, fromLine: 2 }),
        event("fixation", { at: NOW - 2_000, line: 3, ms: 720 }),
      ],
      NOW,
    );
    assert.equal(reading.state, "engaged");
    assert.match(reading.label, /read/i);
  });

  it("names an idle open page as waiting", () => {
    const reading = detectPassiveState(
      [
        event("fixation", { at: NOW - 18_000, ms: 500 }),
        event("disengage", { at: NOW - 16_000, ms: 500 }),
      ],
      NOW,
    );
    assert.equal(reading.state, "parked");
  });

  it("names jump-heavy motion as skimming", () => {
    const reading = detectPassiveState(
      [
        event("fixation", { at: NOW - 5_000, ms: 320, line: 1 }),
        event("skip", { at: NOW - 4_000, line: 6, fromLine: 1, ms: 200 }),
        event("skip", { at: NOW - 2_500, line: 12, fromLine: 6, ms: 180 }),
        event("fixation", { at: NOW - 1_000, ms: 280, line: 12 }),
      ],
      NOW,
    );
    assert.equal(reading.state, "skimming");
  });

  it("names long holds mixed with jumps as mind wandering", () => {
    const reading = detectPassiveState(
      [
        event("fixation", { at: NOW - 8_000, ms: 2_200, line: 2 }),
        event("skip", { at: NOW - 6_000, line: 9, fromLine: 2 }),
        event("fixation", { at: NOW - 4_000, ms: 1_900, line: 9 }),
        event("regression", { at: NOW - 2_000, line: 4, fromLine: 9 }),
      ],
      NOW,
    );
    assert.equal(reading.state, "wandering");
  });
});

describe("scanpath", () => {
  it("turns a sitting into a path of points", () => {
    const points = scanpathFromEvents([
      event("fixation", { line: 0 }),
      event("saccade", { line: 1, fromLine: 0 }),
      event("fixation", { line: 1 }),
    ]);
    assert.ok(points.length >= 2);
    assert.ok(points.every((point) => point.x >= 0 && point.x <= 1));
  });

  it("keeps a designed demo for every named pattern", () => {
    for (const id of ["flow", "decode", "scan", "regress", "wander", "drift"] as const) {
      const points = demoScanpath(id);
      assert.ok(points.length >= 2, id);
    }
  });
});
