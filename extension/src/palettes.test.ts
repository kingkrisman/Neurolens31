import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { COLOR_SCHEMES, DARK_SCHEMES, FONT_CHOICES } from "../../src/lib/types.ts";
import { FONTS, fontFiles, isFontKey } from "./fonts.ts";
import { PALETTES, PALETTE_NAMES, type PaletteId } from "./palettes.ts";

/** The extension keeps copies of the app's palettes and typefaces; these keep them honest. */

const css = readFileSync(new URL("../../src/styles.css", import.meta.url), "utf8");

test("every palette matches the colours the app paints", () => {
  for (const [id, palette] of Object.entries(PALETTES)) {
    // The block that defines the palette, not a selector list that merely names it.
    const block = [...css.matchAll(new RegExp(`\\[data-scheme="${id}"\\]\\s*\\{([^}]*)\\}`, "g"))]
      .map((match) => match[1]!)
      .find((body) => body.includes("--color-bg"));
    assert.ok(block, `no [data-scheme="${id}"] block in styles.css`);
    assert.equal(block.match(/--color-bg:\s*(#[0-9a-f]{6})/i)?.[1]?.toLowerCase(), palette.bg, `${id} background`);
    assert.equal(block.match(/--color-fg:\s*(#[0-9a-f]{6})/i)?.[1]?.toLowerCase(), palette.fg, `${id} text`);
  }
});

test("the palettes are the app's, no more and no fewer, named the same and dark in the same places", () => {
  assert.deepEqual(Object.keys(PALETTES).sort(), COLOR_SCHEMES.map((scheme) => scheme.id).sort());
  for (const scheme of COLOR_SCHEMES) {
    assert.equal(PALETTE_NAMES[scheme.id as PaletteId], scheme.label);
    assert.equal(PALETTES[scheme.id as PaletteId].dark, DARK_SCHEMES.includes(scheme.id), `${scheme.id} darkness`);
  }
});

test("every typeface the app offers is bundled, under the name the reader knows it by", () => {
  assert.deepEqual(Object.keys(FONTS).sort(), FONT_CHOICES.map((font) => font.id).sort());
  for (const choice of FONT_CHOICES) {
    assert.ok(isFontKey(choice.id));
    assert.equal(FONTS[choice.id].label, choice.label);
    for (const { file } of fontFiles(choice.id)) {
      assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), `missing ${file}`);
    }
  }
  assert.equal(fontFiles("sans").length, 0, "the system sans needs no files");
});
