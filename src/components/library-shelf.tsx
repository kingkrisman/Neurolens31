import { useRef, useState, useEffect, type ReactNode } from "react";
import { BookOpen, ChevronLeft, ChevronRight } from "lucide-react";
import { Media } from "@/components/ui/surfaces";
import { cn } from "@/lib/utils";

/**
 * One poster in a shelf.
 *
 * Artwork first: the title and meta sit under a gradient and only resolve on
 * hover, so a row scans as a wall of covers rather than a wall of text. Touch
 * has no hover to reveal them with, so there they are simply always visible
 * (see `.nl-poster-meta`).
 */
export function Poster({
  title,
  meta,
  cover,
  badge,
  busy,
  onOpen,
}: {
  title: string;
  meta?: string;
  cover?: string | null;
  badge?: string;
  busy?: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={busy}
      aria-label={meta ? `${title} — ${meta}` : title}
      className={cn(
        "nl-poster group relative block overflow-hidden rounded-lg bg-surface text-left shadow-border",
        "focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-fg)_30%,transparent)]",
        "disabled:opacity-60",
      )}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-bg">
        {cover ? (
          <Media
            src={cover}
            alt=""
            width={400}
            height={600}
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-gradient-to-br from-fg/8 to-fg/2">
            <BookOpen size={26} className="text-subtle" aria-hidden />
          </div>
        )}

        {/* Scrim only under the text, so the top two-thirds of the artwork is
            never dimmed by a wash it does not need. */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/85 via-black/45 to-transparent"
        />

        {badge ? (
          <span className="absolute top-2 left-2 rounded-sm bg-black/55 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-white/90 uppercase backdrop-blur-[2px]">
            {badge}
          </span>
        ) : null}

        <div className="nl-poster-meta absolute inset-x-0 bottom-0 p-2.5 sm:p-3">
          <p className="line-clamp-2 text-xs leading-snug font-medium text-white sm:text-sm">
            {title}
          </p>
          {meta ? (
            <p className="mt-0.5 line-clamp-1 text-[11px] text-white/65">{meta}</p>
          ) : null}
          <span className="mt-1.5 inline-flex items-center gap-0.5 text-[11px] font-medium text-white/90">
            {busy ? "Opening" : "Read"}
            <ChevronRight size={11} aria-hidden />
          </span>
        </div>
      </div>
    </button>
  );
}

/**
 * A horizontally scrolling row of posters.
 *
 * Arrows are pointer-only affordances — a touch device scrolls the row
 * directly, and rendering buttons it does not need would just cover two posters.
 * They hide at the ends rather than sitting there disabled, so the control only
 * exists while it can actually do something.
 */
export function Shelf({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const read = () => {
      const max = node.scrollWidth - node.clientWidth;
      setEdges({ start: node.scrollLeft > 8, end: node.scrollLeft < max - 8 });
    };
    read();
    node.addEventListener("scroll", read, { passive: true });
    // The row can also change width without scrolling — a resize, or images
    // arriving and changing the content width.
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => {
      node.removeEventListener("scroll", read);
      observer.disconnect();
    };
  }, []);

  function nudge(dir: 1 | -1) {
    const node = ref.current;
    if (!node) return;
    node.scrollBy({ left: dir * node.clientWidth * 0.85, behavior: "smooth" });
  }

  return (
    <section className="relative">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium tracking-tight sm:text-base">{title}</h2>
        {action}
      </div>

      <div className="relative">
        <div ref={ref} className="nl-shelf">
          {children}
        </div>

        {([-1, 1] as const).map((dir) => {
          const visible = dir === -1 ? edges.start : edges.end;
          return (
            <button
              key={dir}
              type="button"
              tabIndex={-1}
              aria-hidden
              onClick={() => nudge(dir)}
              className={cn(
                "absolute top-1/2 z-30 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full",
                "bg-surface/90 text-fg shadow-float backdrop-blur-sm transition-opacity duration-[250ms]",
                "hover:bg-surface md:flex",
                dir === -1 ? "-left-2" : "-right-2",
                visible ? "opacity-100" : "pointer-events-none opacity-0",
              )}
            >
              {dir === -1 ? (
                <ChevronLeft size={17} aria-hidden />
              ) : (
                <ChevronRight size={17} aria-hidden />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
