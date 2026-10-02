import { isFontKey, type FontKey } from "./fonts.ts";
import { isPaletteId, type PaletteId } from "./palettes.ts";

/**
 * What the extension keeps, in `chrome.storage.local` — this browser only.
 *
 *  - `look`: the reader's settings, as the app last handed them over.
 *  - `sites`: the sites they have switched it on for, as origins.
 *  - `options`: which parts of the look to use on sites.
 *  - `pendingArticle`: a page on its way to the app, for a few minutes at most.
 *
 * Nothing here is sent anywhere. The look arrives from the app through the page
 * (see bridge.ts); it is never fetched from a server.
 */

/** The part of the app's reading profile that means anything on a website. */
export interface Look {
  fontFamily: FontKey;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  wordSpacing: number;
  bionicStrength: number;
  theme: PaletteId;
  align: "left" | "justify";
  /** The reader's mask: everything but the line being read goes quiet. */
  readingMask: boolean;
  maskStrength: "soft" | "medium" | "strong";
  /** How many lines the mask keeps lit. */
  focusBand: 1 | 2 | 3;
  /** The reading mode's name, for the popup: "ADHD", "Dyslexia"… */
  modeName: string;
  /** When the app last sent it. */
  at: number;
}

/** Whether each site paints itself dark, as last seen, so colours apply before first paint. */
export type Tones = Record<string, boolean>;

export interface Options {
  typeface: boolean;
  spacing: boolean;
  bold: boolean;
  colours: boolean;
  mask: boolean;
}

export const DEFAULT_OPTIONS: Options = {
  typeface: true,
  spacing: true,
  bold: true,
  colours: true,
  mask: true,
};

export interface PendingArticle {
  title: string;
  text: string;
  url: string;
  at: number;
}

/** How long a page waits for the app to open before it is dropped. */
export const PENDING_TTL_MS = 10 * 60_000;

export interface Stored {
  look?: Look;
  sites?: string[];
  options?: Partial<Options>;
  pendingArticle?: PendingArticle;
  tones?: Tones;
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

/**
 * The look from a profile the app sent. Everything is checked and clamped:
 * the page this came through is ours, but a value that would make every site
 * unreadable is not worth trusting even from ourselves.
 */
export function lookFromProfile(profile: unknown, modeName: unknown, now = Date.now()): Look | null {
  if (!profile || typeof profile !== "object") return null;
  const p = profile as Record<string, unknown>;
  return {
    fontFamily: isFontKey(p.fontFamily) ? p.fontFamily : "sans",
    fontSize: clamp(p.fontSize, 12, 32, 18),
    lineHeight: clamp(p.lineHeight, 1, 2.6, 1.6),
    letterSpacing: clamp(p.letterSpacing, -0.02, 0.2, 0),
    wordSpacing: clamp(p.wordSpacing, -0.05, 0.4, 0),
    bionicStrength: clamp(p.bionicStrength, 0, 1, 0),
    theme: isPaletteId(p.theme) ? p.theme : "paper",
    align: p.align === "justify" ? "justify" : "left",
    readingMask: p.readingMask === true,
    maskStrength: p.maskStrength === "soft" || p.maskStrength === "medium" ? p.maskStrength : "strong",
    focusBand: p.focusBand === 2 || p.focusBand === 3 ? p.focusBand : 1,
    modeName: typeof modeName === "string" && modeName.length <= 40 ? modeName : "",
    at: now,
  };
}

export function readOptions(value: Partial<Options> | undefined): Options {
  const out = { ...DEFAULT_OPTIONS };
  for (const key of Object.keys(DEFAULT_OPTIONS) as (keyof Options)[]) {
    if (typeof value?.[key] === "boolean") out[key] = value[key]!;
  }
  return out;
}

/** The site a URL belongs to, or null where the extension may not act. */
export function siteOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    // The stores' own pages refuse all extensions; better to say so up front.
    if (/^(chrome\.google\.com|chromewebstore\.google\.com|addons\.mozilla\.org|microsoftedge\.microsoft\.com)$/.test(parsed.hostname)) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * The match pattern that covers a site. Ports are left out: match patterns
 * cannot carry one, and the exact origin is checked again before anything runs.
 */
export function patternFor(site: string): string {
  const url = new URL(site);
  return `${url.protocol}//${url.hostname}/*`;
}

/** A short line describing the look, for the popup. */
export function describeLook(look: Look, fontLabel: string, paletteName: string): string {
  const parts = [look.modeName, `${fontLabel} ${Math.round(look.fontSize)}`, paletteName];
  return parts.filter(Boolean).join(" · ");
}
