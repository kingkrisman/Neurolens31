/**
 * Apple WWDC 2018 *Designing Fluid Interfaces* maps onto CSS / GSAP springs.
 *
 * Apple designers set two knobs:
 *   - damping ratio (1.0 = no bounce, ~0.8 = a little overshoot)
 *   - response (seconds to the target — not a CSS duration)
 */

export interface SpringTransition {
  type: "spring";
  bounce: number;
  duration: number;
}

export interface FadeTransition {
  duration: number;
  ease: number[];
}

export type Transition = SpringTransition | FadeTransition;

export const springs = {
  /** Default UI. Apple: damping 1.0, response 0.3 */
  ui: { type: "spring", bounce: 0, duration: 0.3 } satisfies SpringTransition,
  /** Move / reposition. Apple: damping 1.0, response 0.4 */
  move: { type: "spring", bounce: 0, duration: 0.4 } satisfies SpringTransition,
  /** Icon swap. Emil: bounce 0, duration 0.3 */
  icon: { type: "spring", bounce: 0, duration: 0.3 } satisfies SpringTransition,
  /** Drawer / thrown objects. Apple: damping 0.8, response 0.3 */
  sheet: { type: "spring", bounce: 0.2, duration: 0.3 } satisfies SpringTransition,
  /** Soft settle */
  soft: { type: "spring", bounce: 0.12, duration: 0.45 } satisfies SpringTransition,
} as const;

export const reducedFade: FadeTransition = {
  duration: 0.16,
  ease: [0.23, 1, 0.32, 1],
};

export function motionTransition(reduce: boolean | null, spring: Transition): Transition {
  return reduce ? reducedFade : spring;
}

export function isCriticallyDamped(dampingRatio: number): boolean {
  return Math.abs(dampingRatio - 1) < 1e-6;
}

/** Mass-spring form used when handing off finger velocity. Mass is 1. */
export function appleSpring(dampingRatio: number, response: number, mass = 1) {
  const omega = (2 * Math.PI) / response;
  const stiffness = mass * omega * omega;
  const damping = 2 * dampingRatio * mass * omega;
  return { mass, stiffness, damping };
}

/** Exponential-decay projection Apple ships for flick landings. */
export function projectMomentum(velocityPxPerSec: number, decelerationRate = 0.998): number {
  return (velocityPxPerSec / 1000) * decelerationRate / (1 - decelerationRate);
}
