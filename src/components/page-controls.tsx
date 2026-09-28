import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Turning controls for pages: a small footer on every screen, and — where
 * there is margin to spare — the page edges themselves.
 *
 * The footer is always there because swiping is invisible: nobody learns a
 * gesture from a blank page, and a mouse has no swipe at all. Edges only take
 * taps when they are real margin. On a phone the text runs almost to the
 * edge, and an edge zone there would swallow taps meant for words — which is
 * how definitions and the one-line band are moved.
 */
export function PageControls({
  page,
  pages,
  canGoBack,
  canGoOn,
  margin,
  edges,
  onPrev,
  onNext,
}: {
  page: number;
  pages: number;
  /** False only on the very first page of the book. */
  canGoBack: boolean;
  /** False only on the very last page of the book. */
  canGoOn: boolean;
  margin: number;
  edges: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const edgeWidth = Math.max(0, margin - 12);
  return (
    <>
      {edges && edgeWidth >= 56 ? (
        <>
          {/* Hidden from assistive tech: the footer carries the same two
              actions with names, and doubling them only adds noise. */}
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            onClick={onPrev}
            disabled={!canGoBack}
            className="page-edge group absolute inset-y-24 left-0 flex items-center justify-start pl-4 disabled:pointer-events-none"
            style={{ width: edgeWidth }}
          >
            <ChevronLeft
              size={22}
              className="text-muted opacity-0 transition-opacity duration-150 group-hover:opacity-70"
            />
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            onClick={onNext}
            disabled={!canGoOn}
            className="page-edge group absolute inset-y-24 right-0 flex items-center justify-end pr-4 disabled:pointer-events-none"
            style={{ width: edgeWidth }}
          >
            <ChevronRight
              size={22}
              className="text-muted opacity-0 transition-opacity duration-150 group-hover:opacity-70"
            />
          </button>
        </>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
        <nav
          aria-label="Pages"
          className="pointer-events-auto flex items-center gap-0.5 rounded-full bg-surface/90 p-0.5 text-xs text-muted tabular-nums shadow-border backdrop-blur"
        >
          <button
            type="button"
            onClick={onPrev}
            disabled={!canGoBack}
            aria-label="Previous page"
            className={cn(
              "grid size-11 place-items-center rounded-full sm:size-9",
              "transition-[background-color,transform] duration-150 ease-[var(--ease-out)] hover:bg-fg/6 active:scale-[0.94]",
              "disabled:opacity-35 disabled:hover:bg-transparent",
            )}
          >
            <ChevronLeft size={16} aria-hidden />
          </button>
          <span className="min-w-16 px-1 text-center">
            {page + 1} of {pages}
          </span>
          <button
            type="button"
            onClick={onNext}
            disabled={!canGoOn}
            aria-label="Next page"
            className={cn(
              "grid size-11 place-items-center rounded-full sm:size-9",
              "transition-[background-color,transform] duration-150 ease-[var(--ease-out)] hover:bg-fg/6 active:scale-[0.94]",
              "disabled:opacity-35 disabled:hover:bg-transparent",
            )}
          >
            <ChevronRight size={16} aria-hidden />
          </button>
        </nav>
      </div>
    </>
  );
}
