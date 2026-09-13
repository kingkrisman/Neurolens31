import { useEffect, useState, type RefObject } from "react";

/** Preload about half a screen ahead of the scroll, not behind it. */
export const LAZY_ROOT_MARGIN = "0px 0px 50% 0px";

function alreadyInRange(node: Element, root: Element | null, extraBottom = 0.5) {
  const rootBox = (root ?? document.documentElement).getBoundingClientRect();
  const box = node.getBoundingClientRect();
  const ahead = rootBox.height * extraBottom;
  return box.top < rootBox.bottom + ahead;
}

export function useInView(
  ref: RefObject<Element | null>,
  {
    rootMargin = LAZY_ROOT_MARGIN,
    once = true,
    enabled = true,
  }: { rootMargin?: string; once?: boolean; enabled?: boolean } = {},
) {
  const [visible, setVisible] = useState(!enabled);

  useEffect(() => {
    if (!enabled) {
      setVisible(true);
      return;
    }
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const root = node.closest(".pane-scroll, .reader-scroll");
    const rootEl = root instanceof Element ? root : null;

    if (alreadyInRange(node, rootEl)) {
      setVisible(true);
      if (once) return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        const rootBox = entry.rootBounds ?? rootEl?.getBoundingClientRect();
        const entered = Boolean(entry.isIntersecting) || (rootBox != null && entry.boundingClientRect.top < rootBox.bottom);
        if (!entered) return;
        setVisible(true);
        if (once) io.disconnect();
      },
      {
        root: rootEl,
        rootMargin: once ? `10000px 0px ${rootMargin.split(" ")[2] ?? "50%"} 0px` : rootMargin,
        threshold: 0,
      },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [enabled, once, ref, rootMargin]);

  return visible;
}
