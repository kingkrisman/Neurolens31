import { useEffect, type RefObject } from "react";

/**
 * Close a panel when the pointer goes down outside it.
 *
 * Radix handles this for its own popovers, but two surfaces here are not Radix:
 * the companion's panel, and the reading options sheet, which is deliberately
 * non-modal so the page stays scrollable and legible while settings change.
 * Non-modal means there is no overlay to catch the click, so the dismissal has
 * to be wired by hand — and without it those two stayed open until the trigger
 * was pressed again, which is not what pressing somewhere else means.
 *
 * `pointerdown`, not `click`: a click only lands after the button comes back up,
 * which on a drag or a text selection that started inside and ended outside
 * arrives at the wrong moment or not at all.
 *
 * Scrolling is deliberately not a dismissal. The whole reason the sheet is
 * non-modal is to let someone read while adjusting, and taking it away the
 * moment they move the page would defeat what it is for.
 */
export function useDismiss(
  refs: RefObject<Element | null> | RefObject<Element | null>[],
  open: boolean,
  onDismiss: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const list = Array.isArray(refs) ? refs : [refs];

    const onDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      // Inside any of the panels this dismissal protects — including the
      // trigger, so pressing it again toggles rather than closing and
      // reopening in the same gesture.
      for (const ref of list) {
        const node = ref.current;
        if (node && node.contains(target)) return;
      }
      // Portalled children — a dropdown opened from inside the panel renders
      // elsewhere in the DOM and is not contained by it, but pressing it is
      // still "inside" as far as the reader is concerned.
      if (target instanceof Element && target.closest("[data-radix-popper-content-wrapper],[role=dialog],[role=menu],[role=listbox]")) {
        for (const ref of list) {
          if (ref.current && target.closest("[role=dialog]") === ref.current) return;
        }
      }
      onDismiss();
    };

    // Captured, so a panel that stops propagation on its own container still
    // lets the check run first.
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [refs, open, onDismiss]);
}
