/**
 * The app's twelve colour palettes, as the extension paints them.
 *
 * A copy, because the app keeps its palettes in CSS (src/styles.css) and the
 * extension needs the values as data. palettes.test.ts reads the stylesheet
 * and fails if the two ever disagree.
 */

export interface Palette {
  bg: string;
  fg: string;
  dark: boolean;
}

export const PALETTES = {
  paper: { bg: "#f0e8dc", fg: "#1c1611", dark: false },
  night: { bg: "#1a1612", fg: "#f3eadf", dark: true },
  contrast: { bg: "#fffdf6", fg: "#100c08", dark: false },
  sage: { bg: "#e7eee6", fg: "#1b2319", dark: false },
  ink: { bg: "#14161a", fg: "#f2f4f8", dark: true },
  sepia: { bg: "#e9dcc8", fg: "#2a1f14", dark: false },
  mist: { bg: "#e8eef2", fg: "#1a232b", dark: false },
  dusk: { bg: "#1c1418", fg: "#f3e6dc", dark: true },
  cream: { bg: "#f7f1e3", fg: "#2c2418", dark: false },
  forest: { bg: "#152019", fg: "#e6f0e8", dark: true },
  peach: { bg: "#f4ddd2", fg: "#2a1c16", dark: false },
  butter: { bg: "#f2ebc4", fg: "#2a2412", dark: false },
} as const satisfies Record<string, Palette>;

export type PaletteId = keyof typeof PALETTES;

export const PALETTE_NAMES: Record<PaletteId, string> = {
  paper: "Paper",
  night: "Night",
  contrast: "Contrast",
  sage: "Sage",
  ink: "Ink",
  sepia: "Sepia",
  mist: "Mist",
  dusk: "Dusk",
  cream: "Cream",
  forest: "Forest",
  peach: "Peach",
  butter: "Butter",
};

export function isPaletteId(value: unknown): value is PaletteId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PALETTES, value);
}

/** The colour that, inverted, becomes `hex` — for dark palettes painted by inversion. */
export function inverse(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `#${(0xffffff - value).toString(16).padStart(6, "0")}`;
}
