/**
 * Haptics, modelled on Apple's vocabulary.
 *
 * iOS does not expose one "vibrate" call — it exposes intent. `UISelectionFeedbackGenerator`
 * for moving through options, `UIImpactFeedbackGenerator` in five weights for
 * something landing, `UINotificationFeedbackGenerator` in three outcomes for
 * something concluding. The reason that feels good is not the hardware alone:
 * it is that the same gesture always produces the same sensation everywhere in
 * the system, so the feedback becomes legible rather than decorative.
 *
 * This app previously had six ad-hoc names ("ok", "good", "adapt") mapped to
 * hand-picked millisecond patterns, used in eight places out of several hundred
 * controls. Naming the intents properly is what makes consistent use possible.
 *
 * ## What the web can actually deliver
 *
 * Being plain about this, because the gap is large and pretending otherwise
 * would mean shipping something that silently does nothing:
 *
 *  - **Android / Chromium** — `navigator.vibrate` gives duration only. No
 *    intensity, no sharpness. Weight is approximated with duration and with the
 *    gap structure of multi-pulse patterns, which is the only expressive axis
 *    available.
 *  - **iOS Safari** — has never shipped `navigator.vibrate`, and there is no Web
 *    API that reaches the Taptic Engine. The one real exception is the switch
 *    control added in iOS 17.4, which plays a system haptic when toggled; that
 *    is used here as the only honest path to real iPhone haptics on the web.
 *  - **Desktop** — no haptic hardware. Silent, by design.
 *
 * So on an iPhone this delivers genuine Taptic feedback for the selection-shaped
 * events it can reach, and nothing for the rest. That is a real limitation of
 * the platform, not something a library can paper over.
 */

export type ImpactWeight = "light" | "medium" | "heavy" | "soft" | "rigid";
export type NotificationKind = "success" | "warning" | "error";

/**
 * Durations and gaps, in milliseconds.
 *
 * Tuned against how the corresponding iOS generators feel rather than by
 * picking round numbers. Weight reads mostly as duration; *sharpness* has no
 * direct analogue, so a rigid tap is short and isolated while a soft one is
 * slightly longer and blunter. The notification patterns keep Apple's rhythm:
 * success rises, warning is two even beats, error is a stumble.
 */
const PATTERNS = {
  selection: 6,
  impact: {
    light: 10,
    medium: 18,
    heavy: 32,
    soft: 24,
    rigid: 8,
  },
  notification: {
    success: [12, 70, 20],
    warning: [22, 90, 22],
    error: [28, 60, 28, 60, 40],
  },
} as const;

function reducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function vibrationSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

/**
 * Does this look like an iPhone or iPad running a Safari that has the switch
 * haptic? Feature detection cannot answer it — the behaviour is invisible to
 * script — so this is the one place a platform check is the only option.
 */
export function iosHapticSwitchAvailable(): boolean {
  if (typeof navigator === "undefined" || typeof document === "undefined") return false;
  const ua = navigator.userAgent;
  const isApple = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (!isApple) return false;
  // `switch` is only a known attribute where the control exists at all, so this
  // separates iOS 17.4+ from everything before it.
  const probe = document.createElement("input");
  probe.type = "checkbox";
  return "switch" in probe;
}

let switchEl: HTMLInputElement | null = null;

/**
 * Toggle an off-screen switch to make iOS play its selection haptic.
 *
 * The element is created once and kept: building one per tap would have the
 * browser laying out and discarding a control on every interaction, and the
 * haptic sometimes does not fire on an element that has only just been
 * inserted.
 */
function pulseIosSwitch() {
  if (typeof document === "undefined") return;
  if (!switchEl) {
    switchEl = document.createElement("input");
    switchEl.type = "checkbox";
    switchEl.setAttribute("switch", "");
    switchEl.setAttribute("aria-hidden", "true");
    switchEl.tabIndex = -1;
    // Off-screen rather than `display: none`: a control that is not rendered
    // does not run the system's toggle behaviour, and the haptic with it.
    switchEl.style.cssText =
      "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;";
    document.body.appendChild(switchEl);
  }
  try {
    switchEl.checked = !switchEl.checked;
    switchEl.dispatchEvent(new Event("change", { bubbles: false }));
  } catch {
    /* the haptic is a courtesy, never a feature */
  }
}

function play(pattern: number | readonly number[]) {
  // Reduced motion covers haptics too: for a reader with vestibular sensitivity
  // a buzzing device is the same category of problem as a moving page.
  if (reducedMotion()) return;

  if (vibrationSupported()) {
    try {
      navigator.vibrate(pattern as number | number[]);
      return;
    } catch {
      /* fall through to the iOS path */
    }
  }
  if (iosHapticSwitchAvailable()) pulseIosSwitch();
}

/** Moving through options: a segmented control, a slider notch, a picker row. */
export function selection() {
  play(PATTERNS.selection);
}

/** Something landing: a toggle committing, a sheet settling, a drag snapping. */
export function impact(weight: ImpactWeight = "medium") {
  play(PATTERNS.impact[weight]);
}

/** Something concluding: saved, refused, failed. */
export function notification(kind: NotificationKind) {
  play(PATTERNS.notification[kind]);
}

/** Exposed for tests, so the tuning is checked rather than merely written down. */
export const HAPTIC_PATTERNS = PATTERNS;
