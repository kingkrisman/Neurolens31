import { applyCvdPaint, isCvdKind, type CvdKind } from "./color-vision";
import { DARK_SCHEMES, type ThemeId } from "./types";

const SCHEMES: ThemeId[] = ["paper", "night", "contrast", "sage", "ink", "sepia", "mist", "dusk", "cream", "forest", "peach", "butter"];

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && SCHEMES.includes(value as ThemeId);
}

export function isDarkScheme(theme: ThemeId): boolean {
  return DARK_SCHEMES.includes(theme);
}

export function applyColorScheme(theme: ThemeId, cvd?: CvdKind) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.scheme = theme;
  const stored = document.documentElement.dataset.cvd;
  const kind: CvdKind = cvd ?? (isCvdKind(stored) ? stored : "none");
  applyCvdPaint(theme, kind);
}
