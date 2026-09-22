import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeProfile } from "./profile-normalize.ts";
import { READING_PROFILES } from "./types.ts";
import type { ReadingProfile } from "./types.ts";

/**
 * A normaliser is a good place for a setting to disappear.
 *
 * Every profile write goes through this one function, and it is the only place
 * that can silently overrule the reader. `readingMask` was hardcoded to `false`
 * here: the toggle set it true, this set it back in the same call, and the
 * switch sprang straight back with nothing in the console and nothing in a
 * test. The feature looked unbuilt because it was being un-built on save.
 *
 * So the rule these tests enforce is simple — every boolean the reader can set
 * survives a round trip — and any exception has to be written down and asserted
 * on purpose, so that dropping a setting can never again be a silent default.
 */

const base = (): ReadingProfile => ({ ...READING_PROFILES.default });

/** Booleans a reader can actually turn on, and which must survive being set. */
const READER_FLAGS = [
  "syllables",
  "letterGuide",
  "wordGuide",
  "readingMask",
  "dimChrome",
  "plainLanguage",
  "motionCues",
] as const;

for (const flag of READER_FLAGS) {
  test(`${flag} survives normalisation when turned on`, () => {
    const out = normalizeProfile({ ...base(), [flag]: true });
    assert.equal(out[flag], true, `${flag} was discarded on save`);
  });

  test(`${flag} survives normalisation when turned off`, () => {
    const out = normalizeProfile({ ...base(), [flag]: false });
    assert.equal(out[flag], false);
  });
}

test("focusHighlight is pinned off, and that is deliberate", () => {
  // The one exception, asserted rather than assumed: nothing renders it, so
  // letting it through would let the adaptive engine enable a setting that does
  // nothing. When it grows an implementation this test should be deleted along
  // with the pin — and it failing is the reminder.
  const out = normalizeProfile({ ...base(), focusHighlight: true });
  assert.equal(out.focusHighlight, false);
});

test("an unknown font falls back rather than being stored", () => {
  const out = normalizeProfile({ ...base(), fontFamily: "wingdings" as never });
  assert.equal(out.fontFamily, "sans");
});

test("every real font is accepted", () => {
  // Guards the whitelist against being retyped from memory: a font missing from
  // it does not error, it silently becomes "sans" for everyone who chose it.
  for (const font of [
    "sans",
    "serif",
    "lexend",
    "atkinson",
    "inclusive",
    "andika",
    "opendyslexic",
    "literata",
    "comicneue",
    "sourcesans",
  ] as const) {
    assert.equal(normalizeProfile({ ...base(), fontFamily: font }).fontFamily, font, font);
  }
});

test("an unknown theme falls back to paper", () => {
  assert.equal(normalizeProfile({ ...base(), theme: "chartreuse" as never }).theme, "paper");
});

test("lookup is on unless explicitly turned off", () => {
  assert.equal(normalizeProfile({ ...base(), lookup: undefined as never }).lookup, true);
  assert.equal(normalizeProfile({ ...base(), lookup: false }).lookup, false);
});

test("the companion survives a profile that predates it", () => {
  assert.equal(normalizeProfile({ ...base(), companion: undefined as never }).companion, true);
  assert.equal(normalizeProfile({ ...base(), companion: false }).companion, false);
});

test("focusBand only accepts 1, 2 or 3", () => {
  assert.equal(normalizeProfile({ ...base(), focusBand: 2 }).focusBand, 2);
  assert.equal(normalizeProfile({ ...base(), focusBand: 3 }).focusBand, 3);
  assert.equal(normalizeProfile({ ...base(), focusBand: 9 as never }).focusBand, 1);
});

test("attentionFollow only accepts its two values", () => {
  assert.equal(
    normalizeProfile({ ...base(), attentionFollow: "pointer" }).attentionFollow,
    "pointer",
  );
  assert.equal(
    normalizeProfile({ ...base(), attentionFollow: "camera" as never }).attentionFollow,
    "line",
  );
});

test("every shipped mode preset normalises to itself", () => {
  // A preset that does not survive its own normaliser is a mode that changes
  // the moment somebody touches any other setting.
  for (const [name, preset] of Object.entries(READING_PROFILES)) {
    assert.deepEqual(
      normalizeProfile({ ...preset }),
      normalizeProfile(normalizeProfile({ ...preset })),
      name,
    );
  }
});

test("account facts are stripped from the profile", () => {
  // They live on AccountMeta now. Left here, every profile save would keep
  // sending a stale copy to the server — and the profile is what mode changes
  // and sync pulls replace, which is how the survey kept coming back.
  const out = normalizeProfile({
    ...base(),
    onboardedAt: 123,
    avatar: { style: "micah", shuffle: 0, background: "" },
  } as never) as unknown as Record<string, unknown>;
  assert.equal("onboardedAt" in out, false);
  assert.equal("avatar" in out, false);
});
