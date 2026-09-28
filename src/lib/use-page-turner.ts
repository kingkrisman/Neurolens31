import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type RefObject,
} from "react";
import { countPages, pageMetrics, pageOf, swipeTarget } from "./page-layout";
import { isPinchZoomed } from "./viewport-zoom";

/**
 * Pages for the reader: one screen-wide CSS column per page, turned by moving
 * the scroller one screen sideways. The geometry and rules live in
 * `page-layout.ts`; this is the part that touches the DOM.
 *
 * Every reading feature already listens to the scroller — line following, the
 * reading tracker, the dwell observer — so turning a page *is* a scroll, and
 * they carry on working without knowing pages exist.
 */

/** The scroll view's measure (`max-w-2xl`), so both layouts set type alike. */
const MAX_TEXT_PX = 672;

/** Past this share of the page a released drag springs on, not back. */
const RUBBER = 0.35;

export type Landing = "start" | "end" | number;

/**
 * The current page, for a component that shows it. Only that component
 * re-renders on a turn — see `PageTurner.getPage`.
 */
export function usePageNumber(turner: Pick<PageTurner, "getPage" | "subscribe">): number {
  return useSyncExternalStore(turner.subscribe, turner.getPage, () => 0);
}

export interface PageTurner {
  /**
   * The current page, read on demand. Deliberately not a value that
   * re-renders anything: the first version kept it in React state, and every
   * turn re-rendered the whole reader — every paragraph of the chapter — which
   * was most of why turning felt heavy. Components that show the page number
   * subscribe with `usePageNumber`, and only they update.
   */
  getPage: () => number;
  subscribe: (listener: () => void) => () => void;
  pages: number;
  /** Styles that turn the article into pages; undefined in scroll layout. */
  articleStyle: CSSProperties | undefined;
  /** Side margin beside the text, for deciding whether edges can take taps. */
  margin: number;
  /** Full width of every page laid side by side, for the ink surface. */
  span: number;
  next: () => void;
  prev: () => void;
  goTo: (page: number) => void;
  /** Show the page an element is on. */
  reveal: (el: Element) => void;
  /** Where to land once the next section has laid out. */
  land: (where: Landing) => void;
}

