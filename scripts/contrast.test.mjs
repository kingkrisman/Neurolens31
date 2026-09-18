import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { contrast, luminance, meetRatio, parseHex, ratioOf } from "./contrast.mjs";
import { AA_TEXT, TEXT_TOKENS, findFailures, findPalettes } from "./audit-themes.mjs";

const STYLES = readFileSync("src/styles.css", "utf8");

/**
 * The audit these test has to keep honest.
 *
 * `audit-themes.mjs` shipped once with a lost backslash — `\s` inside a
 * template literal, which JavaScript quietly reads as a plain `s`. Every token
 * regex then matched nothing, so the audit found fifteen palettes, checked no
 * colours in any of them, and printed "every text colour clears 4.5:1". An
 * audit that reports success when it has examined nothing is worse than no
 * audit, because it is believed. Hence the tests below that assert it *finds*
 * things, not only that it passes.
 */

test("known contrast ratios are computed correctly", () => {
  // The two anchors of the scale: identical colours, and the extremes.
  assert.equal(contrast([0, 0, 0], [255, 255, 255]).toFixed(2), "21.00");
  assert.equal(contrast([18, 52, 86], [18, 52, 86]).toFixed(2), "1.00");
  // The value a browser's own auditor reported for the palette this came from.
  assert.equal(ratioOf("#7a6d60", "#f0e8dc").toFixed(2), "4.13");
});

test("hex parsing handles both lengths and rejects nonsense", () => {
  assert.deepEqual(parseHex("#fff"), [255, 255, 255]);
  assert.deepEqual(parseHex("123456"), [18, 52, 86]);
  assert.equal(parseHex("#12345"), null);
  assert.equal(parseHex("rebeccapurple"), null);
});

test("luminance is ordered the way brightness is", () => {
  assert.ok(luminance([255, 255, 255]) > luminance([128, 128, 128]));
  assert.ok(luminance([128, 128, 128]) > luminance([0, 0, 0]));
});

test("meetRatio darkens against a light ground and lightens against a dark one", () => {
  const onLight = meetRatio("#7a6d60", "#f0e8dc", 4.5);
  assert.ok(ratioOf(onLight, "#f0e8dc") >= 4.5);
  assert.ok(luminance(parseHex(onLight)) < luminance(parseHex("#7a6d60")), "should darken");

  const onDark = meetRatio("#3a3a3a", "#111111", 4.5);
  assert.ok(ratioOf(onDark, "#111111") >= 4.5);
  assert.ok(luminance(parseHex(onDark)) > luminance(parseHex("#3a3a3a")), "should lighten");
});

test("a colour that already passes is returned unchanged", () => {
  assert.equal(meetRatio("#1c1611", "#f0e8dc", 4.5), "#1c1611");
});

test("the audit finds every palette in the stylesheet", () => {
  const palettes = findPalettes(STYLES);
  // Fifteen today. The assertion is a floor, not an equality, so adding a
  // theme does not fail the suite — but losing them all does, which is the
  // failure this exists to catch.
  assert.ok(palettes.length >= 15, `found only ${palettes.length} palettes`);
  for (const palette of palettes) {
    assert.match(palette.bg, /^#[0-9a-f]{3,8}$/i);
  }
});

test("the audit actually reads colours out of each palette", () => {
  // The regression test for the lost backslash: a palette with an empty
  // `colours` array is a palette that was never checked.
  const palettes = findPalettes(STYLES);
  const empty = palettes.filter((palette) => palette.colours.length === 0);
  assert.deepEqual(
    empty.map((palette) => palette.label),
    [],
    "these palettes were found but no text colours were read from them",
  );
  for (const palette of palettes) {
    for (const { token } of palette.colours) {
      assert.ok(TEXT_TOKENS.includes(token));
    }
  }
});

test("the audit detects a failure that is really there", () => {
  // Not the real stylesheet: a tiny one with a colour known to be 4.13:1.
  const failures = findFailures(`:root { --color-bg: #f0e8dc; --color-subtle: #7a6d60; }`);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].token, "--color-subtle");
  assert.ok(ratioOf(failures[0].suggestion, "#f0e8dc") >= AA_TEXT);
});

test("the audit is quiet about a palette that passes", () => {
  assert.deepEqual(findFailures(`:root { --color-bg: #ffffff; --color-fg: #000000; }`), []);
});

test("every shipped palette clears WCAG 2.2 AA for body text", () => {
  // The actual claim the accessibility statement makes, asserted against the
  // actual stylesheet. This is the test that would have caught eight palettes
  // whose small print sat between 3.88:1 and 4.34:1 for months.
  const failures = findFailures(STYLES);
  assert.deepEqual(
    failures.map((f) => `${f.label} ${f.token}: ${f.colour} on ${f.bg} = ${f.ratio.toFixed(2)}:1`),
    [],
  );
});
