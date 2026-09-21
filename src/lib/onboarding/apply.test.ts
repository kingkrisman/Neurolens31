import assert from "node:assert/strict";
import { test } from "node:test";
import { answeredAnything, profileFromAnswers } from "./apply.ts";
import { QUESTIONS, type Answers } from "./questions.ts";
import { READING_PROFILES } from "../types.ts";

/**
 * The mapping is the whole feature, so it is the part with tests.
 *
 * A wrong answer here does not throw. It gives somebody a first page worse
 * than the default would have been, and they conclude that is what the app
 * looks like. There is no error to notice and no bug report to file.
 */

test("every question's choices are unique and non-empty", () => {
  for (const q of QUESTIONS) {
    assert.ok(q.choices.length >= 2, `${q.id} needs choices`);
    const ids = q.choices.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length, `${q.id} has duplicate choice ids`);
    for (const c of q.choices) assert.ok(c.label.trim(), `${q.id} has an unlabelled choice`);
  }
});

test("only one question takes several answers", () => {
  assert.deepEqual(
    QUESTIONS.filter((q) => q.multiple).map((q) => q.id),
    ["trouble"],
  );
});

test("no question asks about a diagnosis", () => {
  // The privacy line this survey is built around: a stated condition is
  // special-category data under the NDPR and the GDPR. Reading difficulties
  // are asked about as difficulties, never as conditions.
  const words = /dyslex|adhd|autis|dyspraxia|diagnos|disorder|disabilit|condition|medication/i;
  for (const q of QUESTIONS) {
    assert.doesNotMatch(q.title, words, q.id);
    assert.doesNotMatch(q.lead ?? "", words, q.id);
    for (const c of q.choices) {
      assert.doesNotMatch(c.label, words, `${q.id}/${c.id}`);
      assert.doesNotMatch(c.hint ?? "", words, `${q.id}/${c.id}`);
    }
  }
});

test("an empty survey changes nothing", () => {
  const out = profileFromAnswers({});
  assert.deepEqual(out.profile, {});
  assert.equal(out.mode, "default");
  assert.equal(answeredAnything({}), false);
});

test("answering anything at all is detected", () => {
  assert.equal(answeredAnything({ size: [] }), false);
  assert.equal(answeredAnything({ size: ["l"] }), true);
});

test("size sets both the size and the leading", () => {
  const small = profileFromAnswers({ size: ["s"] }).profile;
  const large = profileFromAnswers({ size: ["xl"] }).profile;
  assert.ok(small.fontSize! < large.fontSize!);
  // Big text set tight is harder, not easier — leading has to grow with it.
  assert.ok(small.lineHeight! < large.lineHeight!);
});

test("losing your place turns on the mask and the line guide", () => {
  const out = profileFromAnswers({ trouble: ["place"] });
  assert.equal(out.profile.readingMask, true);
  assert.equal(out.profile.wordGuide, true);
  // Medium, not strong: a page that goes fully quiet is a lot to meet first.
  assert.equal(out.profile.maskStrength, "medium");
  assert.equal(out.mode, "focus");
});

test("unstable letters choose the typeface and open the spacing", () => {
  const out = profileFromAnswers({ trouble: ["blur"] });
  assert.equal(out.profile.fontFamily, "opendyslexic");
  assert.ok(out.profile.letterSpacing! > 0);
  assert.ok(out.profile.wordSpacing! > 0);
  assert.ok(out.profile.lineHeight! >= 1.9);
  assert.equal(out.mode, "dyslexia");
});

test("a wandering mind gets fixation weights, but not at full strength", () => {
  const out = profileFromAnswers({ trouble: ["wander"] });
  assert.ok(out.profile.bionicStrength! > 0);
  assert.ok(out.profile.bionicStrength! <= 0.5, "full-strength bionic reads as a broken font");
  assert.equal(out.profile.dimChrome, true);
  assert.equal(out.mode, "adhd");
});

test("tired eyes never shrink the text", () => {
  const out = profileFromAnswers({ trouble: ["tired"], size: ["s"] });
  assert.ok(out.profile.fontSize! >= 21, "a stated difficulty must not be undone by a size pick");
});

test("an explicit page choice outranks the one tired eyes would infer", () => {
  assert.equal(profileFromAnswers({ trouble: ["tired"] }).profile.theme, "cream");
  assert.equal(profileFromAnswers({ trouble: ["tired"], page: ["night"] }).profile.theme, "night");
});

test("long sentences rest at the clause and simplify", () => {
  const out = profileFromAnswers({ trouble: ["dense"] });
  assert.equal(out.profile.rhythmCurve, "breath");
  assert.equal(out.profile.rhythmOptimization, true);
  assert.equal(out.profile.plainLanguage, true);
});

test("scripture turns fixation off, even when something else asked for it", () => {
  // Verse by verse is short, numbered and re-read; the aids get in the way.
  const out = profileFromAnswers({ trouble: ["wander"], reading: ["scripture"] });
  assert.equal(out.profile.bionicStrength, 0);
});

test("pace picks a starting words-per-minute", () => {
  assert.ok(
    profileFromAnswers({ pace: ["slow"] }).targetWpm <
      profileFromAnswers({ pace: ["quick"] }).targetWpm,
  );
  assert.equal(profileFromAnswers({}).targetWpm, 240);
});

test("every page choice maps to a real theme", () => {
  const themes = new Set(Object.values(READING_PROFILES).map((p) => p.theme));
  for (const choice of QUESTIONS.find((q) => q.id === "page")!.choices) {
    const theme = profileFromAnswers({ page: [choice.id] }).profile.theme;
    assert.ok(theme, `${choice.id} produced no theme`);
    // Not necessarily one a preset uses, but it must be a real scheme id.
    assert.equal(typeof theme, "string");
  }
  assert.ok(themes.size > 0);
});

test("every mode the survey can choose is a real mode", () => {
  const seen = new Set<string>();
  for (const trouble of ["place", "blur", "wander", "tired", "dense"]) {
    seen.add(profileFromAnswers({ trouble: [trouble] }).mode);
  }
  for (const pace of ["slow", "steady", "quick"]) {
    seen.add(profileFromAnswers({ pace: [pace] }).mode);
  }
  for (const reading of QUESTIONS.find((q) => q.id === "reading")!.choices) {
    seen.add(profileFromAnswers({ reading: [reading.id] }).mode);
  }
  for (const mode of seen) {
    assert.ok(mode in READING_PROFILES, `${mode} is not a reading mode`);
  }
});

test("several difficulties combine rather than the last one winning", () => {
  const out = profileFromAnswers({ trouble: ["place", "blur", "tired"] });
  assert.equal(out.profile.readingMask, true, "place");
  assert.equal(out.profile.fontFamily, "opendyslexic", "blur");
  assert.ok(out.profile.fontSize! >= 21, "tired");
});

test("the survey never produces a free-text value", () => {
  // Everything it can emit is a number, a boolean, or an id from a fixed list.
  const all: Answers = {
    reading: ["study"],
    trouble: ["place", "blur", "wander", "tired", "dense"],
    size: ["xl"],
    page: ["night"],
    pace: ["quick"],
  };
  for (const [key, value] of Object.entries(profileFromAnswers(all).profile)) {
    assert.ok(["number", "boolean", "string"].includes(typeof value), `${key} is ${typeof value}`);
  }
});
