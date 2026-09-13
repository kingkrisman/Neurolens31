import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import { deviceMotionSupported, listenToMotion } from "@/lib/device-motion";

/** Dots per edge column. Enough to read as a field, few enough to ignore. */
const PER_EDGE = 6;

/**
 * Vehicle-motion-style cues, for scroll-induced nausea.
 *
 * Modelled on the accommodation iOS ships for reading in a moving car. The
 * discomfort comes from a mismatch: the inner ear reports one thing and the
 * eyes, locked on text that is itself sliding, report another. Damping the
 * animation — which is all the first version of this did — does not address
 * that at all, because the provoking motion is the *scrolling*, and stopping
 * that would mean stopping reading.
 *
 * What helps is giving the eye an independent reference. Dots pinned to the
 * edges of the screen move *against* the scroll, so peripheral vision gets an
 * unambiguous read on direction and speed while central vision stays on the
 * words. The dots are deliberately in the periphery and deliberately dim: they
 * are meant to be seen without being looked at.
 *
 * Driven straight to the DOM rather than through React state. This runs on
 * every scroll frame, and re-rendering twelve dots per frame would spend more
 * than the effect is worth.
 */
export function MotionCues() {
  const enabled = useAppStore((s) => s.profile.motionCues);
  const ref = useRef<HTMLDivElement>(null);
  /**
   * Whether the accelerometer is actually reporting, not merely present.
   *
   * `DeviceMotionEvent` exists in desktop Chrome on a machine with no
   * accelerometer at all, so testing for the API would have stood the scroll
   * fallback down on every desktop and left the cues frozen. The only honest
   * test is whether samples arrive.
   */
  const [sensorLive, setSensorLive] = useState(false);

  /**
   * Physical motion, when the device can report it.
   *
   * This is the signal that actually matches what the inner ear is sensing, so
   * where it exists it takes over from scroll entirely: the dots move with the
   * vehicle rather than with the page. Scrolling remains the fallback, which is
   * better than nothing on a desktop or a device with no accelerometer, but it
   * is a proxy — it describes what the page is doing, which the eyes could
   * already see.
   */
  useEffect(() => {
    if (!enabled || !deviceMotionSupported()) return;
    const root = ref.current;
    if (!root) return;

    let raf = 0;
    let x = 0;
    let y = 0;
    let live = false;

    const stop = listenToMotion((sample) => {
      // A threshold, so a hand resting on a desk does not animate anything.
      // Below roughly this, the reading is noise rather than travel.
      if (Math.abs(sample.x) + Math.abs(sample.y) < 0.12) return;
      if (!live) setSensorLive(true);
      live = true;
      x = sample.x;
      y = sample.y;
      if (!raf) raf = requestAnimationFrame(paint);
    });

    let shift = 0;
    function paint() {
      raf = 0;
      if (!root || !live) return;
      // Opposite the acceleration, which is what makes the field read as a
      // fixed world the reader is travelling through rather than a pattern
      // stuck to the screen.
      shift -= y * 2.4;
      const wrapped = ((shift % 64) + 64) % 64;
      root.style.setProperty("--nl-cue-shift", `${wrapped}px`);
      // Lateral movement leans the columns, so a turn is legible as a turn and
      // not merely as more of the same vertical drift.
      root.style.setProperty("--nl-cue-lean", `${Math.max(-14, Math.min(14, -x * 3)).toFixed(1)}px`);
      const force = Math.min(1, (Math.abs(x) + Math.abs(y)) / 2.2);
      root.style.setProperty("--nl-cue-strength", String(0.25 + force * 0.75));
      raf = requestAnimationFrame(paint);
    }

    return () => {
      stop();
      if (raf) cancelAnimationFrame(raf);
      setSensorLive(false);
    };
  }, [enabled]);

  useEffect(() => {
    // Scroll is the fallback, and it runs until the sensor proves itself. Once
    // real samples are arriving the effect above drives the same custom
    // properties, and two writers would fight — so this one stands down then,
    // and not merely because an API name exists.
    if (!enabled || sensorLive) return;
    const root = ref.current;
    if (!root) return;

    let raf = 0;
    let last = 0;
    let offset = 0;
    let velocity = 0;

    const scroller = () =>
      document.querySelector<HTMLElement>(".reader-scroll") ??
      document.querySelector<HTMLElement>(".pane-scroll");

    const read = () => {
      const node = scroller();
      if (!node) return 0;
      return node.scrollTop;
    };

    last = read();

    const frame = () => {
      raf = 0;
      const now = read();
      const delta = now - last;
      last = now;

      // Counter-motion: the dots travel opposite to the page, which is what
      // makes them read as a fixed world the text is moving through.
      velocity = velocity * 0.82 - delta * 0.55;
      offset += velocity * 0.06;
      // Wrapped to the spacing, so the field scrolls forever without the dots
      // ever running out or snapping back.
      const wrapped = ((offset % 64) + 64) % 64;
      root.style.setProperty("--nl-cue-shift", `${wrapped}px`);
      // Stronger while moving, fading as things settle — a static field of dots
      // is just decoration, and decoration in the periphery is a distraction.
      const intensity = Math.min(1, Math.abs(velocity) / 12);
      root.style.setProperty("--nl-cue-strength", String(0.25 + intensity * 0.75));

      if (Math.abs(velocity) > 0.05) raf = requestAnimationFrame(frame);
    };

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };

    // Bound at the document, capturing, because the scrolling element changes
    // with the view and re-binding on every navigation would miss frames.
    document.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => {
      document.removeEventListener("scroll", onScroll, { capture: true } as EventListenerOptions);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [enabled, sensorLive]);

  if (!enabled) return null;

  return (
    <div ref={ref} aria-hidden className="nl-cues pointer-events-none fixed inset-0 z-50">
      <div className="nl-cue-edge nl-cue-left">
        {Array.from({ length: PER_EDGE }, (_, i) => (
          <span key={i} className="nl-cue-dot" />
        ))}
      </div>
      <div className="nl-cue-edge nl-cue-right">
        {Array.from({ length: PER_EDGE }, (_, i) => (
          <span key={i} className="nl-cue-dot" />
        ))}
      </div>
    </div>
  );
}
