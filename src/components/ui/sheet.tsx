import { Drawer } from "vaul";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useIsMobile } from "@/lib/media-query";
import { cn } from "@/lib/utils";
import { useDismiss } from "@/lib/use-dismiss";
import { impact } from "@/lib/haptics";

/**
 * Resting height, and the height when the reader wants to browse.
 *
 * The panel opens at the low stop. Every control in it — contrast, size,
 * spacing, bionic strength — is judged against the text, so the default has to
 * leave a real paragraph on screen rather than the two lines a taller sheet
 * left behind. Dragging up is for hunting through modes; you come back down to
 * see what the change actually did.
 */
const SNAP_LOW = 0.42;
const SNAP_HIGH = 0.9;

export function Sheet({
  open,
  onOpenChange,
  children,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  title: string;
}) {
  // A left drawer on a phone puts the controls under the hand that is holding
  // it and steals the full width anyway. Below `sm` this becomes a bottom
  // sheet: same content, reachable by thumb, and it keeps the page visible
  // behind it so changes stay connected to the text they affect.
  const mobile = useIsMobile();
  const panelRef = useRef<HTMLDivElement>(null);

  // Non-modal means Vaul lays down no overlay, so nothing was catching a press
  // on the page and the sheet stayed open until its trigger was pressed again.
  useDismiss(panelRef, open, useCallback(() => onOpenChange(false), [onOpenChange]));

  /**
   * A panel arriving and leaving both register.
   *
   * Medium on the way in and light on the way out, deliberately asymmetric:
   * something appearing in front of you is a larger event than the same thing
   * getting out of the way, and matching them makes dismissal feel heavier than
   * it is.
   */
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open === wasOpen.current) return;
    wasOpen.current = open;
    impact(open ? "medium" : "light");
  }, [open]);
  const [snap, setSnap] = useState<number | string | null>(SNAP_LOW);

  // Reopening should start low again, not wherever it was last dragged.
  useEffect(() => {
    if (open) setSnap(SNAP_LOW);
  }, [open]);

  // Escape closes. `modal={false}` means Vaul is no longer trapping keys for
  // us, so this panel has to handle its own dismissal.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  return (
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      direction={mobile ? "bottom" : "left"}
      shouldScaleBackground={false}
      /**
       * Non-modal on purpose. These are live formatting controls, and almost
       * every one of them — contrast, theme, size, spacing, bionic strength —
       * can only be judged against the actual text. A modal drawer locked
       * scrolling, trapped focus, and laid a scrim over the page, so the reader
       * was changing type settings against a dimmed sample they could not
       * scroll. Non-modal keeps the text live, legible, and scrollable while
       * the panel is open.
       */
      modal={false}
      dismissible
      {...(mobile
        ? {
            snapPoints: [SNAP_LOW, SNAP_HIGH],
            activeSnapPoint: snap,
            setActiveSnapPoint: setSnap,
          }
        : {})}
    >
      <Drawer.Portal>
        {/* No Drawer.Overlay. A scrim would tint the very thing these controls
            are adjusting, which makes a contrast setting impossible to judge. */}
        <Drawer.Content
          ref={panelRef}
          aria-describedby={undefined}
          className={cn(
            "fixed z-60 flex min-w-0 flex-col overflow-hidden bg-surface outline-none shadow-float",
            mobile
              ? // Height comes from the active snap point, so the sheet is sized
                // by Vaul rather than pinned here.
                "inset-x-0 bottom-0 h-[90dvh] rounded-t-xl pb-[env(safe-area-inset-bottom)]"
              : "inset-y-0 left-0 h-dvh max-h-dvh w-[min(24rem,calc(100vw-0.75rem))]",
          )}
          style={{ transitionTimingFunction: "var(--ease-drawer)" }}
        >
          {mobile ? (
            <div
              aria-hidden
              className="mx-auto mt-2 mb-1 h-1 w-9 shrink-0 rounded-full bg-fg/20"
            />
          ) : null}
          <Drawer.Title className="sr-only">{title}</Drawer.Title>
          {children}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
