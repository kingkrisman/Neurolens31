import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Side-panel scroller: native bars stay hidden. A thin overlay rail and
 * top/bottom fades show there is more, without stealing width from labels.
 */
export function PanelScroller({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({ top: false, bottom: false, thumb: 0, thumbH: 28, overflow: false });

  const measure = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    const { scrollTop, scrollHeight, clientHeight } = node;
    const overflow = scrollHeight - clientHeight;
    const track = Math.max(clientHeight - 16, 32);
    const ratio = scrollHeight > 0 ? clientHeight / scrollHeight : 1;
    const thumbH = Math.min(track, Math.max(28, Math.round(ratio * track)));
    const maxThumb = Math.max(0, track - thumbH);
    const thumb = overflow > 1 ? (scrollTop / overflow) * maxThumb : 0;
    setState({
      top: scrollTop > 6,
      bottom: overflow > 1 && scrollTop < overflow - 6,
      thumb,
      thumbH,
      overflow: overflow > 1,
    });
  }, []);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    const inner = node.firstElementChild;
    if (inner) observer.observe(inner);
    return () => observer.disconnect();
  }, [measure]);

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={ref}
        onScroll={measure}
        className={cn("controls-scroll h-full min-h-0 overflow-y-auto overscroll-contain px-4 py-4", className)}
      >
        {children}
      </div>
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-10 h-7 bg-gradient-to-b from-surface to-transparent transition-opacity duration-[150ms] ease-[var(--ease-out)]",
          state.top ? "opacity-100" : "opacity-0",
        )}
        aria-hidden
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 z-10 h-9 bg-gradient-to-t from-surface to-transparent transition-opacity duration-[150ms] ease-[var(--ease-out)]",
          state.bottom ? "opacity-100" : "opacity-0",
        )}
        aria-hidden
      />
      {state.overflow ? (
        <div className="pointer-events-none absolute top-2 right-1 bottom-2 z-10 w-1.5 rounded-full bg-fg/15" aria-hidden>
          <div
            className="absolute inset-x-0 rounded-full bg-fg/50"
            style={{
              height: state.thumbH,
              transform: `translateY(${state.thumb}px)`,
              transition: "transform 80ms linear",
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
