import { DARK_SCHEMES, type ThemeId } from "./types.ts";

/**
 * WCAG 2.2 contrast (relative luminance, SC 1.4.3 / 1.4.6 / 1.4.11).
 *
 * Math:
 *   1. sRGB 8-bit channel C → cs = C / 255
 *   2. Linearize: cs <= 0.04045 ? cs/12.92 : ((cs+0.055)/1.055)^2.4
 *   3. L = 0.2126 R + 0.7152 G + 0.0722 B
 *   4. Contrast = (Llighter + 0.05) / (Ldarker + 0.05)
 *
 * Thresholds (normal text / large text ≥18pt or ≥14pt bold):
 *   AA  4.5:1 / 3:1
 *   AAA 7:1   / 4.5:1
 *   UI components and graphics (SC 1.4.11): 3:1
 *
 * Tokens must stay in sync with [data-scheme] in styles.css.
 */
export const SCHEME_TOKENS: Record<ThemeId, { bg: string; fg: string; muted: string; subtle: string }> = {
  paper: { bg: "#f0e8dc", fg: "#1c1611", muted: "#5c5046", subtle: "#7a6d60" },
  night: { bg: "#1a1612", fg: "#f3eadf", muted: "#c4b5a4", subtle: "#9a8c7c" },
  contrast: { bg: "#fffdf6", fg: "#100c08", muted: "#3d342c", subtle: "#5c5146" },
  sage: { bg: "#e7eee6", fg: "#1b2319", muted: "#4d5a4b", subtle: "#6b7868" },
  ink: { bg: "#14161a", fg: "#f2f4f8", muted: "#a8b1be", subtle: "#88919e" },
  sepia: { bg: "#e9dcc8", fg: "#2a1f14", muted: "#5c4a38", subtle: "#7a6550" },
  mist: { bg: "#e8eef2", fg: "#1a232b", muted: "#4a5964", subtle: "#6a7882" },
  dusk: { bg: "#1c1418", fg: "#f3e6dc", muted: "#c4b0a4", subtle: "#9a877c" },
  cream: { bg: "#f7f1e3", fg: "#2c2418", muted: "#5c5346", subtle: "#7a7160" },
  forest: { bg: "#152019", fg: "#e6f0e8", muted: "#a8c0b0", subtle: "#87a090" },
  peach: { bg: "#f4ddd2", fg: "#2a1c16", muted: "#5c463c", subtle: "#7a6258" },
  butter: { bg: "#f2ebc4", fg: "#2a2412", muted: "#5c5438", subtle: "#7a7250" },
};

export type ContrastLevel = "fail" | "AA" | "AAA";

export interface SchemeContrast {
  id: ThemeId;
  body: number;
  muted: number;
  subtle: number;
  bodyLevel: ContrastLevel;
  mutedLevel: ContrastLevel;
}

export interface ContrastBreakdown {
  fg: string;
  bg: string;
  fgRgb: [number, number, number];
  bgRgb: [number, number, number];
  fgLum: number;
  bgLum: number;
  ratio: number;
  normal: ContrastLevel;
  large: ContrastLevel;
  ui: boolean;
}

function channel(value: number): number {
  const srgb = value / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

/** sRGB 8-bit channel → linearized 0–1, WCAG 2.2. */
export function linearizeChannel(value: number): number {
  return channel(value);
}

export function parseHex(hex: string): [number, number, number] {
  const raw = hex.replace("#", "").trim();
  const full = raw.length === 3 ? raw.split("").map((ch) => ch + ch).join("") : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

export function isHexColor(value: string): boolean {
  const raw = value.replace("#", "").trim();
  return /^[0-9a-fA-F]{3}$/.test(raw) || /^[0-9a-fA-F]{6}$/.test(raw);
}

export function normalizeHex(value: string): string {
  const raw = value.replace("#", "").trim();
  const full = raw.length === 3 ? raw.split("").map((ch) => ch + ch).join("") : raw;
  return `#${full.toLowerCase()}`;
}

/** Relative luminance L, 0–1, WCAG 2.2. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(foreground: string, background: string): number {
  const l1 = relativeLuminance(foreground);
  const l2 = relativeLuminance(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Large text: 18pt (24px) or 14pt (18.67px) bold. */
export function isLargeText(fontSizePx: number, bold = false): boolean {
  if (fontSizePx >= 24) return true;
  return bold && fontSizePx >= 18.67;
}

export function textContrastLevel(ratio: number, fontSizePx: number, bold = false): ContrastLevel {
  const large = isLargeText(fontSizePx, bold);
  const aaa = large ? 4.5 : 7;
  const aa = large ? 3 : 4.5;
  if (ratio >= aaa) return "AAA";
  if (ratio >= aa) return "AA";
  return "fail";
}

/** Non-text UI components and graphics, SC 1.4.11. */
export function uiContrastPass(ratio: number): boolean {
  return ratio >= 3;
}

export function describePair(foreground: string, background: string): ContrastBreakdown {
  const fg = normalizeHex(foreground);
  const bg = normalizeHex(background);
  const ratio = contrastRatio(fg, bg);
  return {
    fg,
    bg,
    fgRgb: parseHex(fg),
    bgRgb: parseHex(bg),
    fgLum: relativeLuminance(fg),
    bgLum: relativeLuminance(bg),
    ratio,
    normal: textContrastLevel(ratio, 16, false),
    large: textContrastLevel(ratio, 24, false),
    ui: uiContrastPass(ratio),
  };
}

export function evaluateScheme(theme: ThemeId, fontSizePx: number, bold = false): SchemeContrast {
  const tokens = SCHEME_TOKENS[theme];
  const body = contrastRatio(tokens.fg, tokens.bg);
  const muted = contrastRatio(tokens.muted, tokens.bg);
  const subtle = contrastRatio(tokens.subtle, tokens.bg);
  return {
    id: theme,
    body,
    muted,
    subtle,
    bodyLevel: textContrastLevel(body, fontSizePx, bold),
    mutedLevel: textContrastLevel(muted, fontSizePx, false),
  };
}

export function bestContrastTheme(current: ThemeId): ThemeId {
  return DARK_SCHEMES.includes(current) ? "ink" : "contrast";
}

export function schemeNeedsBoost(theme: ThemeId, fontSizePx: number): boolean {
  const report = evaluateScheme(theme, fontSizePx);
  if (report.bodyLevel === "fail") return true;
  return theme !== bestContrastTheme(theme) && report.bodyLevel !== "AAA";
}

export function formatContrastRatio(ratio: number): string {
  return `${ratio.toFixed(1)}:1`;
}
