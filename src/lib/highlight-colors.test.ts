import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_HIGHLIGHT_COLOR,
  HIGHLIGHT_COLORS,
  allRegistryNames,
  colorById,
  isDarkScheme,
  paletteStyle,
  registryName,
  washStrength,
} from "./highlight-colors.ts";

describe("the palette", () => {
  it("gives every colour a distinct id", () => {
    const ids = HIGHLIGHT_COLORS.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("gives every colour a distinct hue", () => {
    // Two swatches the same colour are two ways to say the same thing, which
    // defeats sorting marks by colour.
    const hexes = HIGHLIGHT_COLORS.map((c) => c.hex.toLowerCase());
    assert.equal(new Set(hexes).size, hexes.length);
  });

  it("names every colour in words a reader would use", () => {
    for (const color of HIGHLIGHT_COLORS) {
      assert.match(color.label, /^[A-Z][a-z]+$/, `${color.id} needs a plain name`);
    }
  });

  it("stays small enough to remember what each colour means", () => {
    assert.ok(HIGHLIGHT_COLORS.length <= 6);
  });

  it("includes the default", () => {
    assert.ok(HIGHLIGHT_COLORS.some((c) => c.id === DEFAULT_HIGHLIGHT_COLOR));
  });
});

describe("colorById", () => {
  it("finds a colour by its id", () => {
    assert.equal(colorById("sky").label, "Blue");
  });

  it("falls back to the default for a mark saved before colours existed", () => {
    // Every highlight in storage predates this field; none may be lost.
    assert.equal(colorById(undefined).id, DEFAULT_HIGHLIGHT_COLOR);
  });

  it("falls back for a colour that has since been removed", () => {
    assert.equal(colorById("chartreuse").id, DEFAULT_HIGHLIGHT_COLOR);
  });
});

describe("registryName", () => {
  it("keeps each colour in its own highlight registry entry", () => {
    const names = allRegistryNames();
    assert.equal(new Set(names).size, names.length);
    assert.equal(names.length, HIGHLIGHT_COLORS.length);
  });

  it("produces a name that is valid as a CSS identifier", () => {
    for (const name of allRegistryNames()) assert.match(name, /^[a-zA-Z][\w-]*$/);
  });
});

describe("washStrength", () => {
  it("lays more colour over light ink than over dark", () => {
    assert.ok(washStrength(true) > washStrength(false));
  });

  it("never covers the words it marks", () => {
    // Past roughly half, the wash competes with the letterforms it sits under.
    assert.ok(washStrength(true) < 50);
    assert.ok(washStrength(false) < 50);
  });
});

describe("isDarkScheme", () => {
  it("knows the dark schemes", () => {
    assert.equal(isDarkScheme("night"), true);
    assert.equal(isDarkScheme("ink"), true);
  });

  it("treats paper and an unknown scheme as light", () => {
    assert.equal(isDarkScheme("paper"), false);
    assert.equal(isDarkScheme(undefined), false);
  });
});

describe("paletteStyle", () => {
  it("writes a rule for every colour", () => {
    const css = paletteStyle("paper");
    for (const color of HIGHLIGHT_COLORS) {
      assert.ok(css.includes(`::highlight(${registryName(color.id)})`), `${color.id} missing`);
    }
  });

  it("keeps the text colour explicit so ink stays readable through the wash", () => {
    assert.ok(paletteStyle("paper").includes("color:var(--color-fg)"));
  });

  it("changes with the scheme", () => {
    // The sheet is replaced wholesale on a scheme change; if the two agreed,
    // that replacement would be doing nothing.
    assert.notEqual(paletteStyle("paper"), paletteStyle("night"));
  });

  it("emits no newlines that would break replaceSync parsing expectations", () => {
    assert.ok(!paletteStyle("paper").includes("\n"));
  });
});
