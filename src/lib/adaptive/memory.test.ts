import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  learnFromOutcome,
  leverOf,
  newLever,
  noteApplied,
  TRUST,
  type AdaptiveMemory,
} from "./memory.ts";
import { recommendAdaptations, type AdaptiveSettings, type ReadingMetrics } from "./engine.ts";

const settings: AdaptiveSettings = {
  targetWpm: 220,
  lineHeight: 1.6,
  focusHighlight: false,
  theme: "contrast",
  fontSize: 18,
};

function metrics(overrides: Partial<ReadingMetrics> = {}): ReadingMetrics {
  return {
    wordCount: 800,
    wordsRead: 400,
    progress: 0.5,
    elapsedActiveMs: 120_000,
    currentWpm: 200,
    targetWpm: 220,
    pauseCount: 0,
    pauses: [],
    rereadCount: 0,
    rereads: [],
    feel: null,
    ...overrides,
  };
}

describe("trust updates", () => {
  it("rewards a lever that reduced strain", () => {
    let memory = noteApplied({}, "rereading", 0.7, 100);
    memory = learnFromOutcome(memory, 0.3, 100 + TRUST.settleWords);
    assert.ok(leverOf(memory, "rereading").trust > 1);
  });

  it("penalises a lever that made things worse", () => {
    let memory = noteApplied({}, "rereading", 0.4, 100);
    memory = learnFromOutcome(memory, 0.8, 100 + TRUST.settleWords);
    assert.ok(leverOf(memory, "rereading").trust < 1);
  });

  it("mildly discourages a lever that changed nothing", () => {
    let memory = noteApplied({}, "rereading", 0.5, 100);
    memory = learnFromOutcome(memory, 0.5, 100 + TRUST.settleWords);
    const trust = leverOf(memory, "rereading").trust;
    assert.ok(trust < 1 && trust > TRUST.penalty);
  });

  it("waits for enough reading before judging", () => {
    let memory = noteApplied({}, "rereading", 0.7, 100);
    memory = learnFromOutcome(memory, 0.1, 150);
    assert.equal(leverOf(memory, "rereading").trust, 1, "too early to judge");
  });

  it("does not score the same outcome twice", () => {
    let memory = noteApplied({}, "rereading", 0.7, 100);
    memory = learnFromOutcome(memory, 0.3, 100 + TRUST.settleWords);
    const once = leverOf(memory, "rereading").trust;
    memory = learnFromOutcome(memory, 0.3, 100 + TRUST.settleWords * 2);
    assert.equal(leverOf(memory, "rereading").trust, once);
  });

  it("keeps trust inside its bounds under repeated success", () => {
    let memory: AdaptiveMemory = { rereading: newLever() };
    for (let i = 0; i < 40; i += 1) {
      memory = noteApplied(memory, "rereading", 0.9, i * 1000);
      memory = learnFromOutcome(memory, 0.1, i * 1000 + TRUST.settleWords);
    }
    assert.ok(leverOf(memory, "rereading").trust <= TRUST.max);
  });
});

describe("memory changes what the engine reaches for", () => {
  it("abandons a lever that has repeatedly failed this reader", () => {
    const struggling = metrics({ rereadCount: 4 });

    const naive = recommendAdaptations(struggling, settings);
    assert.equal(naive?.rule, "rereading", "spacing is the default answer to rereading");

    // The same reader, after spacing has been tried and made things worse.
    let memory = noteApplied({}, "rereading", 0.4, 0);
    memory = learnFromOutcome(memory, 0.9, TRUST.settleWords);

    const learned = recommendAdaptations(
      struggling,
      { ...settings, lineHeight: 2.2 },
      [],
      [],
      memory,
    );
    assert.notEqual(learned?.rule, "rereading", "a lever that hurt should stop being offered first");
  });

  it("leaves an untried reader on the default ordering", () => {
    const withMemory = recommendAdaptations(metrics({ rereadCount: 4 }), settings, [], [], {});
    const without = recommendAdaptations(metrics({ rereadCount: 4 }), settings);
    assert.equal(withMemory?.rule, without?.rule);
  });
});

describe("proportional response", () => {
  it("answers mild strain with the smallest useful step", () => {
    const mild = recommendAdaptations(metrics({ rereadCount: 2 }), settings);
    assert.equal(mild?.recommendedValue, 1.7, "one notch of spacing");
  });

  it("answers severe strain with a larger step in one move", () => {
    const severe = recommendAdaptations(metrics({ rereadCount: 30, wordsRead: 300 }), settings);
    assert.ok(
      typeof severe?.recommendedValue === "number" && severe.recommendedValue > 1.7,
      "sustained rereading deserves more than the minimum nudge",
    );
  });
});
