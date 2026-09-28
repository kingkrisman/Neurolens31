import { useEffect } from "react";
import { toast } from "sonner";
import { onSettleSuggestion } from "@/lib/comfort";

/**
 * The one sentence said when a reader flips between modes several times in a
 * row. See `lib/comfort.ts` for why, and for what it deliberately does not
 * claim. A toast rather than a dialog: it must never stand between somebody
 * and the page they chose.
 */
export function ComfortNudge() {
  useEffect(
    () =>
      onSettleSuggestion(() => {
        toast("Give this layout a few minutes", {
          description:
            "A new layout takes a little getting used to. Try a page or two before changing again — and if reading starts to feel like effort, a short break helps more than another switch.",
          duration: 14_000,
        });
      }),
    [],
  );
  return null;
}
