/**
 * Noticing when someone is flipping between reading modes.
 *
 * A tester read one book across three modes in a row and ended the session
 * with a slight headache. She was careful not to blame the switching — and
 * nothing here claims it did — but she asked the right question: when a
 * reader, especially a young one, is exploring, should the app suggest giving
 * one layout a chance before changing again?
 *
 * A medical reviewer is the one to answer that properly. Until then this does
 * the least that is clearly reasonable: after a few switches close together it
 * says so, once, gently, and gets out of the way. It blocks nothing, stores
 * nothing, and makes no health claim.
 */

/** Switches, inside this window, before the suggestion appears. */
export const SETTLE = { switches: 3, windowMs: 10 * 60_000 } as const;

/** Pure, so the threshold can be tested without a clock or a store. */
export function shouldSuggestSettling(times: number[], now: number): boolean {
  return times.filter((at) => now - at <= SETTLE.windowMs).length >= SETTLE.switches;
}

// Per page load: once per visit is a suggestion, every time is nagging.
let recent: number[] = [];
let suggested = false;
const listeners = new Set<() => void>();

/** Record that the reader changed mode. Call only on a real change. */
export function noteModeSwitch(now = Date.now()): void {
  recent = [...recent.filter((at) => now - at <= SETTLE.windowMs), now];
  if (suggested || !shouldSuggestSettling(recent, now)) return;
  suggested = true;
  for (const listener of listeners) listener();
}

export function onSettleSuggestion(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Tests only. */
export function resetComfort(): void {
  recent = [];
  suggested = false;
}
