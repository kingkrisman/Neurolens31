import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { contrastRatio } from "./contrast.ts";
import {
  CVD_LABELS,
  MACHADO_2009,
  SCHEME_PAINT,
  delinearizeChannel,
  hueDistinctionLost,
  rgbDistance,
  simulateHex,
  simulateRgb,
  simulatedContrast,
} from "./color-vision.ts";
import { linearizeChannel } from "./contrast.ts";

describe("Machado 2009 color-vision simulation", () => {
  it("round-trips linearize then delinearize for 8-bit channels", () => {
    for (const value of [0, 10, 64, 128, 200, 255]) {
      const back = delinearizeChannel(linearizeChannel(value));
      assert.ok(Math.abs(back - value) <= 1, `${value} → ${back}`);
    }
  });

  it("leaves typical vision unchanged", () => {
    assert.equal(simulateHex("#ff0000", "none"), "#ff0000");
    assert.equal(simulateHex("#00ff00", "none"), "#00ff00");
    assert.equal(simulateHex("#0000ff", "none"), "#0000ff");
    assert.equal(simulateHex("#f0e8dc", "none"), "#f0e8dc");
  });

  it("keeps white and black stable under dichromacy", () => {
    for (const kind of ["protanopia", "deuteranopia", "tritanopia"] as const) {
      assert.equal(simulateHex("#ffffff", kind), "#ffffff");
      assert.equal(simulateHex("#000000", kind), "#000000");
    }
  });

  it("turns spectral red into olive under protanopia", () => {
    assert.equal(simulateHex("#ff0000", "protanopia"), "#6d5f00");
    const rgb = simulateRgb([255, 0, 0], "protanopia");
    assert.ok(rgb[0] < 180);
    assert.ok(rgb[2] < 20);
    assert.ok(Math.abs(rgb[0] - rgb[1]) < 30);
  });

  it("collapses material red and green under red-green dichromacy", () => {
    const red = "#d32f2f";
    const green = "#2e7d32";
    const typical = rgbDistance(simulateRgb([211, 47, 47], "none"), simulateRgb([46, 125, 50], "none"));
    const protan = rgbDistance(
      simulateRgb([211, 47, 47], "protanopia"),
      simulateRgb([46, 125, 50], "protanopia"),
    );
    const deutan = rgbDistance(
      simulateRgb([211, 47, 47], "deuteranopia"),
      simulateRgb([46, 125, 50], "deuteranopia"),
    );
    assert.ok(typical > 150);
    assert.ok(protan < typical * 0.3, `protan ${protan}`);
    assert.ok(deutan < typical * 0.3, `deutan ${deutan}`);
    assert.equal(hueDistinctionLost(red, green, "protanopia"), true);
    assert.equal(hueDistinctionLost(red, green, "deuteranopia"), true);
    assert.equal(hueDistinctionLost("#1c1611", "#f0e8dc", "protanopia"), false);
  });

  it("keeps paper-on-ink contrast under every Machado view", () => {
    const typical = contrastRatio("#1c1611", "#f0e8dc");
    for (const kind of ["protanopia", "deuteranopia", "tritanopia"] as const) {
      const seen = simulatedContrast("#1c1611", "#f0e8dc", kind);
      assert.ok(Math.abs(seen - typical) < 0.2, `${kind} ${seen}`);
    }
  });

  it("shifts blue under tritanopia more than under protanopia", () => {
    const blue = [0, 0, 255] as const;
    const tritan = simulateRgb([...blue], "tritanopia");
    const protan = simulateRgb([...blue], "protanopia");
    const tritanShift = rgbDistance([...blue], tritan);
    const protanShift = rgbDistance([...blue], protan);
    assert.ok(tritanShift > protanShift);
    assert.ok(tritan[2] < 255);
  });

  it("uses the published 100% Machado matrices", () => {
    assert.equal(MACHADO_2009.protanopia[0][0], 0.152286);
    assert.equal(MACHADO_2009.deuteranopia[1][1], 0.672501);
    assert.equal(MACHADO_2009.tritanopia[2][2], 0.303900);
    assert.equal(CVD_LABELS.deuteranopia, "Deuteranopia");
  });

  it("has a paint map for every NeuroLens room", () => {
    for (const id of ["paper", "night", "contrast", "sage", "ink", "sepia", "cream", "peach", "butter"] as const) {
      assert.equal(SCHEME_PAINT[id]["--color-bg"]?.startsWith("#"), true);
      assert.equal(SCHEME_PAINT[id]["--color-fg"]?.startsWith("#"), true);
    }
  });
});
