import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { READING_PROFILES } from "./types.ts";
import { buildSuggestions, formatDuration } from "./insights.ts";

describe("insights", () => {
  it("formats sitting time", () => {
    assert.equal(formatDuration(4000), "4s");
    assert.equal(formatDuration(125000), "2m 5s");
  });

  it("offers a sample when the log is empty", () => {
    const suggestions = buildSuggestions({
      sessions: [],
      reading: {
        progress: 0,
        wordCount: 0,
        wordsRead: 0,
        elapsedActiveMs: 0,
        currentWpm: null,
        pauses: [],
        rereads: [],
        skips: [],
        pausedAt: null,
        startedAt: null,
        dwellCount: 0,
        dwellMs: 0,
        longDwellCount: 0,
        forwardSteps: 0,
      },
      profile: READING_PROFILES.default,
      mode: "default",
      targetWpm: 220,
      feel: null,
    });
    assert.equal(suggestions[0]?.id, "sample");
  });

  it("recommends plain words after rereads", () => {
    const suggestions = buildSuggestions({
      sessions: [
        {
          title: "A sitting",
          content: "Hello",
          openedAt: Date.now(),
          rereadCount: 3,
          currentWpm: 180,
        },
      ],
      reading: {
        progress: 0.4,
        wordCount: 400,
        wordsRead: 160,
        elapsedActiveMs: 40_000,
        currentWpm: 180,
        pauses: [],
        rereads: [],
        skips: [],
        pausedAt: null,
        startedAt: Date.now(),
        dwellCount: 0,
        dwellMs: 0,
        longDwellCount: 0,
        forwardSteps: 0,
      },
      profile: READING_PROFILES.default,
      mode: "default",
      targetWpm: 220,
      feel: null,
    });
    assert.ok(suggestions.some((item) => item.id === "plain"));
  });

  it("offers word highlight after a skimming sitting", () => {
    const suggestions = buildSuggestions({
      sessions: [],
      reading: {
        progress: 0.55,
        wordCount: 400,
        wordsRead: 220,
        elapsedActiveMs: 40_000,
        currentWpm: 260,
        pauses: [],
        rereads: [],
        skips: [
          { at: Date.now(), from: 0.1, to: 0.4, durationMs: 300 },
          { at: Date.now(), from: 0.4, to: 0.7, durationMs: 280 },
        ],
        pausedAt: null,
        startedAt: Date.now(),
        dwellCount: 1,
        dwellMs: 500,
        longDwellCount: 0,
        forwardSteps: 0,
      },
      profile: READING_PROFILES.default,
      mode: "default",
      targetWpm: 220,
      feel: null,
    });
    assert.ok(suggestions.some((item) => item.id === "scan"));
  });
});
