import { contrastRatio, linearizeChannel, parseHex } from "./contrast.ts";
import type { ThemeId } from "./types.ts";

/**
 * Machado, Oliveira & Fernandes 2009 — physiologically-based CVD simulation.
 * 3×3 matrices applied to linear sRGB (not gamma-encoded hex).
 *
 * J. Gustavo, M. Oliveira, L. Fernandes, "A Physiologically-based Model for
 * Simulation of Color Vision Deficiency", IEEE TVCG 15(6), 2009.
 * Values are the published 100% (dichromat) transforms.
 *
 * Why Machado over Brettel 1997 / Viénot 1999:
 *   Brettel is the gold standard for tritanopia (two-plane projection).
 *   Viénot 1999 is a faster Brettel for protan/deutan only.
 *   Machado covers all three dichromacies with one published matrix set,
 *   which is what a live page simulator needs.
 */
export type CvdKind = "none" | "protanopia" | "deuteranopia" | "tritanopia";

export type Rgb = [number, number, number];
export type Matrix3 = readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]];

export const MACHADO_2009: Record<Exclude<CvdKind, "none">, Matrix3> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.011820, 0.042940, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.303900],
  ],
};

export const CVD_LABELS: Record<CvdKind, string> = {
  none: "Typical",
  protanopia: "Protanopia",
  deuteranopia: "Deuteranopia",
  tritanopia: "Tritanopia",
};

export const CVD_HINTS: Record<CvdKind, string> = {
  none: "No simulation. Pair as measured.",
  protanopia: "Reds lean olive. The whole app preview updates.",
  deuteranopia: "Reds and greens meet. The whole app preview updates.",
  tritanopia: "Blues and yellows meet. The whole app preview updates.",
};

export function isCvdKind(value: unknown): value is CvdKind {
  return value === "none" || value === "protanopia" || value === "deuteranopia" || value === "tritanopia";
}

const IDENTITY: Matrix3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

/** Inverse of WCAG linearize: linear 0–1 → sRGB 8-bit. */
export function delinearizeChannel(linear: number): number {
  const c = Math.min(1, Math.max(0, linear));
  const srgb = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, srgb)) * 255);
}

function multiply(matrix: Matrix3, rgb: Rgb): Rgb {
  return [
    matrix[0][0] * rgb[0] + matrix[0][1] * rgb[1] + matrix[0][2] * rgb[2],
    matrix[1][0] * rgb[0] + matrix[1][1] * rgb[1] + matrix[1][2] * rgb[2],
    matrix[2][0] * rgb[0] + matrix[2][1] * rgb[1] + matrix[2][2] * rgb[2],
  ];
}

export function matrixFor(kind: CvdKind): Matrix3 {
  return kind === "none" ? IDENTITY : MACHADO_2009[kind];
}

export function simulateLinearRgb(linear: Rgb, kind: CvdKind): Rgb {
  if (kind === "none") return linear;
  const [r, g, b] = multiply(MACHADO_2009[kind], linear);
  return [
    Math.min(1, Math.max(0, r)),
    Math.min(1, Math.max(0, g)),
    Math.min(1, Math.max(0, b)),
  ];
}

export function simulateRgb(rgb: Rgb, kind: CvdKind): Rgb {
  const linear: Rgb = [linearizeChannel(rgb[0]), linearizeChannel(rgb[1]), linearizeChannel(rgb[2])];
  const simulated = simulateLinearRgb(linear, kind);
  return [delinearizeChannel(simulated[0]), delinearizeChannel(simulated[1]), delinearizeChannel(simulated[2])];
}

function toHex(channel: number): string {
  return channel.toString(16).padStart(2, "0");
}

export function rgbToHex(rgb: Rgb): string {
  return `#${toHex(rgb[0])}${toHex(rgb[1])}${toHex(rgb[2])}`;
}

export function simulateHex(hex: string, kind: CvdKind): string {
  const rgb = parseHex(hex);
  if (kind === "none") {
    return `#${toHex(rgb[0])}${toHex(rgb[1])}${toHex(rgb[2])}`;
  }
  return rgbToHex(simulateRgb(rgb, kind));
}

export function simulatedContrast(foreground: string, background: string, kind: CvdKind): number {
  return contrastRatio(simulateHex(foreground, kind), simulateHex(background, kind));
}

/** True when two colors were far apart in sRGB and the CVD transform pulls them together. */
export function hueDistinctionLost(foreground: string, background: string, kind: CvdKind): boolean {
  if (kind === "none") return false;
  const original = rgbDistance(parseHex(foreground), parseHex(background));
  const seen = rgbDistance(parseHex(simulateHex(foreground, kind)), parseHex(simulateHex(background, kind)));
  return original >= 80 && seen < original * 0.45;
}

