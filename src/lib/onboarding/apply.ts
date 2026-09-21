import type { Answers, SurveyOutcome } from "./questions.ts";
import type { MaskStrength, ReadingMode, ReadingProfile, ThemeId } from "../types.ts";

/**
 * Turn five answers into a starting profile.
 *
 * Pure, and kept apart from the component that collects them, because this is
 * the part worth testing: a wrong mapping is not a crash, it is a reader whose
 * first page is worse than the default would have been — and they will assume
 * that is simply what the app looks like.
 *
 * Two principles behind the mapping.
 *
 * **Nothing here is a diagnosis.** "Letters move or blur" chooses a font built
 * for that and opens up the spacing. It does not record, or infer, or store
 * anything about why. See `questions.ts` for the rest of that reasoning.
 *
 * **Start gently.** Every setting this turns on is one a reader can find and
 * turn off, and several of them are strange the first time you meet them —
 * bionic fixation in particular. So the survey picks a mode and nudges, rather
 * than stacking every aid at full strength on somebody who has not read a page
 * yet. Under-doing it costs a trip to the options panel; over-doing it costs
 * the reader, who decides the app is not for them.
 */

const SIZE: Record<string, number> = { s: 17, m: 19, l: 22, xl: 26 };

/** Leading grows with size — big text set tight is harder, not easier. */
const LEADING: Record<string, number> = { s: 1.6, m: 1.7, l: 1.85, xl: 2 };

const THEME: Record<string, ThemeId> = {
  paper: "paper",
  cream: "cream",
  mist: "mist",
  night: "night",
};

/** Words per minute the pacing starts at. Not a target to hit — a starting guess. */
const PACE: Record<string, number> = { slow: 180, steady: 240, quick: 320 };

const has = (answers: Answers, id: keyof Answers, value: string): boolean =>
  (answers[id] ?? []).includes(value);

const one = (answers: Answers, id: keyof Answers): string | undefined => answers[id]?.[0];

/**
 * The mode is chosen by what the reader said gets in the way, not by what they
 * read. A student and a novelist who both lose their place want the same help.
 *
 * Order matters: the checks run from the most specific difficulty to the least,
 * because somebody who ticks several is telling us the first one is the one
 * with a named set of adjustments behind it.
 */
function modeFor(answers: Answers): ReadingMode {
  if (has(answers, "trouble", "blur")) return "dyslexia";
  if (has(answers, "trouble", "wander")) return "adhd";
  if (has(answers, "trouble", "place")) return "focus";
  if (has(answers, "trouble", "dense")) return "academic";
  if (one(answers, "pace") === "quick") return "speed";
  if (one(answers, "reading") === "study") return "academic";
  return "default";
}

export function profileFromAnswers(answers: Answers): SurveyOutcome {
  const profile: Partial<ReadingProfile> = {};
  const mode = modeFor(answers);

  const size = one(answers, "size");
  if (size && SIZE[size]) {
    profile.fontSize = SIZE[size];
    profile.lineHeight = LEADING[size];
  }

  const page = one(answers, "page");
  if (page && THEME[page]) profile.theme = THEME[page];

  // Losing your place is what the mask and the line guide are for, and it is
  // the single most common answer, so it is the one thing the survey turns on
  // outright. Medium rather than strong: a page that goes properly quiet is a
  // lot to meet in your first minute.
  if (has(answers, "trouble", "place")) {
    profile.readingMask = true;
    profile.maskStrength = "medium" satisfies MaskStrength;
    profile.wordGuide = true;
  }

  // Unstable letters: a typeface designed for it, and room around the words.
  // Spacing does at least as much work as the font and is far less strange to
  // look at, so both go up together.
  if (has(answers, "trouble", "blur")) {
    profile.fontFamily = "opendyslexic";
    profile.letterSpacing = 0.04;
    profile.wordSpacing = 0.1;
    profile.lineHeight = Math.max(profile.lineHeight ?? 1.7, 1.9);
  }

  // A wandering mind: fixation weights give the eye somewhere to land, and the
  // chrome gets out of the way. Deliberately not full strength — bionic text is
  // startling at 0.8 and reads as a broken font rather than a feature.
  if (has(answers, "trouble", "wander")) {
    profile.bionicStrength = 0.45;
    profile.dimChrome = true;
  }

  // Tired eyes: bigger, looser and warmer, unless a size or page was chosen
  // explicitly — an answer given directly outranks one inferred.
  if (has(answers, "trouble", "tired")) {
    profile.fontSize = Math.max(profile.fontSize ?? 19, 21);
    profile.lineHeight = Math.max(profile.lineHeight ?? 1.7, 1.9);
    if (!page) profile.theme = "cream";
  }

  // Long sentences: rest at the clause, and plain language where it helps.
  if (has(answers, "trouble", "dense")) {
    profile.rhythmOptimization = true;
    profile.rhythmCurve = "breath";
    profile.plainLanguage = true;
  }

  // Verse by verse is short, numbered and re-read; the extra aids get in the
  // way rather than helping.
  if (one(answers, "reading") === "scripture") {
    profile.bionicStrength = 0;
  }

  const pace = one(answers, "pace");
  const targetWpm = (pace && PACE[pace]) || 240;

  return { profile, mode, targetWpm };
}

/**
 * Whether the survey said anything at all.
 *
 * Skipping every question should leave the defaults alone rather than write a
 * profile identical to them — the difference matters for the adaptive engine,
 * which treats a profile somebody chose as a stronger signal than one they
 * were given.
 */
export function answeredAnything(answers: Answers): boolean {
  return Object.values(answers).some((list) => (list?.length ?? 0) > 0);
}
