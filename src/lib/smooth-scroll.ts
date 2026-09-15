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
 *  - Touch. Phones already have real momentum scrolling tuned by the OS; faking
 *    it on top feels worse, not better.
 *  - The reader. Reading position, auto-scroll and drawing all depend on scroll
 *    doing exactly what the finger or wheel did.
 *  - Anything with its own scrolling — dialogs, menus, text boxes, code — so a
 *    wheel inside them scrolls them, not the page behind.
 *  - Reduced motion, where smoothing is switched off entirely.
 */

const INSTANCES = new Map<Window | HTMLElement, Lenis>();

const OPTIONS = {
  lerp: 0.085,
  wheelMultiplier: 0.9,
  smoothWheel: true,
  syncTouch: false,
  autoRaf: true,
  autoResize: true,
} as const;

/** Things that own their scrolling and must never be driven by a parent. */
const OWN_SCROLL =
  ".reader-scroll, [data-lenis-prevent], [role='dialog'], [role='menu'], [role='listbox'], [data-radix-popper-content-wrapper], textarea, pre, select";

function scrollsItself(node: HTMLElement, boundary: Element | null): boolean {
  let el: HTMLElement | null = node;
  while (el && el !== boundary && el !== document.body) {
    const style = getComputedStyle(el);
    if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1) return true;
    el = el.parentElement;
  }
  return false;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The Lenis instance driving this scroller, if any. */
export function lenisFor(scroller: Window | HTMLElement): Lenis | undefined {
  return INSTANCES.get(scroller);
}

/** Start smooth scrolling for the window. Returns the teardown. */
export function startWindowSmoothScroll(): () => void {
  if (prefersReducedMotion()) return () => {};
  const lenis = new Lenis({
    ...OPTIONS,
    anchors: { offset: -96 },
    prevent: (node) =>
      // App panes scroll themselves, with their own instance.
      Boolean(node.closest(`${OWN_SCROLL}, .pane-scroll`)) || scrollsItself(node, null),
  });
  INSTANCES.set(window, lenis);
  return () => {
    INSTANCES.delete(window);
    lenis.destroy();
  };
}

/** Smooth scrolling for an inner scroll container, such as an app pane. */
export function useSmoothScroller(ref: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    const wrapper = ref.current;
    if (!wrapper || !enabled || prefersReducedMotion()) return;
    const content = wrapper.firstElementChild instanceof HTMLElement ? wrapper.firstElementChild : wrapper;
    const lenis = new Lenis({
      ...OPTIONS,
      wrapper,
      content,
      eventsTarget: wrapper,
      prevent: (node) => Boolean(node.closest(OWN_SCROLL)) || scrollsItself(node, wrapper),
    });
    INSTANCES.set(wrapper, lenis);
    return () => {
      INSTANCES.delete(wrapper);
      lenis.destroy();
    };
  }, [ref, enabled]);
}
