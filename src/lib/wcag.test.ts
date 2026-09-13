import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hueDistinctionLost } from "./color-vision.ts";
import {
  TARGET_SIZE_2_5_8_PX,
  TEXT_SPACING_1_4_12,
  WCAG_22_READER,
  evaluatePairCriteria,
  evaluateTextSpacing,
} from "./wcag.ts";

describe("WCAG 2.2 reader criteria", () => {
  it("includes 2.2 additions and the contrast family", () => {
    const ids = WCAG_22_READER.map((item) => item.id);
    for (const id of ["1.3.1", "1.4.1", "1.4.3", "1.4.6", "1.4.11", "1.4.12", "2.4.1", "2.4.11", "2.5.7", "2.5.8", "3.3.7", "3.3.8", "4.1.2", "4.1.3"]) {
      assert.ok(ids.includes(id), `missing ${id}`);
    }
    assert.equal(WCAG_22_READER.find((item) => item.id === "4.1.3")?.addedIn, "2.1");
    assert.equal(WCAG_22_READER.find((item) => item.id === "4.1.2")?.level, "A");
    assert.equal(TARGET_SIZE_2_5_8_PX, 24);
  });

  it("scores a high-contrast pair as AA and AAA", () => {
    const rows = evaluatePairCriteria({
      ratio: 10.5,
      fontSizePx: 18,
      cvd: "none",
      fg: "#1c1611",
      bg: "#f0e8dc",
    });
    const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
    assert.equal(byId["1.4.3"].status, "pass");
    assert.equal(byId["1.4.6"].status, "pass");
    assert.equal(byId["1.4.11"].status, "pass");
    assert.equal(byId["1.4.1"].status, "info");
  });

  it("flags a red/green pair that collapses under protanopia", () => {
    const rows = evaluatePairCriteria({
      ratio: 2.9,
      fontSizePx: 18,
      cvd: "none",
      fg: "#ff0000",
      bg: "#00ff00",
    });
    assert.equal(rows.find((row) => row.id === "1.4.3")?.status, "fail");

    const fg = "#d32f2f";
    const bg = "#2e7d32";
    assert.equal(hueDistinctionLost(fg, bg, "protanopia"), true);
    const cvd = evaluatePairCriteria({
      ratio: 1.03,
      fontSizePx: 18,
      cvd: "protanopia",
      fg,
      bg,
    });
    assert.equal(cvd.find((row) => row.id === "1.4.1")?.status, "fail");
  });

  it("treats 1.4.12 as override values, not a required default", () => {
    const standard = evaluateTextSpacing({ lineHeight: 1.6, letterSpacing: 0, wordSpacing: 0 });
    assert.equal(standard.lineMeets, true);
    assert.equal(standard.letterMeets, false);
    assert.equal(standard.wordMeets, false);

    const open = evaluateTextSpacing({
      lineHeight: TEXT_SPACING_1_4_12.lineHeight,
      letterSpacing: TEXT_SPACING_1_4_12.letterSpacingEm,
      wordSpacing: TEXT_SPACING_1_4_12.wordSpacingEm,
    });
    assert.equal(open.lineMeets, true);
    assert.equal(open.letterMeets, true);
    assert.equal(open.wordMeets, true);
  });
});
