import { useSyncExternalStore } from "react";

/**
 * Whether this reader has asked for less motion.
 *
 * Tiny stand-in for motion/react's hook — keeps that library off the first paint.
 *
 * Two exports, and the difference between them is the whole point of this file.
 *
 * `useReducedMotion` is for *rendering*: it re-renders when the preference
 * changes, and it is safe across hydration because it reports what the server
 * reported until hydration finishes.
 *
 * `prefersReducedMotion` is for *effects*, and it is the one that matters for
 * animation. React deliberately uses `getServerSnapshot` during the hydration
 * render, so a hook — any hook, including this one — still says "no preference"
 * on the pass where effects are scheduled. `useGSAP` is one of those effects, so
 * an animation gated only on the hook has already applied its from-state
 * (`opacity: 0; visibility: hidden`) before the corrected value arrives. Somebody
 * who asked for less motion got a flash of exactly the animation they asked not
 * to have; the accessibility audit found it as a contrast failure that appeared
 * and vanished between runs, because it was measuring text mid-fade.
 *
 * An effect runs on the client, where `matchMedia` works, so it should just ask.
 */

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Read the preference now, synchronously.
 *
 * Safe to call from an effect or an event handler; returns false where there is
 * no `matchMedia` to consult, which is a server and some test environments.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** No media queries on a server; motion is decided on the client. */
function getServerSnapshot(): boolean {
  return false;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, getServerSnapshot);
}
