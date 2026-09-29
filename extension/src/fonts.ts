/**
 * The app's reading typefaces, bundled with the extension.
 *
 * Websites commonly block fonts from other origins (a Content-Security-Policy
 * font-src), so the extension does not load them from Google Fonts the way the
 * app does. It ships the files (Latin, regular and bold, SIL Open Font
 * Licence — see fonts/LICENSE.md) and hands them to the page as FontFace
 * objects built from the bytes, which no policy on the page can refuse.
 *
 * Families are registered under an "NL " prefix so they can never collide with
 * a font the site itself defines under the same name.
 */

export interface ReadingFont {
  /** What the reader picked it as in the app. */
  label: string;
  /** The family the extension registers, or null for a system stack. */
  family: string | null;
  /** Used after the family, and alone for system stacks. */
  fallback: string;
}

const SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';

export const FONTS = {
  sans: { label: "Sans", family: null, fallback: SANS },
  serif: { label: "Newsreader", family: "NL Newsreader", fallback: SERIF },
  lexend: { label: "Lexend", family: "NL Lexend", fallback: SANS },
  atkinson: { label: "Atkinson", family: "NL Atkinson Hyperlegible", fallback: SANS },
  inclusive: { label: "Inclusive", family: "NL Inclusive Sans", fallback: SANS },
  andika: { label: "Andika", family: "NL Andika", fallback: SANS },
  opendyslexic: { label: "OpenDyslexic", family: "NL OpenDyslexic", fallback: SANS },
  literata: { label: "Literata", family: "NL Literata", fallback: SERIF },
  comicneue: { label: "Comic Neue", family: "NL Comic Neue", fallback: '"Comic Sans MS", ' + SANS },
  sourcesans: { label: "Source Sans", family: "NL Source Sans 3", fallback: SANS },
} as const satisfies Record<string, ReadingFont>;

export type FontKey = keyof typeof FONTS;

export function isFontKey(value: unknown): value is FontKey {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(FONTS, value);
}

/** The CSS font-family value for a font. */
export function fontStack(key: FontKey): string {
  const font: ReadingFont = FONTS[key];
  return font.family ? `"${font.family}", ${font.fallback}` : font.fallback;
}

/** The bundled files for a font, by weight; empty for system stacks. */
export function fontFiles(key: FontKey): { weight: 400 | 700; file: string }[] {
  if (!FONTS[key].family) return [];
  return [
    { weight: 400, file: `fonts/${key}-400.woff2` },
    { weight: 700, file: `fonts/${key}-700.woff2` },
  ];
}
