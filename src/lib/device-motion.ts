/**
 * Reading the device's own movement.
 *
 * Scroll-driven cues address the wrong half of the problem. Motion sickness
 * while reading comes from a *conflict*: the inner ear reports that the body is
 * moving — a car, a train, a bus — while the eyes, locked on text that is
 * steady relative to the hand, report that it is not. Cues driven by scrolling
 * only ever describe what the page is doing, which the eyes could already see.
 *
 * The accelerometer is the signal that matches what the inner ear is reporting.
 * When it is available, the cues move with the vehicle and give peripheral
 * vision something that agrees with the vestibular system, which is the whole
 * mechanism by which this helps.
 *
 * Permission is a real obstacle and is treated as one. iOS requires a gesture
 * to even ask, so this is never requested at startup — only when the reader
 * turns motion cues on, and it falls back to the scroll-driven version when
 * refused or unavailable rather than quietly doing nothing.
 */

export interface MotionSample {
  /** Lateral acceleration, in m/s². Positive is to the reader's right. */
  x: number;
  /** Fore-and-aft acceleration. Positive is forward. */
  y: number;
}

type Listener = (sample: MotionSample) => void;

interface OrientationRequest {
  requestPermission?: () => Promise<"granted" | "denied" | "default">;
}

export function deviceMotionSupported(): boolean {
  return typeof window !== "undefined" && "DeviceMotionEvent" in window;
}

/** iOS 13+ gates the sensors behind an explicit, gesture-initiated prompt. */
export function motionPermissionNeeded(): boolean {
  if (!deviceMotionSupported()) return false;
  const ctor = window.DeviceMotionEvent as unknown as OrientationRequest;
  return typeof ctor?.requestPermission === "function";
}

export async function requestMotionPermission(): Promise<boolean> {
  if (!motionPermissionNeeded()) return deviceMotionSupported();
  try {
    const ctor = window.DeviceMotionEvent as unknown as OrientationRequest;
    const result = await ctor.requestPermission?.();
    return result === "granted";
  } catch {
    // Throws when called outside a user gesture, which is a programming error
    // rather than a refusal — but from here the two are indistinguishable, so
    // both mean "no sensor".
    return false;
  }
}

/**
 * Subscribe to the device's acceleration, gravity removed and smoothed.
 *
 * `accelerationIncludingGravity` is used rather than `acceleration`, because
 * the latter is null on a great many Android devices — they report only the
 * combined figure. Gravity is then removed with a slow low-pass filter, which
 * is the standard approach: whatever the accelerometer reads over several
 * seconds *is* the gravity vector, so subtracting the running average leaves
 * the movement.
 *
 * The result is smoothed again, harder. Raw accelerometer data is noisy enough
 * that cues driven straight from it would jitter, and a jittering motion cue
 * makes the problem it exists to solve worse.
 */
export function listenToMotion(onSample: Listener): () => void {
  if (!deviceMotionSupported()) return () => {};

  // Running estimate of gravity, per axis.
  let gx = 0;
  let gy = 0;
  let smoothX = 0;
  let smoothY = 0;
  let seeded = false;

  const GRAVITY_ALPHA = 0.92;
  const SMOOTH_ALPHA = 0.82;

  const onMotion = (event: DeviceMotionEvent) => {
    const reading = event.accelerationIncludingGravity;
    if (!reading || reading.x == null || reading.y == null) return;

    if (!seeded) {
      gx = reading.x;
      gy = reading.y;
      seeded = true;
    }
    gx = GRAVITY_ALPHA * gx + (1 - GRAVITY_ALPHA) * reading.x;
    gy = GRAVITY_ALPHA * gy + (1 - GRAVITY_ALPHA) * reading.y;

    const linearX = reading.x - gx;
    const linearY = reading.y - gy;

    smoothX = SMOOTH_ALPHA * smoothX + (1 - SMOOTH_ALPHA) * linearX;
    smoothY = SMOOTH_ALPHA * smoothY + (1 - SMOOTH_ALPHA) * linearY;

    onSample({ x: smoothX, y: smoothY });
  };

  window.addEventListener("devicemotion", onMotion);
  return () => window.removeEventListener("devicemotion", onMotion);
}
