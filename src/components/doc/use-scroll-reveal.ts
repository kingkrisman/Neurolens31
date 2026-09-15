import { useEffect, type RefObject } from "react";

/**
 * Reveal content as it scrolls into view.
 *
 * The motion itself is CSS (see `[data-reveal]` in styles.css): transitions run
 * off the main thread, so a page that is still loading fonts and images keeps
 * animating smoothly instead of dropping frames. This hook only decides *when*
 * each block has arrived.
 *
 * Content is never hidden before this runs. The hiding rule is scoped to
 * `html[data-motion="ready"]`, which is set here — so a reader with JavaScript
 * off, or a crawler, or a slow first paint, sees the whole page at rest rather
 * than a column of invisible sections waiting for a script.
 */
export function useScrollReveal(root: RefObject<HTMLElement | null>, key: unknown = null) {
  useEffect(() => {
    const node = root.current;
    if (!node) return;

    // Direct children of a `data-reveal-children` container reveal one by one,
    // so pages written before this existed animate without being rewritten.
    for (const parent of node.querySelectorAll<HTMLElement>("[data-reveal-children]")) {
      for (const child of Array.from(parent.children) as HTMLElement[]) {
        if (child.dataset.reveal === undefined) child.dataset.reveal = "";
      }
    }

    const items = Array.from(node.querySelectorAll<HTMLElement>("[data-reveal]"));
    document.documentElement.dataset.motion = "ready";

    if (typeof IntersectionObserver === "undefined") {
      for (const item of items) item.dataset.shown = "";
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        // Blocks that arrive in the same frame cascade instead of landing as one
        // slab. Capped, so a tall screen never makes the last block wait.
        let order = 0;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          el.style.setProperty("--reveal-delay", `${Math.min(order, 5) * 55}ms`);
          el.dataset.shown = "";
          observer.unobserve(el);
          order += 1;
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.06 },
    );

    for (const item of items) {
      if (item.dataset.shown === undefined) observer.observe(item);
    }
    return () => observer.disconnect();
  }, [root, key]);
}
