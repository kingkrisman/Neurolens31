import assert from "node:assert/strict";
import { test } from "node:test";
import { READING_PROFILES } from "../../src/lib/types.ts";
import { PALETTES, type PaletteId } from "./palettes.ts";
import { bionicSegments, buildCss, hueRotate180, isDarkColor, tintFor } from "./restyle.ts";
import { DEFAULT_OPTIONS, lookFromProfile } from "./settings.ts";

const look = lookFromProfile({ ...READING_PROFILES.adhd, fontFamily: "lexend", bionicStrength: 0.45 }, "ADHD", 1)!;

test("the stylesheet carries only the parts that are switched on", () => {
  const all = buildCss(look, DEFAULT_OPTIONS);
  assert.match(all, /font-family: "NL Lexend"/);
  assert.match(all, /font-size: max\(1em, \d+px\)/);
  assert.match(all, /line-height: [\d.]+ !important/);
  assert.match(all, /nl-fx \{ font-weight: 700/);
  assert.match(all, /data-nl-flip/);

  const none = buildCss(look, { typeface: false, spacing: false, bold: false, colours: false, mask: false });
  assert.equal(none, "");

  assert.doesNotMatch(buildCss({ ...look, bionicStrength: 0 }, DEFAULT_OPTIONS), /nl-fx/);
});

test("every rule is gated on the page being switched on, so taking the attribute off undoes it", () => {
  for (const line of buildCss(look, DEFAULT_OPTIONS).split("\n")) {
    for (const selector of line.slice(0, line.indexOf("{")).split(/,(?![^(]*\))/)) {
      assert.match(selector.trim(), /^html\[data-nl-ext\]/, selector);
    }
  }
});

test("menus, headers and buttons keep their own type", () => {
  const css = buildCss(look, DEFAULT_OPTIONS);
  assert.match(css, /:not\(:is\(nav, header, footer, menu, button/);
});

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

/** What a pixel of the page becomes under the tint: blend, then the turn if any. */
function composite(page: Rgb, palette: PaletteId, pageDark: boolean): Rgb {
  const tint = tintFor(palette, pageDark)!;
  const layer = rgb(tint.color);
  let out = page.map((c, i) => {
    const a = c / 255;
    const b = layer[i]! / 255;
    return 255 * (tint.blend === "multiply" ? a * b : 1 - (1 - a) * (1 - b));
  }) as Rgb;
  if (tint.flip) out = hueRotate180(out.map((c) => 255 - c) as Rgb);
  return out.map((c) => Math.round(Math.min(255, Math.max(0, c)))) as Rgb;
}

/** Every pairing the extension paints: all palettes on light sites, dark palettes on dark ones. */
const painted = (Object.keys(PALETTES) as PaletteId[]).flatMap((id) =>
  PALETTES[id].dark ? [[id, false] as const, [id, true] as const] : [[id, false] as const],
);

test("every palette it paints turns a page's background into the palette's, exactly", () => {
  for (const [id, pageDark] of painted) {
    const want = rgb(PALETTES[id].bg);
    const got = composite(pageDark ? [0, 0, 0] : [255, 255, 255], id, pageDark);
    got.forEach((c, i) => assert.ok(Math.abs(c - want[i]!) <= 1, `${id} on a ${pageDark ? "dark" : "light"} page: ${got} vs ${want}`));
  }
});

test("a dark site under a light palette keeps its own colours", () => {
  for (const id of Object.keys(PALETTES) as PaletteId[]) {
    if (!PALETTES[id].dark) assert.equal(tintFor(id, true), null, id);
  }
});

test("text keeps its contrast under every palette", () => {
  const luminance = ([r, g, b]: Rgb) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  for (const [id, pageDark] of painted) {
    const background = luminance(rgb(PALETTES[id].bg));
    const ink = luminance(composite(pageDark ? [255, 255, 255] : [0, 0, 0], id, pageDark));
    assert.ok(Math.abs(background - ink) > 0.6, `${id} on a ${pageDark ? "dark" : "light"} page`);
  }
});

test("hue-rotate(180deg) undoes itself, which the tint relies on", () => {
  for (const colour of [[26, 22, 18], [240, 232, 220], [21, 32, 25]] as Rgb[]) {
    hueRotate180(hueRotate180(colour)).forEach((c, i) => assert.ok(Math.abs(c - colour[i]!) < 1e-9));
  }
});

test("page backgrounds are read from computed colours, and see-through ones are not a verdict", () => {
  assert.equal(isDarkColor("rgb(0, 0, 0)"), true);
  assert.equal(isDarkColor("rgb(255, 255, 255)"), false);
  assert.equal(isDarkColor("rgba(0, 0, 0, 0)"), null);
  assert.equal(isDarkColor("rgb(18 18 18 / 90%)"), true);
  assert.equal(isDarkColor("transparent"), null);
});

test("bold word starts cut text exactly as the reader does, and add back up to it", () => {
  const text = "Reading comprehension improves when the eye lands well — “quoted” & <escaped> text.";
  const segments = bionicSegments(text, 0.45);
  assert.ok(segments);
  assert.equal(segments.map((segment) => segment.text).join(""), text);
  assert.deepEqual(segments[0], { text: "Rea", bold: true });
  assert.equal(bionicSegments(text, 0), null);
  assert.equal(bionicSegments("   ", 0.5), null);
  assert.equal(bionicSegments("42 — 17", 0.5), null);
});
