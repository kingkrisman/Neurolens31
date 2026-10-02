import { plainTextFromBionic, processBionicText } from "../../src/lib/bionic.ts";
import { fontStack } from "./fonts.ts";
import { PALETTES, type PaletteId } from "./palettes.ts";
import type { Look, Options } from "./settings.ts";

/**
 * How a site is restyled, as pure functions: the stylesheet, the colour layer
 * and the bold word starts. content.ts puts them on the page.
 *
 * The rule throughout is to change reading text and leave the site's own
 * furniture alone. Menus, headers and buttons are laid out around their type;
 * making them bigger or wider breaks them, and nobody reads a menu for long.
 */

/** Reading text on ordinary pages: what gets the typeface, size and spacing. */
export const PROSE = "p, li, dd, dt, blockquote, figcaption";

/**
 * The body of a post on the social sites, where it is not a paragraph.
 *
 * These sites mark posts up with divs and spans, so `p` finds nothing. The
 * attributes here are the ones they hang their own tests and accessibility on,
 * which makes them steadier than class names. They get the size as well as the
 * typeface: a post is the reading text of a feed.
 */
export const POSTS = [
  "[data-testid='tweetText']", // X
  "[data-testid='postText']", // Bluesky
  "[data-ad-preview='message']", // Facebook
  "[data-ad-comet-preview='message']", // Facebook
  "[slot='text-body']", // Reddit
  "[slot='comment']", // Reddit
  "#content-text", // YouTube comments
  ".update-components-text", // LinkedIn
  ".comments-comment-item__main-content", // LinkedIn
  ".status__content", // Mastodon
].join(", ");

/**
 * Text the social sites write left to right or right to left as it comes:
 * captions, comments and replies on Facebook, Instagram and Threads. Many are
 * short labels too, so these get the typeface and spacing but keep their size,
 * and only the longer ones get bold word starts (see content.ts).
 */
export const LOOSE = "div[dir='auto'], span[dir='auto'], h1[dir='auto']";

/** Everything that counts as reading text, for the bold word starts. */
export const BLOCKS = `${PROSE}, ${POSTS}, ${LOOSE}`;

/** A site's furniture. Text inside these keeps its look. */
export const CHROME =
  "nav, header, footer, menu, button, label, time, [role='navigation'], [role='menubar'], [role='menu'], " +
  "[role='toolbar'], [role='banner'], [role='button'], [role='tab'], [role='tablist'], [role='menuitem'], " +
  "[role='option'], [role='heading'][aria-level='1']";

/** Where bold word starts would break something or mean nothing. */
export const NO_BOLD =
  "pre, code, kbd, samp, var, script, style, noscript, textarea, input, select, option, button, svg, math, " +
  "[contenteditable]:not([contenteditable='false']), [role='textbox'], nl-text";

const prose = `:is(${PROSE}, ${POSTS}, ${LOOSE}):not(:is(${CHROME}) *)`;
const headings = `:is(h1, h2, h3, h4, h5, h6):not(:is(nav, menu, button, [role='navigation']) *)`;
/** Only text with its own size; figcaptions and labels are meant to be small. */
const sized = `:is(p, li, dd, dt, blockquote, ${POSTS}):not(:is(${CHROME}) *)`;
const paragraphs = `:is(p, li, blockquote):not(:is(${CHROME}) *)`;

/** Everything is keyed to this attribute, so undoing is removing it. */
const ON = "html[data-nl-ext]";

