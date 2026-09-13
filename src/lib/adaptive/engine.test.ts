import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ADAPTIVE_THRESHOLDS,
  calcCurrentWpm,
  isMeaningfulProgressChange,
  isReread,
  recommendAdaptations,
  type ReadingMetrics,
  type AdaptiveSettings,
} from "./engine.ts";

const settings: AdaptiveSettings = {
  targetWpm: 220,
  lineHeight: 1.6,
  focusHighlight: false,
  theme: "paper",
  fontSize: 18,
};

const contrastSettings: AdaptiveSettings = { ...settings, theme: "contrast" };

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

describe("calcCurrentWpm", () => {
  it("returns null until enough words and time have elapsed", () => {
    assert.equal(calcCurrentWpm(5, 60_000), null);
    assert.equal(calcCurrentWpm(100, 5_000), null);
  });

  it("uses words read over active minutes, never a hardcoded pace", () => {
    assert.equal(calcCurrentWpm(220, 60_000), 220);
    assert.equal(calcCurrentWpm(110, 60_000), 110);
    assert.equal(calcCurrentWpm(400, 90_000), 267);
  });

  it("ignores skip-scrolling that would produce an impossible pace", () => {
    assert.equal(calcCurrentWpm(400, 20_000), null);
  });
});

describe("progress helpers", () => {
  it("ignores tiny scroll jitter", () => {
    assert.equal(isMeaningfulProgressChange(0.5, 0.504), false);
    assert.equal(isMeaningfulProgressChange(0.5, 0.52), true);
  });

  it("counts a meaningful backward jump from a real high-water mark", () => {
    assert.equal(isReread(0.7, 0.55), true);
    assert.equal(isReread(0.7, 0.68), false);
    assert.equal(isReread(0.1, 0), false);
  });
});

describe("recommendAdaptations", () => {
  it("does not invent pace recommendations while feel is unknown", () => {
    const result = recommendAdaptations(
      metrics({ feel: null, currentWpm: 80 }),
      contrastSettings,
    );
    assert.equal(result, null);
  });

  it("recommends slowing target WPM when the page felt too fast", () => {
    const result = recommendAdaptations(metrics({ feel: "slow" }), contrastSettings);
    assert.ok(result);
    assert.equal(result.rule, "pace-strain");
    assert.equal(result.setting, "targetWpm");
    assert.equal(result.recommendedValue, 200);
    assert.match(result.why, /too fast/i);
  });

  it("recommends a higher-contrast scheme after frequent rereading on a softer page", () => {
    const result = recommendAdaptations(metrics({ rereadCount: 2 }), settings);
    assert.ok(result);
    assert.equal(result.rule, "contrast-low");
    assert.equal(result.setting, "theme");
    assert.equal(result.recommendedValue, "contrast");
  });

  it("recommends Ink when a dark scheme is already in use", () => {
    const result = recommendAdaptations(metrics({ rereadCount: 2 }), { ...settings, theme: "night" });
    assert.ok(result);
    assert.equal(result.rule, "contrast-low");
    assert.equal(result.recommendedValue, "ink");
  });

  it("recommends more line spacing after frequent rereading on a high-contrast page", () => {
    const result = recommendAdaptations(metrics({ rereadCount: 2 }), contrastSettings);
    assert.ok(result);
    assert.equal(result.rule, "rereading");
    assert.equal(result.setting, "lineHeight");
    assert.equal(result.recommendedValue, 1.7);
    assert.match(result.why, /moved back/i);
  });

  it("recommends a larger type size when spacing is already open", () => {
    const result = recommendAdaptations(
      metrics({ rereadCount: 2 }),
      { ...contrastSettings, lineHeight: 2.2 },
      ["rereading"],
    );
    assert.ok(result);
    assert.equal(result.rule, "type-size");
    assert.equal(result.setting, "fontSize");
    assert.equal(result.recommendedValue, 19);
  });

  it("recommends a slightly larger type after frequent prolonged pauses on a high-contrast page", () => {
    const pauses = [
      { startedAt: 1, durationMs: 9_000, progress: 0.2 },
      { startedAt: 2, durationMs: 10_000, progress: 0.3 },
    ];
    const result = recommendAdaptations(
      metrics({ pauseCount: 2, pauses }),
      contrastSettings,
    );
    assert.ok(result);
    assert.equal(result.rule, "pauses");
    assert.equal(result.setting, "fontSize");
    assert.equal(result.recommendedValue, 19);
  });

  it("recommends a small target increase when the page felt too slow", () => {
    const result = recommendAdaptations(
      metrics({ feel: "fast", currentWpm: 140 }),
      contrastSettings,
    );
    assert.ok(result);
    assert.equal(result.rule, "strong-performance");
    assert.equal(result.recommendedValue, 240);
  });

  it("does not auto-propose a dismissed rule", () => {
    const result = recommendAdaptations(metrics({ rereadCount: 3 }), contrastSettings, ["rereading", "type-size"]);
    assert.equal(result, null);
  });

  it("falls through to spacing after a dismissed contrast recommendation", () => {
    const result = recommendAdaptations(metrics({ rereadCount: 3 }), settings, ["contrast-low"]);
    assert.ok(result);
    assert.equal(result.rule, "rereading");
  });

  it("skips a locked theme and recommends spacing instead", () => {
    const result = recommendAdaptations(metrics({ rereadCount: 3 }), settings, [], ["theme"]);
    assert.ok(result);
    assert.equal(result.rule, "rereading");
    assert.equal(result.setting, "lineHeight");
  });

  it("skips the pause type suggestion if size is already at the ceiling", () => {
    const pauses = [
      { startedAt: 1, durationMs: 9_000, progress: 0.2 },
      { startedAt: 2, durationMs: 10_000, progress: 0.3 },
    ];
    const result = recommendAdaptations(
      metrics({ pauseCount: 2, pauses }),
      { ...contrastSettings, fontSize: 28 },
    );
    assert.equal(result, null);
  });

  it("uses the configured reread drop of 12 percentage points", () => {
    assert.equal(ADAPTIVE_THRESHOLDS.rereadDrop, 0.12);
  });
});
