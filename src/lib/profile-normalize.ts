import { isThemeId } from "./scheme.ts";
import { resolveRhythmCurve } from "./rhythm.ts";
import { MASK_STRENGTHS, type FontId, type MaskStrength, type ReadingProfile } from "./types.ts";

/**
 * The single point every reading profile passes through before it is stored.
 *
 * Lives here rather than inside the store because it is pure — no DOM, no
 * zustand, no persistence — and because it was untestable where it was. That
 * mattered: it is a function whose entire job is to decide which of a reader's
 * settings survive, and it was silently discarding two of them.
 *
 * `readingMask` and `focusHighlight` were both hardcoded to `false` here, so a
 * write that set either one true had it overwritten in the same call. The
 * toggle flipped and sprang straight back, and the setting reached the database
 * as false. That is what an unimplemented feature looks like after somebody has
 * stopped it misbehaving — and it is invisible from the call site, which is
 * exactly why it outlived the reason for it.
 *
 * So: anything pinned to a constant here needs a comment saying why, and the
 * tests beside this file assert that everything else is preserved.
 */

const FONT_IDS: FontId[] = [
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
];

/**
 * Account facts that used to ride on the profile, and must not any more.
 *
 * Profiles saved before the split still carry `onboardedAt` and `avatar`. They
 * are lifted into `AccountMeta` on hydrate and on pull; after that, leaving them
 * here would keep sending a stale copy to the server inside every profile save.
 */
const ACCOUNT_KEYS = ["onboardedAt", "avatar"] as const;

function withoutAccountFacts(profile: ReadingProfile): ReadingProfile {
  const copy = { ...profile } as Record<string, unknown>;
  for (const key of ACCOUNT_KEYS) delete copy[key];
  return copy as unknown as ReadingProfile;
}

export function normalizeProfile(input: ReadingProfile): ReadingProfile {
  const profile = withoutAccountFacts(input);
  const rhythmCurve = resolveRhythmCurve(profile.rhythmCurve, profile.rhythmOptimization);
  return {
    ...profile,
    fontFamily: FONT_IDS.includes(profile.fontFamily) ? profile.fontFamily : "sans",
    theme: isThemeId(profile.theme) ? profile.theme : "paper",
    rhythmCurve,
    rhythmOptimization: rhythmCurve !== "steady",
    syllables: Boolean(profile.syllables),
    letterGuide: Boolean(profile.letterGuide),
    wordGuide: Boolean(profile.wordGuide),
    readingMask: Boolean(profile.readingMask),
    maskStrength: MASK_STRENGTHS.includes(profile.maskStrength as MaskStrength)
      ? (profile.maskStrength as MaskStrength)
      : "strong",
    /**
     * Pinned off, deliberately — the one exception in this function.
     *
     * No component reads `focusHighlight`; there is nothing for it to turn on.
     * Letting it through would mean the adaptive engine could enable a setting
     * that does nothing, then report having done so. It comes out the moment
     * there is an implementation behind it.
     */
    focusHighlight: false,
    dimChrome: Boolean(profile.dimChrome),
    lookup: profile.lookup !== false,
    attentionFollow: profile.attentionFollow === "pointer" ? "pointer" : "line",
    focusBand: profile.focusBand === 2 || profile.focusBand === 3 ? profile.focusBand : 1,
    plainLanguage: Boolean(profile.plainLanguage),
    motionCues: Boolean(profile.motionCues),
    // Present unless the reader has turned it off, so an existing profile that
    // predates the companion still gets one.
    companion: profile.companion !== false,
  };
}