export function buildCss(look: Look, options: Options): string {
  const rules: string[] = [];
  if (options.typeface) {
    const stack = fontStack(look.fontFamily);
    rules.push(`${ON} ${prose}, ${ON} ${headings} { font-family: ${stack} !important; }`);
    // At least the reader's size, never smaller than the site made it.
    // `1em` is the parent's size, so nested lists do not compound.
    rules.push(`${ON} ${sized} { font-size: max(1em, ${round(look.fontSize)}px) !important; }`);
  }
  if (options.spacing) {
    rules.push(
      `${ON} ${prose} { line-height: ${round(look.lineHeight)} !important; ` +
        `letter-spacing: ${round(look.letterSpacing)}em !important; ` +
        `word-spacing: ${round(look.wordSpacing)}em !important; }`,
    );
    if (look.align === "justify") {
      rules.push(`${ON} ${paragraphs} { text-align: justify !important; hyphens: auto; }`);
    }
  }
  if (options.bold && look.bionicStrength > 0) {
    // The app's own fixation style, so a page looks as it does in the reader.
    rules.push(`${ON} nl-fx { font-weight: 700 !important; letter-spacing: -0.02em; }`);
  }  if (options.colours) {
    // For a page turned light-for-dark (see tintFor). Pictures are turned back,
    // except inside something already turned back, or they would flip twice.
    rules.push(`html[data-nl-ext][data-nl-flip] { filter: invert(1) hue-rotate(180deg) !important; }`);
    // Pictures, and the layers that belong with them — a dimmed backdrop
    // behind a pop-up, a dark fade over a photo — are turned back. Left turned,
    // those layers are what reads as a white fog over the page. content.ts
    // finds the layers and marks them, since only their computed style shows it.
    const back = "img, video, canvas, iframe, embed, object, [style*='background-image'], [data-nl-unflip]";
    rules.push(
      `html[data-nl-ext][data-nl-flip] :is(${back}):not(:is(${back}) *) ` +
        `{ filter: invert(1) hue-rotate(180deg) !important; }`,
    );
  }
  return rules.join("\n");
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

type Rgb = [number, number, number];

function toRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex(rgb: Rgb): string {
  return `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * CSS `hue-rotate(180deg)`. Its matrix is A − B, where A projects onto
 * luminance and B = I − A, so it is its own inverse: applying it twice gives
 * the colour back. That is what lets tintFor work backwards through it.
 */
export function hueRotate180([r, g, b]: Rgb): Rgb {
  const luma = 0.213 * r + 0.715 * g + 0.072 * b;
  return [2 * luma - r, 2 * luma - g, 2 * luma - b];
}

export interface Tint {
  /** The colour of the layer laid over the page. */
  color: string;
  /** How it mixes with the page: multiply darkens white, screen lifts black. */
  blend: "multiply" | "screen";
  /** Whether the whole page is turned light-for-dark first. */
  flip: boolean;
}

/**
 * How to give a page the reader's palette.
 *
 * One fixed layer over the page, mixed so the page's background becomes the
 * palette's while its text keeps its contrast: on a light page a multiply
 * layer (white × colour = colour, black stays black), on a dark page a screen
 * layer (black becomes the colour, white stays white).
 *
 * A white site under a dark palette (Night, Ink, Dusk, Forest) is turned
 * first with `invert(1) hue-rotate(180deg)`, which swaps light and dark but
 * keeps hues. The layer sits inside the turned page, so its colour is chosen
 * to come out of the turn as the palette:
 * hueRotate180(invert(c)) = bg, so c = invert(hueRotate180(bg)).
 *
 * The other way round — a dark site under a light palette — is left alone,
 * and this returns null. Turning a dark site light washes out the photos,
 * fades and video stills it is built around, and no amount of turning them
 * back makes it look like anything but a negative. The typeface, spacing,
 * bold word starts and mask still apply there.
 */
export function tintFor(palette: PaletteId, pageDark: boolean): Tint | null {
  const { bg, dark } = PALETTES[palette];
  if (pageDark && !dark) return null;
  const flip = dark && !pageDark;
  const color = flip ? toHex(hueRotate180(toRgb(bg)).map((c) => 255 - c) as Rgb) : bg;
  return { color, blend: pageDark ? "screen" : "multiply", flip };
}

/** Whether a computed CSS colour reads as a dark background. */
export function isDarkColor(css: string): boolean | null {
  const match = css.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/);
  if (!match) return null;
  const alpha = match[4] === undefined ? 1 : Number.parseFloat(match[4]) / (match[4].endsWith("%") ? 100 : 1);
  if (alpha < 0.5) return null;
  const [r, g, b] = [match[1], match[2], match[3]].map(Number) as Rgb;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.4;
}

export interface Segment {
  text: string;
  bold: boolean;
}

/**
 * A run of text cut into plain and bold pieces, exactly as the reader cuts it.
 *
 * Returns null when there is nothing to bold, or when the pieces would not add
 * back up to the text — a page's words are never worth rewriting on a guess.
 */
export function bionicSegments(text: string, strength: number): Segment[] | null {
  if (strength <= 0 || !/[A-Za-z]{2}/.test(text)) return null;
  const html = processBionicText(text, strength);
  const segments: Segment[] = [];
  let last = 0;
  for (const match of html.matchAll(/<span class="fixation">([^<]*)<\/span>/g)) {
    if (match.index > last) segments.push({ text: plainTextFromBionic(html.slice(last, match.index)), bold: false });
    segments.push({ text: plainTextFromBionic(match[1]!), bold: true });
    last = match.index + match[0].length;
  }
  if (last < html.length) segments.push({ text: plainTextFromBionic(html.slice(last)), bold: false });
  if (!segments.some((segment) => segment.bold)) return null;
  return segments.map((segment) => segment.text).join("") === text ? segments : null;
}
