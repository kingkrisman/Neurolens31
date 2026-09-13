import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  autoScrollDeltaPx,
  isClauseRest,
  isSentenceRest,
  orpIndex,
  paceMultiplier,
  resolveRhythmCurve,
  rsvpDelayMs,
  splitOrp,
  tokenAtProgress,
  tokenContextAtProgress,
} from "./rhythm.ts";

describe("rhythm engine", () => {
  it("treats missing curve as steady unless optimization is on", () => {
    assert.equal(resolveRhythmCurve(undefined, false), "steady");
    assert.equal(resolveRhythmCurve(undefined, true), "sentence");
    assert.equal(resolveRhythmCurve("breath", false), "breath");
  });

  it("only rests at real sentence ends, not Dr. or decimals", () => {
    assert.equal(isSentenceRest("clarity."), true);
    assert.equal(isSentenceRest("clarity.”"), true);
    assert.equal(isSentenceRest("clarity"), false);
    assert.equal(isSentenceRest("Dr.", "Chen"), false);
    assert.equal(isSentenceRest("U.S.", "lab."), false);
    assert.equal(isSentenceRest("3.14", "ms"), false);
    assert.equal(isSentenceRest("lab.", "The"), true);
    assert.equal(isClauseRest("wait,"), true);
    assert.equal(isClauseRest("wait"), false);
  });

  it("keeps steady pacing even on periods", () => {
    assert.equal(paceMultiplier("end.", "steady"), 1);
    assert.ok(paceMultiplier("end.", "sentence") < 1);
    assert.ok(paceMultiplier("wait,", "breath") < 1);
    assert.equal(paceMultiplier("wait,", "sentence"), 1);
    assert.equal(paceMultiplier("Dr.", "sentence", "Chen"), 1);
  });

  it("gives RSVP a longer tick after a sentence than mid-clause", () => {
    const mid = rsvpDelayMs("word", 240, "sentence");
    const end = rsvpDelayMs("word.", 240, "sentence");
    assert.ok(end > mid);
    assert.equal(rsvpDelayMs("word", 240, "steady"), rsvpDelayMs("word.", 240, "steady"));
    assert.equal(rsvpDelayMs("Dr.", 240, "sentence", "Chen"), rsvpDelayMs("word", 240, "sentence"));
  });

  it("auto-scroll maps remaining distance onto remaining words", () => {
    const steady = autoScrollDeltaPx({
      remainingPx: 1000,
      remainingWords: 200,
      targetWpm: 240,
      dtSec: 1,
      focusToken: "word",
      curve: "steady",
    });
    assert.equal(Math.round(steady), 20);
    const rest = autoScrollDeltaPx({
      remainingPx: 1000,
      remainingWords: 200,
      targetWpm: 240,
      dtSec: 1,
      focusToken: "end.",
      curve: "sentence",
    });
    assert.ok(rest < steady);
    const abbrev = autoScrollDeltaPx({
      remainingPx: 1000,
      remainingWords: 200,
      targetWpm: 240,
      dtSec: 1,
      focusToken: "Dr.",
      nextToken: "Chen",
      curve: "sentence",
    });
    assert.equal(Math.round(abbrev), Math.round(steady));
    const later = autoScrollDeltaPx({
      remainingPx: 500,
      remainingWords: 100,
      targetWpm: 240,
      dtSec: 1,
      focusToken: "word",
      curve: "steady",
    });
    assert.equal(Math.round(later), Math.round(steady));
    const frame = autoScrollDeltaPx({
      remainingPx: 1000,
      remainingWords: 200,
      targetWpm: 240,
      dtSec: 1 / 60,
      focusToken: "word",
      curve: "steady",
    });
    assert.ok(frame > 0 && frame < 1);
  });

  it("aligns the recognition point inside the word, not at the start", () => {
    assert.equal(orpIndex("I"), 0);
    assert.equal(orpIndex("the"), 0);
    assert.equal(orpIndex("word"), 1);
    assert.equal(splitOrp("reading").orp, "a");
  });

  it("picks the word under the current progress, not a made-up token", () => {
    assert.equal(tokenAtProgress(["a", "b", "c"], 0), "a");
    assert.equal(tokenAtProgress(["a", "b", "c"], 0.9), "c");
    assert.equal(tokenAtProgress([], 0.5), "");
    assert.deepEqual(tokenContextAtProgress(["Dr.", "Chen", "left."], 0), {
      token: "Dr.",
      next: "Chen",
      index: 0,
    });
  });
});
