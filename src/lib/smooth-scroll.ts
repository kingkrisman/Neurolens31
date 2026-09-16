import Lenis from "lenis";
import { useEffect, type RefObject } from "react";

/**
 * Weighted scrolling.
 *
 * A wheel or trackpad normally moves the page in hard steps; here the page is
 * given a little mass, so it glides toward where the input sent it and settles
 * rather than stopping dead. `lerp` is how much of the remaining distance is
 * covered each frame — 0.085 is deliberately heavier than Lenis's default, so
 * it feels considered, but not so heavy that the page lags behind a flick and
 * reads as unresponsive.
 *
 * What is left alone:
 *  - Touch-first devices. Phones already have real momentum scrolling tuned by
 *    the OS; faking it on top feels worse, not better — so Lenis is not started
 *    there at all, and they keep CSS scroll snapping too.
 *  - The reader. Reading position, auto-scroll and drawing all depend on scroll
 *    doing exactly what the finger or wheel did.
 *  - Anything with its own scrolling — dialogs, menus, text boxes, code — so a
 *    wheel inside them scrolls them, not the page behind.
 *  - Reduced motion, where smoothing is switched off entirely.
 *
 * And one thing it cannot share a scroller with: CSS scroll snapping. Every
 * frame Lenis writes a position; the browser pulls it onto the nearest snap
 * point, so the page lurches forward and then freezes while the glide carries
 * on underneath, and the next wheel starts from the wrong place. Snapping is
 * switched off wherever Lenis drives a scroller (see `.lenis` in styles.css).
 */

const INSTANCES = new Map<Window | HTMLElement, Lenis>();

const OPTIONS = {
  lerp: 0.085,
  wheelMultiplier: 0.9,
  smoothWheel: true,
  syncTouch: false,
  // Driven by the shared clock below instead.
  autoRaf: false,
  autoResize: true,
  // A nested list takes the wheel only while it can still move that way, then
  // hands off to the page — as native scrolling does. Direction-aware, and its
  // style reads are cached, unlike a walk up the tree on every wheel event.
  allowNestedScroll: true,
} as const;

/**
 * One clock for every instance, with its step capped.
 *
 * Native scrolling runs off the main thread, so a busy frame never touches it.
 * A glide cannot: Lenis moves the page from JavaScript, and it eases by elapsed
 * time — so after a frame the main thread spent elsewhere (a render, an image
 * decoding) it would cover the whole missed stretch at once, and the page would
 * freeze and then lurch to catch up. Capping the step turns that into a brief
 * hold, and the glide carries on from exactly where it was.
 */
const MAX_STEP_MS = 1000 / 30;
let frame = 0;
let clock = 0;
let lastNow = 0;

function tick(now: number) {
  clock += lastNow ? Math.min(now - lastNow, MAX_STEP_MS) : 0;
  lastNow = now;
  for (const lenis of INSTANCES.values()) lenis.raf(clock);
  frame = requestAnimationFrame(tick);
}

function register(scroller: Window | HTMLElement, lenis: Lenis) {
  INSTANCES.set(scroller, lenis);
  if (frame) return;
  lastNow = 0;
  frame = requestAnimationFrame(tick);
}

function unregister(scroller: Window | HTMLElement, lenis: Lenis) {
  if (INSTANCES.get(scroller) === lenis) INSTANCES.delete(scroller);
  lenis.destroy();
  if (INSTANCES.size || !frame) return;
  cancelAnimationFrame(frame);
  frame = 0;
}

/** Things that own their scrolling and must never be driven by a parent. */
const OWN_SCROLL =
  ".reader-scroll, [data-lenis-prevent], [role='dialog'], [role='menu'], [role='listbox'], [data-radix-popper-content-wrapper], textarea, pre, select";

/**
 * Checked per node, not with `closest`: Lenis already calls this for every
 * element on the event's path, so looking up the tree here as well would redo
 * that walk for each of them.
 */
const ownsScroll = (node: HTMLElement) => node.matches(OWN_SCROLL);

function shouldSmooth(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  return !window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

/** The Lenis instance driving this scroller, if any. */
export function lenisFor(scroller: Window | HTMLElement): Lenis | undefined {
  return INSTANCES.get(scroller);
}

/** Start smooth scrolling for the window. Returns the teardown. */
export function startWindowSmoothScroll(): () => void {
  if (!shouldSmooth()) return () => {};
  const lenis = new Lenis({
    ...OPTIONS,
    anchors: { offset: -96 },
    // App panes scroll themselves, with their own instance.
    prevent: (node) => ownsScroll(node) || node.classList.contains("pane-scroll"),
  });
  register(window, lenis);
  return () => unregister(window, lenis);
}

/** Smooth scrolling for an inner scroll container, such as an app pane. */
export function useSmoothScroller(ref: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    const wrapper = ref.current;
    if (!wrapper || !enabled || !shouldSmooth()) return;
    const content = wrapper.firstElementChild instanceof HTMLElement ? wrapper.firstElementChild : wrapper;
    const lenis = new Lenis({
      ...OPTIONS,
      wrapper,
      content,
      eventsTarget: wrapper,
      prevent: ownsScroll,
    });
    register(wrapper, lenis);
    return () => unregister(wrapper, lenis);
  }, [ref, enabled]);
}