export function usePageTurner({
  on,
  scrollRef,
  articleRef,
  layoutKey,
  sectionKey,
  reduceMotion,
  onPastEnd,
  onPastStart,
}: {
  on: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  articleRef: RefObject<HTMLElement | null>;
  /** Anything that re-flows the text: type settings, width, the text. */
  layoutKey: string;
  /** Which chapter or PDF page. Line ids restart in each, so a new one must
   *  never be "restored" to the old one's anchor. */
  sectionKey: string;
  reduceMotion: boolean;
  onPastEnd: () => void;
  onPastStart: () => void;
}): PageTurner {
  const [width, setWidth] = useState(0);
  const [pages, setPages] = useState(1);
  const widthRef = useRef(0);
  const listeners = useRef(new Set<() => void>());
  const pagesRef = useRef(1);
  const pageRef = useRef(0);
  /** The line at the top of the current page — what a re-flow keeps in view. */
  const anchorRef = useRef<string | null>(null);
  const landingRef = useRef<Landing | null>(null);
  /** A finger is on the page; settling must not snap it out from under it. */
  const draggingRef = useRef(false);
  /**
   * When this code last started a turn. The settle check below corrects
   * scrolls this code did not make, and a timer left over from one turn used
   * to fire just after the next began — see the page still where it was, and
   * snap it back. A turn in flight is left to finish.
   */
  const turnedAt = useRef(0);
  const sectionRef = useRef(sectionKey);
  const edges = useRef({ onPastEnd, onPastStart });
  edges.current = { onPastEnd, onPastStart };

  // The pane's content width, in whole pixels. Whole, and applied back to the
  // article as its width: a fractional column drifts a little further out of
  // line on every page, and by page forty the text sits half off the screen.
  useLayoutEffect(() => {
    if (!on) return;
    const node = scrollRef.current;
    if (!node) return;
    const measure = () => {
      const style = getComputedStyle(node);
      const inner =
        node.clientWidth -
        parseFloat(style.paddingLeft || "0") -
        parseFloat(style.paddingRight || "0");
      const next = Math.max(0, Math.floor(inner));
      widthRef.current = next;
      setWidth(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [on, scrollRef]);

  const metrics = useMemo(() => {
    if (!on || width <= 0) return null;
    return pageMetrics(width, MAX_TEXT_PX, width >= 640 ? 32 : 20);
  }, [on, width]);

  const countNow = useCallback(() => {
    const article = articleRef.current;
    const step = widthRef.current;
    if (!article || step <= 0) return pagesRef.current;
    const next = countPages(article.scrollWidth, step);
    pagesRef.current = next;
    setPages(next);
    return next;
  }, [articleRef]);

  const setCurrent = useCallback((next: number) => {
    if (pageRef.current === next) return;
    pageRef.current = next;
    for (const listener of listeners.current) listener();
  }, []);

  const getPage = useCallback(() => pageRef.current, []);
  const subscribe = useCallback((listener: () => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const pageOfElement = useCallback(
    (el: Element): number | null => {
      const article = articleRef.current;
      const step = widthRef.current;
      if (!article || step <= 0) return null;
      const offset = el.getBoundingClientRect().left - article.getBoundingClientRect().left;
      return pageOf(offset, step);
    },
    [articleRef],
  );

  /**
   * The first line on a page, in the layout as it is now.
   *
   * A binary search: text flows through the columns in document order, so
   * lines' pages never go down. The first version walked every line from the
   * top and measured each one, which on page thirty of a long chapter was
   * hundreds of layout reads per turn.
   */
  const anchorFor = useCallback(
    (target: number): string | null => {
      const article = articleRef.current;
      if (!article) return null;
      const lines = article.querySelectorAll<HTMLElement>(".reading-line");
      let lo = 0;
      let hi = lines.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        const at = pageOfElement(lines[mid]!) ?? 0;
        if (at < target) lo = mid + 1;
        else hi = mid;
      }
      const found = lines[lo];
      return found && pageOfElement(found) === target ? found.id : null;
    },
    [articleRef, pageOfElement],
  );

  /**
   * Go to a page.
   *
   * The anchor — the line a re-flow keeps on screen — is taken here, when the
   * turn is decided, from the layout the reader is looking at. It used to be
   * taken once scrolling had settled, and a font change in the moment between
   * found the previous page's line and jumped two pages. A re-flow's own
   * correction passes `reanchor: false`: re-anchoring there would move the
   * anchor to the top of the new page, and repeated size changes would walk
   * the reader backwards through the book.
   */
  const goTo = useCallback(
    (target: number, reanchor = true) => {
      const node = scrollRef.current;
      const step = widthRef.current;
      if (!node || step <= 0) return;
      const last = Math.max(0, countNow() - 1);
      const to = Math.min(last, Math.max(0, target));
      if (reanchor) anchorRef.current = anchorFor(to);
      turnedAt.current = performance.now();
      setCurrent(to);
      // Instant, always. A page turn happens hundreds of times a sitting, and
      // the first version slid each one across the screen: motion the reader
      // had to sit through on every page, and it stuttered. Swipes get their
      // movement from the finger (below), not from here.
      node.scrollTo({ left: to * step, behavior: "instant" });
    },
    [scrollRef, countNow, setCurrent, anchorFor],
  );

  const reveal = useCallback(
    (el: Element) => {
      const target = pageOfElement(el);
      if (target != null && target !== pageRef.current) goTo(target);
    },
    [pageOfElement, goTo],
  );

  const next = useCallback(() => {
    if (pageRef.current < countNow() - 1) goTo(pageRef.current + 1);
    else edges.current.onPastEnd();
  }, [countNow, goTo]);

  const prev = useCallback(() => {
    if (pageRef.current > 0) goTo(pageRef.current - 1);
    else edges.current.onPastStart();
  }, [goTo]);

  // Land where the reader belongs once a new section has a width to measure.
  // A cold open lays out over a few frames, so this waits for the columns
  // rather than measuring nothing and landing on page one.
  const land = useCallback(
    (where: Landing) => {
      landingRef.current = where;
      let frames = 0;
      const attempt = () => {
        if (landingRef.current !== where) return;
        const article = articleRef.current;
        if (!article || widthRef.current <= 0 || article.scrollWidth <= 0) {
          if (frames++ < 40) requestAnimationFrame(attempt);
          return;
        }
        const total = countNow();
        const target =
          where === "start"
            ? 0
            : where === "end"
              ? total - 1
              : Math.round(Math.min(1, Math.max(0, where)) * (total - 1));
        landingRef.current = null;
        goTo(target);
      };
      requestAnimationFrame(attempt);
    },
    [articleRef, countNow, goTo],
  );

  // Font, size, spacing or width changed: pages re-flow, so find the line
  // that was at the top of the page and go to wherever it is now.
  useLayoutEffect(() => {
    if (!on || !metrics) return;
    countNow();
    if (sectionRef.current !== sectionKey) {
      // A different chapter: start it at the top until told where to land.
      sectionRef.current = sectionKey;
      anchorRef.current = null;
      setCurrent(0);
      const node = scrollRef.current;
      if (node) node.scrollLeft = 0;
      return;
    }
    if (landingRef.current != null) return;
    const id = anchorRef.current;
    const line = id ? document.getElementById(id) : null;
    if (line) {
      const target = pageOfElement(line);
      if (target != null) goTo(target, false);
    } else {
      goTo(pageRef.current);
    }
    // Keyed on the layout, not on every callback identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, metrics, layoutKey, sectionKey]);

  // Follow the page if the scroller settles somewhere this code did not send
  // it — the browser bringing a focused element into view, say. Turns made
  // here already set the page and its anchor.
  useEffect(() => {
    if (!on) return;
    const node = scrollRef.current;
    if (!node) return;
    let settle = 0;
    const onScroll = () => {
      window.clearTimeout(settle);
      settle = window.setTimeout(() => {
        const step = widthRef.current;
        if (step <= 0) return;
        if (draggingRef.current) return;
        if (performance.now() - turnedAt.current < 900) return;
        const at = Math.round(node.scrollLeft / step);
        const aligned = Math.abs(node.scrollLeft - at * step) <= 1;
        if (at === pageRef.current && aligned) return;
        // Somewhere between pages: finish the turn to the nearest one, so
        // the reader never sits looking at half of two pages.
        goTo(at);
      }, 140);
    };
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      node.removeEventListener("scroll", onScroll);
      window.clearTimeout(settle);
    };
  }, [on, scrollRef, goTo]);

  // Swipes. Touch only: a mouse drag is how text gets selected to highlight,
  // and a pen draws.
  //
  // The page follows the finger by moving the article with a transform, not
  // by scrolling. The first version scrolled, and every pixel of movement then
  // ran the reader's scroll handlers — line following measures every line of
  // the chapter — so the page stuttered under the finger. A transform is
  // composited: nothing else runs until the finger lifts, and then the turn is
  // committed as one instant scroll.
  useEffect(() => {
    if (!on) return;
    const node = scrollRef.current;
    if (!node) return;

    // Horizontal moves must reach this code rather than the browser, but a
    // reader who has pinched in needs the browser to pan the zoomed view.
    const syncTouchAction = () => {
      node.style.touchAction = isPinchZoomed() ? "auto" : "pan-y pinch-zoom";
    };
    syncTouchAction();
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", syncTouchAction);

    let start: { x: number; y: number; id: number } | null = null;
    let dragging = false;
    let offset = 0;
    let samples: Array<{ x: number; t: number }> = [];
    let swallowClickUntil = 0;
    let settling: Animation | null = null;

    const rubber = (over: number) => Math.min(widthRef.current * 0.2, over * RUBBER);

    const paint = (x: number) => {
      const article = articleRef.current;
      if (article) article.style.transform = x ? `translate3d(${x}px, 0, 0)` : "";
    };

    /** Carry the page from where the finger left it to `to`, then commit. */
    const settle = (to: number, commit: () => void) => {
      const article = articleRef.current;
      if (!article || reduceMotion || Math.abs(to - offset) < 1) {
        commit();
        paint(0);
        article?.style.removeProperty("will-change");
        return;
      }
      // Short and ease-out: the finger already did most of the moving, so
      // this only finishes a gesture the reader started.
      const animation = article.animate(
        [
          { transform: `translate3d(${offset}px, 0, 0)` },
          { transform: `translate3d(${to}px, 0, 0)` },
        ],
        { duration: 170, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
      );
      settling = animation;
      paint(to);
      animation.onfinish = () => {
        settling = null;
        // Same task, so the browser paints the new page and the reset
        // transform together — no frame of the old page flashes between.
        commit();
        paint(0);
        article.style.removeProperty("will-change");
      };
    };

    const down = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || !event.isPrimary || isPinchZoomed()) return;
      // A new touch during a settle finishes the previous turn first.
      settling?.finish();
      start = { x: event.clientX, y: event.clientY, id: event.pointerId };
      dragging = false;
      offset = 0;
      samples = [{ x: event.clientX, t: event.timeStamp }];
    };

    const move = (event: PointerEvent) => {
      if (!start || event.pointerId !== start.id) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (!dragging) {
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
          start = null;
          return;
        }
        // Forgiving on purpose: a natural swipe is rarely level, and one that
        // had to be level to count read as the page ignoring the reader.
        if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
        dragging = true;
        draggingRef.current = true;
        articleRef.current?.style.setProperty("will-change", "transform");
        try {
          node.setPointerCapture(event.pointerId);
        } catch {
          /* not capturable: the drag still works while the finger stays on */
        }
      }
      samples = [...samples.slice(-4), { x: event.clientX, t: event.timeStamp }];
      const atStart = pageRef.current === 0;
      const atEnd = pageRef.current >= pagesRef.current - 1;
      // Past the first or last page of a chapter the page resists; a full
      // swipe there still crosses into the next chapter on release.
      offset = (dx > 0 && atStart) || (dx < 0 && atEnd) ? Math.sign(dx) * rubber(Math.abs(dx)) : dx;
      paint(offset);
    };

    const up = (event: PointerEvent) => {
      if (!start || event.pointerId !== start.id) return;
      const began = start;
      start = null;
      if (!dragging) return;
      dragging = false;
      draggingRef.current = false;
      swallowClickUntil = event.timeStamp + 400;
      const dx = event.clientX - began.x;
      const first = samples[0]!;
      const last = samples[samples.length - 1]!;
      const velocity = (last.x - first.x) / Math.max(1, last.t - first.t);
      const from = pageRef.current;
      const target = swipeTarget(from, dx, velocity, widthRef.current);
      if (target >= pagesRef.current) {
        paint(0);
        edges.current.onPastEnd();
      } else if (target < 0) {
        paint(0);
        edges.current.onPastStart();
      } else if (target === from) {
        settle(0, () => {});
      } else {
        settle(-(target - from) * widthRef.current, () => goTo(target));
      }
    };

    const cancel = (event: PointerEvent) => {
      if (!start || event.pointerId !== start.id) return;
      start = null;
      if (dragging) settle(0, () => {});
      dragging = false;
      draggingRef.current = false;
    };

    // The finger lifting after a swipe must not also tap the word under it —
    // that would open a definition at the end of every page turn.
    const click = (event: MouseEvent) => {
      if (event.timeStamp < swallowClickUntil) {
        event.stopPropagation();
        event.preventDefault();
      }
    };

    node.addEventListener("pointerdown", down);
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", up);
    node.addEventListener("pointercancel", cancel);
    node.addEventListener("click", click, true);
    return () => {
      viewport?.removeEventListener("resize", syncTouchAction);
      settling?.cancel();
      paint(0);
      node.style.touchAction = "";
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
      node.removeEventListener("pointercancel", cancel);
      node.removeEventListener("click", click, true);
    };
  }, [on, scrollRef, articleRef, goTo, reduceMotion]);

  // Leaving pages: put the scroller back where scrolling expects it.
  useEffect(() => {
    if (on) return;
    const node = scrollRef.current;
    if (node) node.scrollLeft = 0;
    pageRef.current = 0;
    anchorRef.current = null;
  }, [on, scrollRef]);

  const articleStyle = useMemo<CSSProperties | undefined>(() => {
    if (!metrics) return undefined;
    return {
      width: `${width}px`,
      maxWidth: "none",
      height: "100%",
      marginLeft: 0,
      marginRight: 0,
      boxSizing: "border-box",
      paddingLeft: `${metrics.pad}px`,
      paddingRight: `${metrics.pad}px`,
      // Just a breath under the last line. The page controls live in the
      // reader's dock, below the reading area, so nothing here needs clearing
      // — and every line of padding is a line less on every page.
      paddingBottom: "1.25rem",
      columnWidth: `${metrics.column}px`,
      columnGap: `${metrics.gap}px`,
      columnFill: "auto",
    };
  }, [metrics, width]);

  return {
    getPage,
    subscribe,
    pages,
    articleStyle,
    margin: metrics?.pad ?? 0,
    span: Math.max(width, pages * width),
    next,
    prev,
    goTo,
    reveal,
    land,
  };
}
