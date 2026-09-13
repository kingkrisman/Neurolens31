import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PREFERENCE_WEIGHT, readPreference } from "./preference.ts";
import { learnFromPreference, leverOf, TRUST } from "./memory.ts";
import { READING_PROFILES, type ReadingProfile } from "../types.ts";

const base: ReadingProfile = { ...READING_PROFILES.default };

describe("readPreference", () => {
  it("reads a spacing change as a verdict on the spacing lever", () => {
    const signal = readPreference(base, { ...base, lineHeight: base.lineHeight + 0.2 });
    assert.deepEqual(signal, { rule: "rereading", direction: "up" });
  });

  it("keeps the direction, because down is not the same evidence as up", () => {
    // Someone repeatedly lowering a setting is saying the engine's instinct to
    // raise it is wrong for them.
    const down = readPreference(base, { ...base, fontSize: base.fontSize - 2 });
    assert.deepEqual(down, { rule: "type-size", direction: "down" });
  });

  it("reads a scheme change as reaching for contrast", () => {
    const signal = readPreference(base, { ...base, theme: "contrast" });
    assert.equal(signal?.rule, "contrast-low");
  });

  it("stays quiet about settings no lever owns", () => {
    assert.equal(readPreference(base, { ...base, fontFamily: "lexend" }), null);
    assert.equal(readPreference(base, { ...base, align: "justify" }), null);
  });

  it("stays quiet when nothing changed", () => {
    assert.equal(readPreference(base, { ...base }), null);
  });
});

describe("learnFromPreference", () => {
  it("raises trust in a lever the reader reaches for", () => {
    const memory = learnFromPreference({}, "rereading", PREFERENCE_WEIGHT.agrees);
    assert.ok(leverOf(memory, "rereading").trust > 1);
  });

  it("lowers it when they move the lever the other way", () => {
    const memory = learnFromPreference({}, "rereading", PREFERENCE_WEIGHT.disagrees);
    assert.ok(leverOf(memory, "rereading").trust < 1);
  });

  it("weighs a preference below a measured outcome", () => {
    // A manual change says "this is the control I trust"; an outcome says the
    // change actually worked. Letting the first outweigh the second would mean
    // fiddling with a slider drowning out what the engine observed.
    assert.ok(PREFERENCE_WEIGHT.agrees < TRUST.reward);
    assert.ok(PREFERENCE_WEIGHT.disagrees > TRUST.penalty);
  });

  it("leaves a pending verdict alone", () => {
    // A suggestion still being judged must not be resolved by an unrelated
    // manual change.
    const pending = { rereading: { trust: 1, strainAtApply: 0.6, wordsAtApply: 10, uses: 1 } };
    const after = learnFromPreference(pending, "rereading", PREFERENCE_WEIGHT.agrees);
    assert.equal(leverOf(after, "rereading").strainAtApply, 0.6);
  });

  it("stays inside the trust bounds however often it is nudged", () => {
    let memory = {};
    for (let i = 0; i < 40; i += 1) {
      memory = learnFromPreference(memory, "rereading", PREFERENCE_WEIGHT.agrees);
    }
    assert.ok(leverOf(memory, "rereading").trust <= TRUST.max);
  });
});
