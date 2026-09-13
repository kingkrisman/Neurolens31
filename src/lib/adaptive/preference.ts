import type { ReadingProfile } from "../types.ts";
import type { AdaptiveRule } from "./engine.ts";

/**
 * What the reader tells the engine by hand.
 *
 * The engine only ever learned from its own suggestions: it proposed a change,
 * watched what happened to strain, and adjusted that lever's trust. Which means
 * the single strongest signal available was being thrown away — when someone
 * reaches over and softens the fixation themselves, that is not an inference
 * about their reading, it is a statement about it. Better evidence than
 * anything derived from scroll behaviour, and it was going in the bin.
 *
 * A manual change is read here as a verdict on the lever it touched, in the
 * direction it was moved. Reaching for a lever repeatedly means it is the one
 * that helps this reader, so the engine should reach for it sooner too.
 */

export interface PreferenceSignal {
  rule: AdaptiveRule;
  /**
   * Which way it was moved.
   *
   * Direction matters as much as the lever. Someone who keeps *lowering* the
   * fixation is telling the engine that raising it is the wrong answer for
   * them, and an engine that read only "they touched fixation" could take that
   * as encouragement to raise it again.
   */
  direction: "up" | "down";
}

/** Which lever each setting belongs to, where one exists. */
const LEVER: Partial<Record<keyof ReadingProfile, AdaptiveRule>> = {
  lineHeight: "rereading",
  fontSize: "type-size",
  theme: "contrast-low",
  bionicStrength: "rereading",
};

/**
 * Compare two profiles and report what the reader changed.
 *
 * Returns nothing for changes that map to no lever — a font family, an
 * alignment — because the engine has no advice to give about those and
 * pretending otherwise would put noise into the trust weights.
 */
export function readPreference(
  before: ReadingProfile,
  after: ReadingProfile,
): PreferenceSignal | null {
  for (const key of Object.keys(LEVER) as (keyof ReadingProfile)[]) {
    const rule = LEVER[key];
    if (!rule) continue;
    const a = before[key];
    const b = after[key];
    if (a === b) continue;

    if (typeof a === "number" && typeof b === "number") {
      return { rule, direction: b > a ? "up" : "down" };
    }
    // A theme change is only ever a move toward more contrast in this context —
    // the reader went looking for a scheme that reads better.
    if (key === "theme") return { rule, direction: "up" };
  }
  return null;
}

/**
 * Trust adjustments for a hand-made change.
 *
 * Deliberately gentler than the reward for a suggestion that measurably
 * reduced strain. A manual change says "this lever is the one I reach for",
 * which is real evidence; it does not say the change worked, because nothing
 * has been measured yet. Overweighting it would let a reader fiddling with a
 * slider drown out the outcomes the engine actually observed.
 */
export const PREFERENCE_WEIGHT = {
  /** Applied when the reader moves a lever the same way the engine would. */
  agrees: 1.12,
  /** Applied when they move it the opposite way. */
  disagrees: 0.9,
} as const;
