import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildLocalRecap, detectDisengagement, isSkipJump, recapCacheKey, RECONNECT_COPY } from "./reconnect.ts";

const NOW = 1_700_000_000_000;

describe("detectDisengagement", () => {
  it("stays quiet at the start of a sitting", () => {
    const nudge = detectDisengagement({
      progress: 0.04,
      elapsedActiveMs: 4_000,
      pauses: [],
      rereads: [],
      now: NOW,
      startedAt: NOW - 4_000,
    });
    assert.equal(nudge, null);
  });

  it("stays quiet while the first-page coach could still be up", () => {
    const nudge = detectDisengagement({
      progress: 0.13,
      elapsedActiveMs: 40_000,
      pauses: [{ startedAt: NOW - 12_000, durationMs: 12_000, progress: 0.12 }],
      rereads: [],
      now: NOW,
      startedAt: NOW - 50_000,
    });
    assert.equal(nudge, null);
  });

  it("offers a gentle recap after a long pause", () => {
    const nudge = detectDisengagement({
      progress: 0.4,
      elapsedActiveMs: 40_000,
      pauses: [{ startedAt: NOW - 12_000, durationMs: 12_000, progress: 0.38 }],
      rereads: [],
      now: NOW,
      startedAt: NOW - 50_000,
    });
    assert.equal(nudge?.level, 1);
    assert.match(nudge?.prompt ?? "", /Still with this page/);
  });

  it("treats a live idle as a pause, without waiting for the next scroll", () => {
    const nudge = detectDisengagement({
      progress: 0.4,
      elapsedActiveMs: 40_000,
      pauses: [],
      rereads: [],
      idleMs: 12_000,
      now: NOW,
      startedAt: NOW - 50_000,
    });
    assert.equal(nudge?.level, 1);
    assert.equal(nudge?.reason, "pause");
  });

  it("steps up after a skip-scroll", () => {
    const nudge = detectDisengagement({
      progress: 0.7,
      elapsedActiveMs: 30_000,
      pauses: [],
      rereads: [],
      skips: [{ at: NOW - 2_000, from: 0.2, to: 0.68, durationMs: 400 }],
      now: NOW,
      startedAt: NOW - 40_000,
    });
    assert.equal(nudge?.level, 2);
    assert.equal(nudge?.reason, "skip");
  });

  it("recovers when skipping and pausing stack", () => {
    const nudge = detectDisengagement({
      progress: 0.55,
      elapsedActiveMs: 60_000,
      pauses: [{ startedAt: NOW - 20_000, durationMs: 14_000, progress: 0.3 }],
      rereads: [{ at: NOW - 8_000, from: 0.5, to: 0.32 }],
      skips: [{ at: NOW - 6_000, from: 0.32, to: 0.55, durationMs: 500 }],
      now: NOW,
      startedAt: NOW - 80_000,
    });
    assert.equal(nudge?.level, 3);
    assert.doesNotMatch(nudge?.prompt ?? "", /distract/i);
  });

  it("does not treat auto-scroll as disengagement", () => {
    const nudge = detectDisengagement({
      progress: 0.8,
      elapsedActiveMs: 40_000,
      pauses: [{ startedAt: NOW - 12_000, durationMs: 12_000, progress: 0.7 }],
      rereads: [],
      skips: [{ at: NOW - 1_000, from: 0.2, to: 0.8, durationMs: 300 }],
      now: NOW,
      startedAt: NOW - 50_000,
      autoScrolling: true,
    });
    assert.equal(nudge, null);
  });
});

describe("reconnect recap", () => {
  it("marks a true skip jump", () => {
    assert.equal(isSkipJump(0.2, 0.5, 400), true);
    assert.equal(isSkipJump(0.2, 0.5, 0), true);
    assert.equal(isSkipJump(0.2, 0.22, 400), false);
    assert.equal(isSkipJump(0.2, 0.36, 4_000), false);
    assert.equal(isSkipJump(0.1, 0.5, 2_500), true);
    assert.equal(isSkipJump(0.1, 0.5, 5_000), false);
  });

  it("builds a recap from sentences already passed", () => {
    const text = [
      "NeuroLens utilizes a recursive word-weighting algorithm to transform static strings into fixation-aware content.",
      "The pipeline is intentionally local.",
      "Each token receives a weight based on length and a profile-selected strength.",
      "Rhythm optimization is a second pass after weights are assigned.",
      "Auto-scroll is paced by a target words-per-minute value.",
    ].join(" ");
    const recap = buildLocalRecap(text, 0.5);
    assert.ok(recap.recap.length > 20);
    assert.ok(recap.idea.length > 8);
    assert.ok(recap.next.length > 8);
    assert.ok(recap.resumeAt >= 0 && recap.resumeAt <= 1);
    assert.doesNotMatch(recap.recap, /distracted/i);
  });

  it("keeps the recovery copy free of blame", () => {
    const copy = Object.values(RECONNECT_COPY).join(" ");
    assert.doesNotMatch(copy, /distract|lazy|fail|lost the thread/i);
    assert.match(copy, /Still with this page/);
  });

  it("buckets recap cache keys so nearby progress reuses a recap", () => {
    const text = "A long enough page for a cache key.";
    assert.equal(recapCacheKey(text, 0.4), recapCacheKey(text, 0.41));
    assert.notEqual(recapCacheKey(text, 0.4), recapCacheKey(text, 0.7));
  });
});
