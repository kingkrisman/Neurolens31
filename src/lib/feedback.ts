import { announce } from "./announce.ts";
import { impact, notification, selection } from "./haptics.ts";

export type FeedbackKind = "press" | "ok" | "good" | "bad" | "start" | "adapt";

/**
 * The old vocabulary, mapped onto the real one.
 *
 * These six names predate the haptics module and are still used across the app.
 * Rather than a churn of renames, each is translated to the Apple intent it
 * always meant — which is also a useful check on the naming: "ok" was doing the
 * work of a light impact, and "good"/"bad" were notifications all along.
 */
const AS_INTENT: Record<FeedbackKind, () => void> = {
  press: () => impact("light"),
  ok: () => selection(),
  good: () => notification("success"),
  bad: () => notification("warning"),
  start: () => impact("soft"),
  adapt: () => impact("rigid"),
};

/**
 * Haptics for a legacy feedback name.
 *
 * Kept as the old export so existing call sites are unchanged, but the
 * behaviour now goes through the same generators as everything else — including
 * the iOS path, which the previous `navigator.vibrate`-only version could never
 * reach.
 */
export function tapFeedback(kind: FeedbackKind) {
  AS_INTENT[kind]?.();
}

export interface FeedbackOptions {
  /** Said to assistive tech. Without this, the action is silent to a screen reader. */
  message?: string;
}

/**
 * Confirm an action across every channel available.
 *
 * The app used to confirm actions with haptics alone. On an iPhone, on any
 * desktop, and to any screen reader, that meant marking a passage or accepting
 * a suggestion produced *nothing* — the state changed and nothing said so.
 *
 * There is deliberately no visual channel here. Every action that calls this
 * already has one that suits it better than a generic flash would: a highlight
 * draws its own marker stroke, and the rest raise a toast. A ring on the
 * control was tried and does not survive contact with React — these actions
 * re-render or unmount the very button that triggered them, so the class is
 * wiped before it can play. Sight is covered at the call site; what was
 * missing, and what this adds, is speech.
 */
export function feedback(kind: FeedbackKind, options: FeedbackOptions = {}) {
  tapFeedback(kind);
  if (options.message) announce(options.message);
}
