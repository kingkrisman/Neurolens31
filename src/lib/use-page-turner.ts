import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
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

export interface PageTurner {
  page: number;
  pages: number;
  /** Styles that turn the article into pages; undefined in scroll layout. */
  articleStyle: CSSProperties | undefined;
  /** Side margin beside the text, for deciding whether edges can take taps. */
  margin: number;
  /** Full width of every page laid side by side, for the ink surface. */
  span: number;
  next: () => void;
  prev: () => void;
  goTo: (page: number, smooth?: boolean) => void;
  /** Show the page an element is on. */
  reveal: (el: Element, smooth?: boolean) => void;
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
  const [page, setPage] = useState(0);
  const widthRef = useRef(0);
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
    pageRef.current = next;
    setPage(next);
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

  /** The first line on a page, in the layout as it is now. */
  const anchorFor = useCallback(
    (target: number): string | null => {
      const article = articleRef.current;
      if (!article) return null;
      for (const line of article.querySelectorAll<HTMLElement>(".reading-line")) {
        if (pageOfElement(line) === target) return line.id;
      }
      return null;
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
    (target: number, smooth = true, reanchor = true) => {
      const node = scrollRef.current;
      const step = widthRef.current;
      if (!node || step <= 0) return;
      const last = Math.max(0, countNow() - 1);
      const to = Math.min(last, Math.max(0, target));
      if (reanchor) anchorRef.current = anchorFor(to);
      turnedAt.current = performance.now();
      setCurrent(to);
      node.scrollTo({ left: to * step, behavior: smooth && !reduceMotion ? "smooth" : "auto" });
    },
    [scrollRef, countNow, setCurrent, reduceMotion, anchorFor],
  );

  const reveal = useCallback(
    (el: Element, smooth = true) => {
      const target = pageOfElement(el);
      if (target != null && target !== pageRef.current) goTo(target, smooth);
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
        goTo(target, false);
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
      pageRef.current = 0;
      setPage(0);
      const node = scrollRef.current;
      if (node) node.scrollLeft = 0;
      return;
    }
    if (landingRef.current != null) return;
    const id = anchorRef.current;
    const line = id ? document.getElementById(id) : null;
    if (line) {
      const target = pageOfElement(line);
      if (target != null) goTo(target, false, false);
    } else {
      goTo(pageRef.current, false);
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
        goTo(at, !aligned);
      }, 140);
    };
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      node.removeEventListener("scroll", onScroll);
      window.clearTimeout(settle);
    };
  }, [on, scrollRef, goTo]);

  // Swipes. Touch only: a mouse drag is how text gets selected to highlight,
  // and a pen draws. The page follows the finger one-to-one and springs to the
  // nearest page on release — a turn that lags the finger reads as broken.
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

    let start: { x: number; y: number; left: number; id: number } | null = null;
    let dragging = false;
    let samples: Array<{ x: number; t: number }> = [];
    let swallowClickUntil = 0;

    const rubber = (over: number) => Math.min(widthRef.current * 0.2, over * RUBBER);

    const down = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || !event.isPrimary || isPinchZoomed()) return;
      start = { x: event.clientX, y: event.clientY, left: node.scrollLeft, id: event.pointerId };
      dragging = false;
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
        if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
        dragging = true;
        draggingRef.current = true;
        try {
          node.setPointerCapture(event.pointerId);
        } catch {
          /* not capturable: the drag still works while the finger stays on */
        }
      }
      samples = [...samples.slice(-4), { x: event.clientX, t: event.timeStamp }];
      const max = (pagesRef.current - 1) * widthRef.current;
      let left = start.left - dx;
      if (left < 0) left = -rubber(-left);
      else if (left > max) left = max + rubber(left - max);
      node.scrollLeft = left;
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
        goTo(from);
        edges.current.onPastEnd();
      } else if (target < 0) {
        goTo(from);
        edges.current.onPastStart();
      } else {
        goTo(target);
      }
    };

    const cancel = (event: PointerEvent) => {
      if (!start || event.pointerId !== start.id) return;
      start = null;
      if (dragging) goTo(pageRef.current);
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
      node.style.touchAction = "";
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
      node.removeEventListener("pointercancel", cancel);
      node.removeEventListener("click", click, true);
    };
  }, [on, scrollRef, goTo]);

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
      // Room under the text for the page footer (44px, 8px off the bottom).
      // The dock sits below the reading area, not over it, so nothing else
      // needs clearing — and every line of padding is a line less per page.
      paddingBottom: "4.25rem",
      columnWidth: `${metrics.column}px`,
      columnGap: `${metrics.gap}px`,
      columnFill: "auto",
    };
  }, [metrics, width]);

  return {
    page,
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
