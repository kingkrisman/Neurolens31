import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { appleSpring, isCriticallyDamped, projectMomentum, springs } from "./springs.ts";

describe("appleSpring", () => {
  it("maps damping 1.0 to a critically damped oscillator", () => {
    const spring = appleSpring(1, 0.4);
    const discriminant = spring.damping ** 2 - 4 * spring.mass * spring.stiffness;
    assert.ok(Math.abs(discriminant) < 1e-6);
    assert.equal(isCriticallyDamped(1), true);
  });

  it("maps damping 0.8 to an underdamped oscillator (a little bounce)", () => {
    const spring = appleSpring(0.8, 0.3);
    const discriminant = spring.damping ** 2 - 4 * spring.mass * spring.stiffness;
    assert.ok(discriminant < 0);
  });

  it("uses a shorter response as a stiffer spring", () => {
    const snappy = appleSpring(1, 0.3);
    const slow = appleSpring(1, 0.6);
    assert.ok(snappy.stiffness > slow.stiffness);
  });
});

describe("Motion house springs", () => {
  it("keeps default UI critically damped (no bounce)", () => {
    assert.equal(springs.ui.bounce, 0);
    assert.equal(springs.icon.bounce, 0);
    assert.equal(springs.move.bounce, 0);
  });

  it("reserves bounce for momentum interactions", () => {
    assert.ok(springs.sheet.bounce > 0);
  });
});

describe("projectMomentum", () => {
  it("projects a flick further than the release point", () => {
    assert.ok(projectMomentum(800) > 300);
    assert.equal(projectMomentum(0), 0);
  });
});
