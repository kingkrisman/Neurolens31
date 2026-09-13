import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyReading, isForwardStep, type PatternSample } from "./reading-patterns.ts";

const NOW = 1_700_000_000_000;

function sample(overrides: Partial<PatternSample> = {}): PatternSample {
  return {
    progress: 0.4,
    elapsedActiveMs: 40_000,
    currentWpm: 210,
    targetWpm: 220,
    pauses: [],
    rereads: [],
    skips: [],
    dwellCount: 8,
    dwellMs: 6_400,
    longDwellCount: 1,
    forwardSteps: 7,
    idleMs: 0,
    ...overrides,
  };
}

describe("isForwardStep", () => {
  it("counts a small, paced advance as a reading step", () => {
    assert.equal(isForwardStep(0.2, 0.24, 900), true);
  });

  it("rejects a skip-sized jump and a twitch", () => {
    assert.equal(isForwardStep(0.2, 0.4, 400), false);
    assert.equal(isForwardStep(0.2, 0.204, 900), false);
    assert.equal(isForwardStep(0.2, 0.24, 80), false);
  });
});

describe("classifyReading", () => {
  it("stays in gathering until the sitting has a signal", () => {
    const reading = classifyReading(
      sample({ elapsedActiveMs: 3_000, dwellCount: 0, forwardSteps: 0, progress: 0.02 }),
    );
    assert.equal(reading.gathering, true);
    assert.equal(reading.confidence, 0);
  });

  it("names even forward movement as on the line", () => {
    const reading = classifyReading(sample());
    assert.equal(reading.id, "flow");
    assert.match(reading.label, /line/i);
    assert.ok(reading.mix.some((item) => item.id === "flow" && item.share >= 40));
  });

  it("names long dwells and a slow pace as decoding", () => {
    const reading = classifyReading(
      sample({
        currentWpm: 120,
        dwellCount: 10,
        dwellMs: 22_000,
        longDwellCount: 8,
        forwardSteps: 2,
        skips: [],
      }),
    );
    assert.equal(reading.id, "decode");
    assert.match(reading.science, /fixation/i);
  });

  it("names skip-jumps as skimming", () => {
    const reading = classifyReading(
      sample({
        dwellCount: 1,
        dwellMs: 400,
        longDwellCount: 0,
        forwardSteps: 0,
        skips: [
          { at: NOW, from: 0.1, to: 0.4, durationMs: 300 },
          { at: NOW, from: 0.4, to: 0.7, durationMs: 250 },
        ],
      }),
    );
    assert.equal(reading.id, "scan");
  });

  it("names clustered rereads as going back", () => {
    const reading = classifyReading(
      sample({
        dwellCount: 3,
        dwellMs: 2_400,
        longDwellCount: 0,
        forwardSteps: 1,
        rereads: [
          { at: NOW, from: 0.5, to: 0.32 },
          { at: NOW, from: 0.48, to: 0.3 },
          { at: NOW, from: 0.44, to: 0.28 },
        ],
        skips: [],
      }),
    );
    assert.equal(reading.id, "regress");
  });

  it("names long holds mixed with jumps as mind wandering", () => {
    const now = Date.now();
    const reading = classifyReading(
      sample({
        dwellCount: 4,
        dwellMs: 9_000,
        longDwellCount: 3,
        forwardSteps: 1,
        skips: [{ at: now, from: 0.2, to: 0.5, durationMs: 280 }],
        neuralEvents: [
          { kind: "fixation", at: now - 8_000, line: 2, ms: 2_200 },
          { kind: "skip", at: now - 6_000, line: 9, fromLine: 2, ms: 240 },
          { kind: "fixation", at: now - 4_000, line: 9, ms: 1_900 },
          { kind: "regression", at: now - 2_000, line: 4, fromLine: 9, ms: 400 },
        ],
      }),
    );
    assert.equal(reading.id, "wander");
    assert.match(reading.science, /decouple/i);
  });

  it("names an idle open page as away", () => {
    const reading = classifyReading(
      sample({
        progress: 0.08,
        dwellCount: 0,
        dwellMs: 0,
        longDwellCount: 0,
        forwardSteps: 0,
        idleMs: 18_000,
        pauses: [{ startedAt: NOW - 18_000, durationMs: 18_000, progress: 0.08 }],
      }),
    );
    assert.equal(reading.id, "drift");
    assert.doesNotMatch(reading.body, /fail/i);
  });
});
