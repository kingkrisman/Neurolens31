import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fixationLength, nearestFixationPreset, plainTextFromBionic, processBionicText } from "./bionic.ts";

describe("bionic accessible text", () => {
  it("wraps fixation without changing the spoken string", () => {
    const source = "The quick brown fox.";
    const html = processBionicText(source, 0.6, true);
    assert.ok(html.includes('class="fixation"'));
    assert.equal(plainTextFromBionic(html), source);
  });

  it("leaves plain text alone when strength is zero", () => {
    const source = "Unchanged sentence.";
    assert.equal(processBionicText(source, 0), source);
    assert.equal(plainTextFromBionic(source), source);
  });

  it("marks a saccade landing zone and never the whole word", () => {
    assert.equal(fixationLength("the", 0.45), 1);
    assert.equal(fixationLength("quick", 0.45), 2);
    assert.ok(fixationLength("phenomenon", 0.65) >= 3);
    assert.ok(fixationLength("phenomenon", 0.65) < "phenomenon".length);
    assert.equal(fixationLength("ab", 0), 0);
  });

  it("snaps strength to a named preset", () => {
    assert.equal(nearestFixationPreset(0).id, "off");
    assert.equal(nearestFixationPreset(0.46).id, "medium");
    assert.equal(nearestFixationPreset(0.8).id, "max");
  });
});
