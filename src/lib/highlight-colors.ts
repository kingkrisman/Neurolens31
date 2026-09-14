/**
 * The marker palette.
 *
 * A single highlight colour makes every mark mean the same thing. Readers who
 * mark a book are usually sorting it — this is the point, this I disagree with,
 * this I need to look up — and a second colour is what turns a pile of marks
 * into that sorting. So the palette is small and each colour is nameable:
 * six is enough to sort by, and few enough to remember which is which.
 *
 * What is *not* here is freehand ink. The page reflows — that is the whole
 * point of this reader — so a stroke drawn over a line would detach from its
 * words the moment the font, spacing, or width changed. Marks are anchored to
 * character offsets instead, which survive reflow, and colour rides along with
 * them.
 */

export type HighlightColorId = "butter" | "tangerine" | "rose" | "mint" | "sky" | "violet";

export interface HighlightColor {
  id: HighlightColorId;
  /** What this colour is called, for the palette and for screen readers. */
  label: string;
  /** The hue itself, mixed down to a wash at paint time. */
  hex: string;
}

/**
 * Ordered warm-to-cool, so the row reads as a spectrum rather than a jumble
 * and the same colour is always in the same place under the thumb.
 */
export const HIGHLIGHT_COLORS: HighlightColor[] = [
  { id: "butter", label: "Yellow", hex: "#F2C63D" },
  { id: "tangerine", label: "Orange", hex: "#EE8B3C" },
  { id: "rose", label: "Pink", hex: "#E8628C" },
  { id: "mint", label: "Green", hex: "#3FAE7A" },
  { id: "sky", label: "Blue", hex: "#3D92D6" },
  { id: "violet", label: "Purple", hex: "#8B6BD1" },
];

/**
 * What a mark is when nobody chose a colour.
 *
 * Yellow, because that is what a highlighter is: a reader reaching for the tool
 * without a system in mind should get the colour they already expect.
 */
export const DEFAULT_HIGHLIGHT_COLOR: HighlightColorId = "butter";

/** Schemes whose ink is light, where a wash has to lighten rather than tint. */
const DARK_SCHEMES = new Set(["night", "ink", "dusk", "forest"]);

export function isDarkScheme(scheme: string | undefined): boolean {
  return DARK_SCHEMES.has(scheme ?? "");
}

export function colorById(id: string | undefined): HighlightColor {
  return (
    HIGHLIGHT_COLORS.find((color) => color.id === id) ??
    HIGHLIGHT_COLORS.find((color) => color.id === DEFAULT_HIGHLIGHT_COLOR)!
  );
}

/** The `::highlight()` name a colour paints under. One registry entry each. */
export function registryName(id: HighlightColorId): string {
  return `nl-mark-${id}`;
}

/** Every registry name, so stale entries can be cleared without guessing. */
export function allRegistryNames(): string[] {
  return HIGHLIGHT_COLORS.map((color) => registryName(color.id));
}

/**
 * How much of the hue ends up on the page.
 *
 * Light enough that the letterforms read straight through it — a mark that
 * makes its own sentence harder to read has defeated itself. Dark schemes take
 * slightly more, because the same wash under light ink turns to mud.
 */
export function washStrength(dark: boolean): number {
  return dark ? 38 : 30;
}

/**
 * The stylesheet text that paints the whole palette.
 *
 * Built as one string rather than one rule per call because it is replaced
 * wholesale on every scheme change, and a partial update would leave the old
 * scheme's washes behind on colours that happened not to be repainted.
 */
export function paletteStyle(scheme: string | undefined): string {
  const strength = washStrength(isDarkScheme(scheme));
  return HIGHLIGHT_COLORS.map(
    (color) =>
      `::highlight(${registryName(color.id)}){` +
      `background-color:color-mix(in oklab, ${color.hex} ${strength}%, transparent);` +
      `color:var(--color-fg);}`,
  ).join("");
}

/**
 * The swatch colour for the palette control.
 *
 * Stronger than the wash on the page: a swatch is a small target read at a
 * glance, and at 30% the six of them are hard to tell apart.
 */
export function swatchStyle(id: HighlightColorId): string {
  return colorById(id).hex;
}