/** Euclidean distance in sRGB 8-bit. Used to show hue collapse, not perception. */
export function rgbDistance(a: Rgb, b: Rgb): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/** Hex paints that match [data-scheme] in styles.css. */
export const SCHEME_PAINT: Record<ThemeId, Record<string, string>> = {
  paper: {
    "--color-bg": "#f0e8dc",
    "--color-surface": "#faf4ea",
    "--color-fg": "#1c1611",
    "--color-muted": "#5c5046",
    "--color-subtle": "#7a6d60",
    "--color-primary": "#3d2a1f",
    "--color-primary-fg": "#f4ece1",
    "--color-accent": "#7a4332",
  },
  night: {
    "--color-bg": "#1a1612",
    "--color-surface": "#241e18",
    "--color-fg": "#f3eadf",
    "--color-muted": "#c4b5a4",
    "--color-subtle": "#9a8c7c",
    "--color-primary": "#f3eadf",
    "--color-primary-fg": "#1a1612",
    "--color-accent": "#d4a090",
  },
  contrast: {
    "--color-bg": "#fffdf6",
    "--color-surface": "#ffffff",
    "--color-fg": "#100c08",
    "--color-muted": "#3d342c",
    "--color-subtle": "#5c5146",
    "--color-primary": "#100c08",
    "--color-primary-fg": "#fffdf6",
    "--color-accent": "#6b2e1f",
  },
  sage: {
    "--color-bg": "#e7eee6",
    "--color-surface": "#f3f7f2",
    "--color-fg": "#1b2319",
    "--color-muted": "#4d5a4b",
    "--color-subtle": "#6b7868",
    "--color-primary": "#2c3f30",
    "--color-primary-fg": "#f3f7f2",
    "--color-accent": "#3f5c45",
  },
  ink: {
    "--color-bg": "#14161a",
    "--color-surface": "#1c1f26",
    "--color-fg": "#f2f4f8",
    "--color-muted": "#a8b1be",
    "--color-subtle": "#88919e",
    "--color-primary": "#f2f4f8",
    "--color-primary-fg": "#14161a",
    "--color-accent": "#a8b2c0",
  },
  sepia: {
    "--color-bg": "#e9dcc8",
    "--color-surface": "#f4ead9",
    "--color-fg": "#2a1f14",
    "--color-muted": "#5c4a38",
    "--color-subtle": "#7a6550",
    "--color-primary": "#3a2818",
    "--color-primary-fg": "#f4ead9",
    "--color-accent": "#8a4b32",
  },
  mist: {
    "--color-bg": "#e8eef2",
    "--color-surface": "#f4f8fb",
    "--color-fg": "#1a232b",
    "--color-muted": "#4a5964",
    "--color-subtle": "#6a7882",
    "--color-primary": "#1a232b",
    "--color-primary-fg": "#f4f8fb",
    "--color-accent": "#3d5c6e",
  },
  dusk: {
    "--color-bg": "#1c1418",
    "--color-surface": "#261c22",
    "--color-fg": "#f3e6dc",
    "--color-muted": "#c4b0a4",
    "--color-subtle": "#9a877c",
    "--color-primary": "#f3e6dc",
    "--color-primary-fg": "#1c1418",
    "--color-accent": "#d4a090",
  },
  cream: {
    "--color-bg": "#f7f1e3",
    "--color-surface": "#fffaf0",
    "--color-fg": "#2c2418",
    "--color-muted": "#5c5346",
    "--color-subtle": "#7a7160",
    "--color-primary": "#2c2418",
    "--color-primary-fg": "#fffaf0",
    "--color-accent": "#8a4b32",
  },
  forest: {
    "--color-bg": "#152019",
    "--color-surface": "#1c2a22",
    "--color-fg": "#e6f0e8",
    "--color-muted": "#a8c0b0",
    "--color-subtle": "#87a090",
    "--color-primary": "#e6f0e8",
    "--color-primary-fg": "#152019",
    "--color-accent": "#8fbf9a",
  },
  peach: {
    "--color-bg": "#f4ddd2",
    "--color-surface": "#faebe3",
    "--color-fg": "#2a1c16",
    "--color-muted": "#5c463c",
    "--color-subtle": "#7a6258",
    "--color-primary": "#2a1c16",
    "--color-primary-fg": "#faebe3",
    "--color-accent": "#8a4b32",
  },
  butter: {
    "--color-bg": "#f2ebc4",
    "--color-surface": "#f7f3d8",
    "--color-fg": "#2a2412",
    "--color-muted": "#5c5438",
    "--color-subtle": "#7a7250",
    "--color-primary": "#2a2412",
    "--color-primary-fg": "#f7f3d8",
    "--color-accent": "#7a5c28",
  },
};

const PAINT_KEYS = Object.keys(SCHEME_PAINT.paper);

/** Remap the live theme tokens through Machado, or clear the override. */
export function applyCvdPaint(theme: ThemeId, kind: CvdKind) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (kind === "none") {
    for (const key of PAINT_KEYS) root.style.removeProperty(key);
    delete root.dataset.cvd;
    return;
  }
  const paint = SCHEME_PAINT[theme];
  for (const key of PAINT_KEYS) {
    root.style.setProperty(key, simulateHex(paint[key] ?? "#000000", kind));
  }
  root.dataset.cvd = kind;
}
