import { Icon } from "@iconify/react";
import { useEffect, useRef, useState } from "react";
import { TABS } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { list, x } from "@/lib/ph-icons";
import { NAV_ICON } from "@/components/nav-icons";
import { gsap, registerGsap } from "@/lib/gsap";
import { useReducedMotion } from "@/lib/prefers-reduced-motion";
import { cn } from "@/lib/utils";

registerGsap();

/**
 * Primary navigation for phones and tablets: a menu button in the header that
 * opens a sheet of destinations.
 *
 * Replaces the bottom tab bar and the tablet rail. Both spent permanent
 * vertical space on navigation that is used a few times a session — on a phone
 * the bar plus the reader's own dock stacked into two strips of chrome above
 * the text. A button costs one corner and gives the page back.
 *
 * Above `lg` the header shows the full segmented control and this is hidden;
 * there is no menu to open when every destination is already on screen.
 */
export function NavMenu() {
  const tab = useAppStore((s) => s.tab);
  const setTab = useAppStore((s) => s.setTab);
  const text = useAppStore((s) => s.text);
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Escape closes, and focus goes back to the button that opened it.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Items cascade in. 40ms per item across five items keeps the whole run
  // inside ~200ms, so the last row never feels like it is lagging the first.
  useEffect(() => {
    if (!open || reduceMotion) return;
    const panel = panelRef.current;
    if (!panel) return;
    const rows = panel.querySelectorAll("[data-nav-item]");
    const tween = gsap.fromTo(
      rows,
      { opacity: 0, y: 8 },
      { opacity: 1, y: 0, duration: 0.25, ease: "power3.out", stagger: 0.04, overwrite: "auto" },
    );
    return () => {
      tween.kill();
    };
  }, [open, reduceMotion]);

  function choose(id: (typeof TABS)[number]["id"]) {
    setTab(id);
    setOpen(false);
  }

  return (
    <div className="relative shrink-0 lg:hidden">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "icon-group flex size-9 items-center justify-center rounded-md bg-surface text-fg shadow-border",
          "transition-[box-shadow,transform] duration-[140ms] ease-[var(--ease-out)]",
          "hover:shadow-border-hover active:scale-[0.97]",
          "focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-fg)_18%,transparent)]",
        )}
      >
        <Icon
          icon={open ? x : list}
          width={18}
          height={18}
          aria-hidden
          className="icon-motion icon-turn"
        />
      </button>

      {open ? (
        <>
          {/* Click-away. Not a dimming scrim — this is a small parallel menu,
              not a modal task, so the page behind it stays legible. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            ref={panelRef}
            role="menu"
            aria-label="Primary"
            // Anchored to the button it came from, so it reads as belonging to
            // the trigger rather than arriving from nowhere.
            className={cn(
              "nl-menu-in absolute right-0 top-[calc(100%+0.5rem)] z-50 w-56 origin-top-right",
              "rounded-lg bg-surface p-1.5 shadow-float",
            )}
          >
            {TABS.map((item) => {
              const selected = tab === item.id;
              const disabled = item.id === "read" && !text;
              const icon = NAV_ICON[item.id];
              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  data-nav-item
                  disabled={disabled}
                  title={disabled ? "Open a book or paste some text first" : undefined}
                  aria-description={disabled ? "Open a book or paste some text first" : undefined}
                  aria-current={selected ? "page" : undefined}
                  onClick={() => choose(item.id)}
                  className={cn(
                    "icon-group flex min-h-11 w-full items-center gap-2.5 rounded-md px-3 text-left text-sm font-medium",
                    "transition-[background-color,color,transform] duration-[140ms] ease-[var(--ease-out)]",
                    "active:not-disabled:scale-[0.98] focus-visible:outline-none focus-visible:bg-fg/6",
                    disabled
                      ? "pointer-events-none opacity-30"
                      : selected
                        ? "bg-fg/6 text-fg"
                        : "text-muted hover:bg-fg/4 hover:text-fg",
                  )}
                >
                  <Icon
                    icon={selected ? icon.active : icon.rest}
                    width={18}
                    height={18}
                    aria-hidden
                    className="icon-motion icon-lift shrink-0"
                  />
                  {item.label}
                  {selected ? (
                    <span aria-hidden className="ml-auto size-1.5 rounded-full bg-fg" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
