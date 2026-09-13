import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  intensity,
  measureStrain,
  quantizeStep,
  saturate,
  shrunkRate,
  STRAIN_SCALE,
} from "./strain.ts";

describe("shrunkRate", () => {
  it("discounts the same count when it came from less reading", () => {
    const thin = shrunkRate(2, 0.1, 0.5); // 2 rereads in 100 words
    const broad = shrunkRate(2, 5, 0.5); // 2 rereads in 5000 words
    assert.ok(thin > broad, "a thin sample must not read as calmly as a broad one");
    assert.ok(broad < 0.5, "two rereads across five thousand words is close to nothing");
  });

  it("converges on the raw rate once exposure dwarfs the prior", () => {
    const raw = 10 / 100;
    assert.ok(Math.abs(shrunkRate(10, 100, 0.5) - raw) < 0.001);
  });

  it("reports no strain without events", () => {
    assert.equal(shrunkRate(0, 5, 0.5), 0);
  });
});

describe("saturate", () => {
  it("reads exactly one half at the half-saturation rate", () => {
    assert.equal(saturate(2, 2), 0.5);
  });

  it("stays inside the unit interval however extreme the rate", () => {
    assert.ok(saturate(1e6, 2) < 1);
    assert.equal(saturate(0, 2), 0);
  });

  it("is monotonic", () => {
    assert.ok(saturate(1, 2) < saturate(3, 2));
  });
});

describe("intensity", () => {
  it("is silent at or below the floor", () => {
    assert.equal(intensity(0.2, 0.35), 0);
    assert.equal(intensity(0.35, 0.35), 0);
  });

  it("rises to full at maximum strain", () => {
    assert.equal(intensity(1, 0.35), 1);
  });
});

describe("quantizeStep", () => {
  it("snaps to the granularity the setting can hold", () => {
    assert.equal(quantizeStep(3, 0.27, 1), 1);
    assert.equal(quantizeStep(3, 0.9, 1), 3);
  });

  it("never rounds real strain down to no change at all", () => {
    assert.equal(quantizeStep(0.3, 0.01, 0.1), 0.1);
  });

  it("returns nothing when there is no strain", () => {
    assert.equal(quantizeStep(3, 0, 1), 0);
  });
});

describe("measureStrain", () => {
  const base = {
    rereadCount: 0,
    longPauseCount: 0,
    wordsRead: 400,
    activeMs: 120_000,
    currentWpm: 200,
    targetWpm: 220,
  };

  it("separates the channels so a calm one cannot mask a straining one", () => {
    const report = measureStrain({ ...base, rereadCount: 6 });
    assert.ok(report.reread > STRAIN_SCALE.actionFloor);
    assert.equal(report.pause, 0);
    assert.equal(report.peak, report.reread);
  });

  it("treats the same reread count as worse over a shorter passage", () => {
    const early = measureStrain({ ...base, rereadCount: 2, wordsRead: 120 });
    const late = measureStrain({ ...base, rereadCount: 2, wordsRead: 4000 });
    assert.ok(early.reread > late.reread);
  });

  it("reports no pace strain before a pace has been measured", () => {
    assert.equal(measureStrain({ ...base, currentWpm: null }).pace, 0);
  });

  it("reports no strain for an untroubled reader", () => {
    const report = measureStrain({ ...base, currentWpm: 220 });
    assert.equal(report.peak, 0);
  });
});
