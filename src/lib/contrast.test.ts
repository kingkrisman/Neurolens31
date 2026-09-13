import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SCHEME_TOKENS,
  bestContrastTheme,
  contrastRatio,
  describePair,
  evaluateScheme,
  isLargeText,
  linearizeChannel,
  relativeLuminance,
  schemeNeedsBoost,
  textContrastLevel,
  uiContrastPass,
} from "./contrast.ts";
import type { ThemeId } from "./types.ts";

const SCHEMES: ThemeId[] = [
  "paper",
  "night",
  "contrast",
  "sage",
  "ink",
  "sepia",
  "mist",
  "dusk",
  "cream",
  "forest",
  "peach",
  "butter",
];

describe("WCAG 2.2 contrast math", () => {
  it("gives white-on-black a ratio of 21", () => {
    assert.equal(relativeLuminance("#ffffff").toFixed(3), "1.000");
    assert.equal(relativeLuminance("#000000").toFixed(3), "0.000");
    assert.equal(contrastRatio("#ffffff", "#000000").toFixed(1), "21.0");
    assert.equal(linearizeChannel(255).toFixed(3), "1.000");
    assert.equal(linearizeChannel(0).toFixed(3), "0.000");
    assert.ok(linearizeChannel(10) < 10 / 255);
  });

  it("treats 24px as large text and 18px as normal", () => {
    assert.equal(isLargeText(18), false);
    assert.equal(isLargeText(24), true);
    assert.equal(isLargeText(19, true), true);
    assert.equal(textContrastLevel(4.5, 18), "AA");
    assert.equal(textContrastLevel(4.4, 18), "fail");
    assert.equal(textContrastLevel(7, 18), "AAA");
    assert.equal(textContrastLevel(3, 24), "AA");
    assert.equal(uiContrastPass(3), true);
    assert.equal(uiContrastPass(2.9), false);
  });

  it("breaks a pair into luminance and pass levels", () => {
    const pair = describePair("#100c08", "#fffdf6");
    assert.ok(pair.ratio > 18);
    assert.equal(pair.normal, "AAA");
    assert.equal(pair.ui, true);
  });
});

describe("NeuroLens schemes", () => {
  it("meets WCAG AA for body text at the default 18px size", () => {
    for (const id of SCHEMES) {
      const report = evaluateScheme(id, 18);
      assert.ok(report.body >= 4.5, `${id} body ${report.body.toFixed(2)}:1 fails AA`);
      assert.notEqual(report.bodyLevel, "fail");
    }
  });

  it("meets WCAG AA for muted helper text at 18px", () => {
    for (const id of SCHEMES) {
      const report = evaluateScheme(id, 18);
      assert.ok(report.muted >= 4.5, `${id} muted ${report.muted.toFixed(2)}:1 fails AA`);
    }
  });

  it("keeps contrast and ink as the strongest pair in each family", () => {
    assert.ok(evaluateScheme("contrast", 18).body >= evaluateScheme("paper", 18).body);
    assert.ok(evaluateScheme("ink", 18).body >= evaluateScheme("night", 18).body);
    assert.equal(bestContrastTheme("paper"), "contrast");
    assert.equal(bestContrastTheme("sage"), "contrast");
    assert.equal(bestContrastTheme("night"), "ink");
    assert.equal(bestContrastTheme("ink"), "ink");
    assert.equal(bestContrastTheme("contrast"), "contrast");
  });

  it("does not ask the strongest scheme to boost further", () => {
    assert.equal(schemeNeedsBoost("contrast", 18), false);
    assert.equal(schemeNeedsBoost("ink", 18), false);
    assert.ok(SCHEME_TOKENS.paper.fg.startsWith("#"));
  });
});
