import type { AdaptiveRule } from "./engine.ts";
import type { Strain } from "./strain.ts";

/**
 * What the engine remembers about whether its own advice worked.
 *
 * Without this the engine was not adaptive in any real sense — it mapped the
 * current metrics to a rule and would keep proposing the same lever forever,
 * however little it helped this particular reader. Larger type genuinely fixes
 * some people's rereading and does nothing for others, and no fixed rule table
 * can know which reader it has.
 *
 * So each lever carries a trust weight that moves with observed outcomes. The
 * engine multiplies strain by trust when choosing, which means a lever that
 * keeps failing quietly loses to its alternatives, and one that works gets
 * reached for sooner. That is a one-armed-per-lever bandit with a
 * multiplicative update — deliberately simple, because the feedback is sparse
 * and noisy and anything cleverer would be fitting noise.
 */
export interface LeverMemory {
  /** Multiplier on this lever's score. 1 is neutral. */
  trust: number;
  /** Peak strain when this lever was last applied, or null if never. */
  strainAtApply: number | null;
  /** Words read at the moment of application, for measuring "since then". */
  wordsAtApply: number;
  /** How many times it has been applied. */
  uses: number;
}

export type AdaptiveMemory = Partial<Record<AdaptiveRule, LeverMemory>>;

export const TRUST = {
  min: 0.25,
  max: 1.5,
  /** Multiplier when a lever visibly helped. */
  reward: 1.25,
  /** Multiplier when strain got worse after it. */
  penalty: 0.6,
  /** Multiplier when it changed nothing measurable. */
  inert: 0.85,
  /** Strain change smaller than this is treated as noise, not signal. */
  margin: 0.08,
  /** Words that must be read after a change before judging it. */
  settleWords: 250,
} as const;

export function newLever(): LeverMemory {
  return { trust: 1, strainAtApply: null, wordsAtApply: 0, uses: 0 };
}

function clampTrust(value: number): number {
  return Math.min(TRUST.max, Math.max(TRUST.min, value));
}

export function leverOf(memory: AdaptiveMemory | undefined, rule: AdaptiveRule): LeverMemory {
  return memory?.[rule] ?? newLever();
}

/** Record that a lever was just applied, so its effect can be judged later. */
export function noteApplied(
  memory: AdaptiveMemory,
  rule: AdaptiveRule,
  strain: Strain,
  wordsRead: number,
): AdaptiveMemory {
  const lever = leverOf(memory, rule);
  return {
    ...memory,
    [rule]: { ...lever, strainAtApply: strain, wordsAtApply: wordsRead, uses: lever.uses + 1 },
  };
}

/**
 * Judge every pending lever against how reading has gone since it was applied.
 *
 * Only levers that have had `settleWords` of reading to take effect are scored;
 * judging a change immediately would mostly measure the disruption of making
 * it. Once judged, `strainAtApply` is cleared so the same outcome is not
 * counted twice.
 */
export function learnFromOutcome(
  memory: AdaptiveMemory,
  strainNow: Strain,
  wordsRead: number,
): AdaptiveMemory {
  let next: AdaptiveMemory | null = null;

  for (const key of Object.keys(memory) as AdaptiveRule[]) {
    const lever = memory[key];
    if (!lever || lever.strainAtApply == null) continue;
    if (wordsRead - lever.wordsAtApply < TRUST.settleWords) continue;

    const delta = lever.strainAtApply - strainNow;
    const factor =
      delta > TRUST.margin ? TRUST.reward : delta < -TRUST.margin ? TRUST.penalty : TRUST.inert;

    next ??= { ...memory };
    next[key] = { ...lever, trust: clampTrust(lever.trust * factor), strainAtApply: null };
  }

  return next ?? memory;
}

/**
 * Record that the reader reached for a lever themselves.
 *
 * Separate from `learnFromOutcome`, and weaker, because it is a different kind
 * of evidence: an outcome says the change *worked*, a preference says this is
 * the control they trust. Both belong in the same weight, and conflating their
 * strength would let someone nudging a slider outweigh a measured result.
 *
 * `strainAtApply` is deliberately left alone. A manual change is not the engine
 * making a move, so there is no pending verdict for it to resolve — and
 * overwriting one would discard a suggestion that was still being judged.
 */
export function learnFromPreference(
  memory: AdaptiveMemory,
  rule: AdaptiveRule,
  factor: number,
): AdaptiveMemory {
  const lever = leverOf(memory, rule);
  return {
    ...memory,
    [rule]: { ...lever, trust: clampTrust(lever.trust * factor) },
  };
}
