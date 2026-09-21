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
 * **Answer the question that was asked.** The first version of this nudged —
 * a mask at medium, fixation at half strength — on the theory that a strong
 * first impression might put somebody off. That was the wrong worry. Somebody
 * who has just said "I lose my place" and then sees a page that looks almost
 * identical concludes the survey did nothing, and they are right: the settings
 * were real but too faint to notice. Under-doing it does not cost a trip to
 * the options panel, it costs the reader's belief that the app does anything.
 *
 * So each answer now applies the setting at the strength it exists for. The
 * last step of the survey shows the result on real text before any of it is
 * saved, which is the honest place to handle "this is too much" — by showing
 * it, rather than by pre-emptively watering everything down.
 */

const SIZE: Record<string, number> = { s: 17, m: 20, l: 24, xl: 29 };

/** Leading grows with size — big text set tight is harder, not easier. */
const LEADING: Record<string, number> = { s: 1.6, m: 1.75, l: 1.95, xl: 2.15 };

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

  // Losing your place is what the mask is for, and it is the answer the mask
  // was built for, so it arrives at full strength. A mask you have to squint to
  // notice is not a mask — and "How quiet" in reading options turns it down in
  // one tap for anybody who wants that.
  if (has(answers, "trouble", "place")) {
    profile.readingMask = true;
    profile.maskStrength = "strong" satisfies MaskStrength;
    profile.wordGuide = true;
    profile.focusBand = 1;
  }

  // Unstable letters: a typeface designed for it, and room around the words.
  // Spacing does at least as much work as the font and is far less strange to
  // look at, so both go up together.
  if (has(answers, "trouble", "blur")) {
    profile.fontFamily = "opendyslexic";
    profile.letterSpacing = 0.08;
    profile.wordSpacing = 0.18;
    profile.lineHeight = Math.max(profile.lineHeight ?? 1.75, 2.05);
    profile.letterGuide = true;
  }

  // A wandering mind: fixation weights give the eye somewhere to land, the
  // chrome gets out of the way, and the page stops offering anywhere else to
  // look. 0.7 is firmly visible — the point of fixation is that you see it.
  if (has(answers, "trouble", "wander")) {
    profile.bionicStrength = 0.7;
    profile.dimChrome = true;
    profile.readingMask = true;
    profile.maskStrength ??= "medium" satisfies MaskStrength;
  }

  // Tired eyes: bigger, looser and warmer, unless a size or page was chosen
  // explicitly — an answer given directly outranks one inferred.
  if (has(answers, "trouble", "tired")) {
    profile.fontSize = Math.max(profile.fontSize ?? 20, 23);
    profile.lineHeight = Math.max(profile.lineHeight ?? 1.75, 2);
    profile.wordSpacing = Math.max(profile.wordSpacing ?? 0, 0.06);
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
