import type { ReadingProfile } from "../types.ts";

/**
 * What the survey is about to change, in words a reader recognises.
 *
 * The survey used to end by applying everything and dropping you into the app,
 * which left no way to tell whether it had done anything at all — and if a
 * reader cannot tell, then as far as they are concerned it did not. This is the
 * list that says otherwise, shown next to a sample of real text before any of
 * it is saved.
 *
 * Deliberately phrased as effects rather than settings. "Letters and words set
 * further apart" is a thing somebody can agree or disagree with; `letterSpacing:
 * 0.08` is not.
 */

const FONT_NAMES: Partial<Record<ReadingProfile["fontFamily"], string>> = {
  opendyslexic: "OpenDyslexic",
  atkinson: "Atkinson Hyperlegible",
  lexend: "Lexend",
  inclusive: "Inclusive Sans",
  andika: "Andika",
  literata: "Literata",
  comicneue: "Comic Neue",
  sourcesans: "Source Sans",
  serif: "a serif face",
  sans: "a sans face",
};

/** Written to complete "Page set to …", so each one is a bare noun phrase. */
const THEME_NAMES: Partial<Record<ReadingProfile["theme"], string>> = {
  paper: "warm paper",
  cream: "cream",
  mist: "cool grey",
  night: "dark",
  sepia: "sepia",
  contrast: "high contrast",
};

/**
 * One line per change, in the order they matter on the page.
 *
 * Compared against the profile that is actually in use, not against the
 * built-in default — somebody retaking the survey should be told what is
 * changing for them, not what would change for a new account.
 */
export function describeChanges(next: ReadingProfile, current: ReadingProfile): string[] {
  const out: string[] = [];

  if (next.fontSize !== current.fontSize) {
    out.push(next.fontSize > current.fontSize ? "Bigger text" : "Smaller text");
  }
  if (next.fontFamily !== current.fontFamily) {
    out.push(`Set in ${FONT_NAMES[next.fontFamily] ?? next.fontFamily}`);
  }
  if (next.lineHeight > current.lineHeight) out.push("More space between lines");
  if (next.letterSpacing > current.letterSpacing || next.wordSpacing > current.wordSpacing) {
    out.push("Letters and words set further apart");
  }
  if (next.theme !== current.theme) {
    out.push(`Page set to ${THEME_NAMES[next.theme] ?? next.theme}`);
  }
  if (next.readingMask && !current.readingMask) {
    out.push(
      next.maskStrength === "strong"
        ? "One line at a time, with the rest of the page quiet"
        : "One line at a time",
    );
  }
  if (next.bionicStrength > current.bionicStrength) {
    out.push("The start of each word weighted, to hold your eye");
  }
  if (next.wordGuide && !current.wordGuide) out.push("The line you are reading marked");
  if (next.letterGuide && !current.letterGuide) out.push("Letters that mirror each other marked");
  if (next.plainLanguage && !current.plainLanguage) out.push("Long words offered in plainer ones");
  if (next.rhythmCurve !== current.rhythmCurve && next.rhythmCurve !== "steady") {
    out.push("A pause built in where a sentence breathes");
  }
  if (next.dimChrome && !current.dimChrome)
    out.push("Everything but the text dimmed while reading");

  return out;
}

/**
 * A passage to show it on.
 *
 * Long enough to wrap several times — the spacing and the mask only mean
 * anything across more than one line — and about nothing, so it is the setting
 * being judged rather than the sentence.
 */
export const SAMPLE_PASSAGE =
  "Reading is not one thing. It is the eye finding the start of a line, " +
  "holding it long enough to take the words in, and then finding the next " +
  "line without losing the thread of the first. When any part of that is " +
  "harder than it should be, the whole page becomes work.";
