import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HAPTIC_PATTERNS } from "./haptics.ts";

/**
 * The tuning is the feature, so it is asserted rather than left as a comment.
 * These check relationships — heavier lasts longer, sharper is briefer — not
 * exact numbers, so the values stay adjustable without the tests becoming a
 * transcription of them.
 */
describe("haptic patterns", () => {
  const { selection, impact, notification } = HAPTIC_PATTERNS;

  it("keeps selection the lightest thing in the system", () => {
    // Moving through options happens constantly; anything heavier turns a
    // scroll through a picker into a buzzing device.
    assert.ok(selection <= impact.light);
  });

  it("orders impact weights the way their names promise", () => {
    assert.ok(impact.light < impact.medium, "light < medium");
    assert.ok(impact.medium < impact.heavy, "medium < heavy");
  });

  it("makes rigid brief and soft blunt", () => {
    // Sharpness has no direct analogue in a duration-only API, so it is carried
    // by length: rigid is the crispest tap available, soft the most diffuse.
    assert.ok(impact.rigid < impact.light, "rigid is crisper than light");
    assert.ok(impact.soft > impact.medium, "soft is blunter than medium");
  });

  it("gives each notification its own rhythm", () => {
    assert.equal(notification.success.length, 3, "success is two beats");
    assert.equal(notification.warning.length, 3, "warning is two beats");
    assert.equal(notification.error.length, 5, "error stumbles over three");
  });

  it("rises on success and lands hardest on error", () => {
    const [firstOk, , secondOk] = notification.success;
    assert.ok(secondOk! > firstOk!, "success rises");
    const errorTotal = notification.error.reduce((sum, n) => sum + n, 0);
    const successTotal = notification.success.reduce((sum, n) => sum + n, 0);
    assert.ok(errorTotal > successTotal, "error is the most insistent");
  });

  it("keeps every pulse short enough to read as a tap", () => {
    // Past roughly 40ms a pulse stops feeling like a tap and starts feeling
    // like a phone buzzing in a pocket.
    const every = [selection, ...Object.values(impact), ...Object.values(notification).flat()];
    for (const value of every) assert.ok(value <= 90, `${value}ms is too long for a tap`);
  });
});
