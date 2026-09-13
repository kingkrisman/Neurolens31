/**
 * The measurement layer of the adaptive engine.
 *
 * The engine used to test raw counts against fixed thresholds — two rereads
 * fired, one did nothing, and two rereads across a hundred words counted the
 * same as two across five thousand. Counts are not evidence on their own; a
 * rate is, and a rate is only trustworthy in proportion to how much reading it
 * was measured over. This module turns raw events into a bounded strain score
 * that carries both.
 *
 * Every function here is pure and total, so the whole thing is testable without
 * a DOM, a clock, or a reader.
 */

/** Strain is always reported on this scale. 0 is untroubled, 1 is pinned. */
export type Strain = number;

/**
 * Posterior mean of a Poisson rate under a Gamma(0, k) prior.
 *
 * The naive rate is `count / exposure`, which explodes early in a session: one
 * reread in the first fifty words reads as twenty per thousand. Adding `k` to
 * the denominator is the standard shrinkage form — it behaves like `k` units of
 * prior exposure that saw no events, so a thin sample is pulled toward "no
 * problem" and only sustained evidence moves it. As exposure grows past `k` the
 * prior's influence fades and the estimate converges on the observed rate.
 *
 * @param count     events observed (rereads, long pauses)
 * @param exposure  how much reading they were observed over, in the rate's own
 *                  units (thousands of words, or minutes)
 * @param k         prior strength, in the same units as `exposure`
 */
export function shrunkRate(count: number, exposure: number, k: number): number {
  if (count <= 0) return 0;
  const denom = Math.max(0, exposure) + Math.max(1e-9, k);
  return count / denom;
}

/**
 * Map an unbounded rate onto [0, 1) with a Hill curve, `r / (r + r50)`.
 *
 * Strain has to be comparable across channels that are measured in different
 * units — rereads per thousand words against long pauses per minute — so each
 * needs a common scale. This curve is monotonic, smooth, saturating, and has a
 * single parameter that means something concrete: at `r50` the strain reads
 * exactly 0.5. Doubling an already-extreme rate barely moves the score, which
 * is the behaviour wanted — past a point, worse is just worse.
 */
export function saturate(rate: number, half: number): Strain {
  if (rate <= 0) return 0;
  const h = Math.max(1e-9, half);
  return rate / (rate + h);
}

/**
 * How hard to act, given a strain score and the point where acting begins.
 *
 * Returns 0 at or below `floor` and rises linearly to 1 at full strain, so the
 * response is proportional to the evidence instead of the old all-or-nothing
 * step. A reader who rereads twice gets the smallest useful nudge; one who is
 * rereading constantly gets the full correction in a single move.
 */
export function intensity(strain: Strain, floor: number): number {
  if (strain <= floor) return 0;
  const span = Math.max(1e-9, 1 - floor);
  return Math.min(1, (strain - floor) / span);
}

/**
 * Scale a step by intensity and snap it to what the setting can actually hold.
 *
 * Line height moves in tenths and font size in whole pixels, so a raw
 * proportional step has to be quantised or it produces values the UI cannot
 * represent. Rounding up off zero matters: any real strain should move the
 * setting by at least one notch, otherwise mild-but-genuine strain would
 * silently produce no recommendation at all.
 */
export function quantizeStep(maxStep: number, level: number, granularity: number): number {
  if (level <= 0) return 0;
  const raw = maxStep * level;
  const steps = Math.max(1, Math.round(raw / granularity));
  return steps * granularity;
}

/** Half-saturation points, in each channel's own units. */
export const STRAIN_SCALE = {
  /** Rereads per 1000 words at which reread strain reads 0.5. */
  rereadHalf: 2,
  /** Prior exposure for rereads, in thousands of words. */
  rereadPrior: 0.5,
  /** Long pauses per active minute at which pause strain reads 0.5. */
  pauseHalf: 0.8,
  /** Prior exposure for pauses, in minutes. */
  pausePrior: 0.5,
  /** Fraction below target pace at which pace strain reads 0.5. */
  paceHalf: 0.35,
  /** Strain below which nothing is worth changing. */
  actionFloor: 0.35,
} as const;

export interface StrainReport {
  reread: Strain;
  pause: Strain;
  /** How far actual pace sits below target, as strain. */
  pace: Strain;
  /** The strongest single signal, used for cross-session comparison. */
  peak: Strain;
}

/**
 * Score the three channels the reader actually emits evidence for.
 *
 * Kept separate rather than averaged into one number: the engine has to know
 * *which* channel is straining to choose a lever, and averaging would let a
 * calm channel mask a struggling one.
 */
export function measureStrain(input: {
  rereadCount: number;
  longPauseCount: number;
  wordsRead: number;
  activeMs: number;
  currentWpm: number | null;
  targetWpm: number;
}): StrainReport {
  const kWords = Math.max(0, input.wordsRead) / 1000;
  const minutes = Math.max(0, input.activeMs) / 60_000;

  const reread = saturate(
    shrunkRate(input.rereadCount, kWords, STRAIN_SCALE.rereadPrior),
    STRAIN_SCALE.rereadHalf,
  );
  const pause = saturate(
    shrunkRate(input.longPauseCount, minutes, STRAIN_SCALE.pausePrior),
    STRAIN_SCALE.pauseHalf,
  );

  // Pace is already a ratio, so it needs no exposure model — but it is only
  // meaningful once there is a measured pace to compare against.
  const deficit =
    input.currentWpm != null && input.targetWpm > 0
      ? Math.max(0, (input.targetWpm - input.currentWpm) / input.targetWpm)
      : 0;
  const pace = saturate(deficit, STRAIN_SCALE.paceHalf);

  return { reread, pause, pace, peak: Math.max(reread, pause, pace) };
}
