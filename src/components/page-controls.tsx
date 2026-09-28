import type { ComponentProps } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ReaderPager } from "@/components/pdf-pager";
import { usePageNumber, type PageTurner } from "@/lib/use-page-turner";

/**
 * The page controls, as small components that each follow the page number.
 *
 * They subscribe on their own so a turn re-renders them and nothing else. The
 * first version passed the page down from the reader, and every turn re-drew
 * every paragraph of the chapter to change one number in the dock.
 */

type Edges = {
  turner: PageTurner;
  /** A previous chapter or PDF page exists to turn back into. */
  hasPrevSection: boolean;
  /** A next chapter or PDF page exists to turn on into. */
  hasNextSection: boolean;
};

function useCanTurn({ turner, hasPrevSection, hasNextSection }: Edges) {
  const page = usePageNumber(turner);
  return {
    page,
    canPrev: page > 0 || hasPrevSection,
    canNext: page < turner.pages - 1 || hasNextSection,
  };
}

/**
 * The chapter control in the reader's dock, turning pages.
 *
 * In pages its arrows turn a screen and the count sits beside the chapter
 * name. There used to be a floating "‹ 3 of 12 ›" bar over the text as well;
 * it was one more thing on screen at all times and read as pressure.
 */
export function TurnPager({
  turner,
  hasPrevSection,
  hasNextSection,
  ...pager
}: Omit<ComponentProps<typeof ReaderPager>, "turn"> & Edges) {
  const { page, canPrev, canNext } = useCanTurn({ turner, hasPrevSection, hasNextSection });
  return (
    <ReaderPager
      {...pager}
      turn={{ page, pages: turner.pages, canPrev, canNext, prev: turner.prev, next: turner.next }}
    />
  );
}

/**
 * The page edges, as places to click, on wide screens.
 *
 * Only where there is real margin beside the text. On a phone the text runs
 * almost to the edge, and a tap zone there would swallow taps meant for words
 * — which is how definitions and the one-line band are moved. Phones turn by
 * swiping, or with the arrows in the dock.
 *
 * Hidden from assistive tech: the dock carries the same two actions, named,
 * and doubling them only adds noise.
 */
export function PageEdges({
  enabled,
  margin,
  ...edges
}: Edges & { enabled: boolean; margin: number }) {
  const { canPrev, canNext } = useCanTurn(edges);
  const width = Math.max(0, margin - 12);
  if (!enabled || width < 56) return null;
  return (
    <>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        onClick={edges.turner.prev}
        disabled={!canPrev}
        className="group absolute inset-y-20 left-0 flex items-center justify-start pl-4 disabled:pointer-events-none"
        style={{ width }}
      >
        <ChevronLeft
          size={22}
          className="text-muted opacity-0 transition-opacity duration-150 group-hover:opacity-60"
        />
      </button>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        onClick={edges.turner.next}
        disabled={!canNext}
        className="group absolute inset-y-20 right-0 flex items-center justify-end pr-4 disabled:pointer-events-none"
        style={{ width }}
      >
        <ChevronRight
          size={22}
          className="text-muted opacity-0 transition-opacity duration-150 group-hover:opacity-60"
        />
      </button>
    </>
  );
}
