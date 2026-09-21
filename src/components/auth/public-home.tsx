import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { Landing } from "@/components/landing";
import { Mark } from "@/components/mark";
import { PreferredSourceBadge } from "@/components/preferred-source";

/**
 * Tell the stylesheet when the page has left its top.
 *
 * The glass capsule tints via `html[data-scrolled="true"] .nl-glass-tint`, and
 * on this page nothing ever set that attribute — the only writer was the app
 * shell's pane `onScroll`, and the shell does not render for a signed-out
 * visitor. So the header sat permanently in its at-rest state: transparent,
 * with the tint that exists to separate it from the content behind it never
 * arriving. The effect was built, correct, and unreachable on the busiest page
 * on the site.
 *
 * Window scroll rather than a pane, because this page scrolls the document.
 * rAF-throttled for the same reason the document header does it: the listener
 * fires per frame and the stylesheet only needs a boolean.
 *
 * Cleared on unmount. The shell's own writer short-circuits when the value has
 * not changed, so a stale "true" left behind at sign-in would stick until
 * somebody scrolled a pane down and back up again.
 */
function useScrolledFlag() {
  useEffect(() => {
    let frame = 0;
    let last: boolean | null = null;

    const update = () => {
      frame = 0;
      const scrolled = window.scrollY > 16;
      if (scrolled === last) return;
      last = scrolled;
      document.documentElement.dataset.scrolled = scrolled ? "true" : "false";
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    return () => {
      window.removeEventListener("scroll", schedule);
      cancelAnimationFrame(frame);
      delete document.documentElement.dataset.scrolled;
    };
  }, []);
}

/**
 * The home page for somebody who is not signed in.
 *
 * The same `Landing` the app renders, with `locked` set — so the hero, the
 * features, the statistics and the questions are the page a visitor and a
 * crawler both get, and only the reader itself is replaced by a way to sign up.
 *
 * Its own chrome rather than the app shell's: the shell carries tabs for the
 * library, the reader and settings, and offering those to somebody who cannot
 * open any of them is an invitation to bounce off five locked doors.
 */
export function PublicHome() {
  useScrolledFlag();

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <div className="grain" aria-hidden />

      {/* Fixed, not absolute. Absolute meant the header scrolled away with the
          hero and never came back, so for the whole length of a very long
          landing page a signed-out visitor had no way to sign in — and the
          glass, which only tints once content is behind it, was never on screen
          in the state it was built for. `main` already reserves the height
          below, so this is a drop-in. */}
      <header className="pointer-events-none fixed inset-x-0 top-0 z-40">
        <div className="nl-glass relative">
          <div className="nl-glass-pane pointer-events-none absolute inset-0" aria-hidden />
          <div className="nl-glass-tint pointer-events-none absolute inset-0" aria-hidden />
          <div className="nl-glass-content pointer-events-auto relative flex h-14 items-center justify-between gap-2 px-3 sm:h-16 sm:px-6">
            <Link
              to="/"
              aria-label="NeuroLens home"
              className="icon-group flex items-center gap-2.5"
            >
              <Mark detail className="size-9 text-fg sm:size-10" />
              <span className="text-sm font-medium tracking-tight">NeuroLens</span>
            </Link>
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                className="inline-flex h-9 items-center rounded-full px-3.5 text-sm font-medium text-fg transition-[background-color] duration-150 ease-[var(--ease-out)] hover:bg-fg/5"
              >
                Sign in
              </Link>
              <Link
                to="/signup"
                className="inline-flex h-9 items-center rounded-full bg-fg px-4 text-sm font-semibold text-bg transition-[transform,opacity] duration-150 ease-[var(--ease-out)] hover:opacity-90 active:scale-[0.97]"
              >
                Get started
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="pt-16 outline-none sm:pt-[4.5rem]">
        <Landing locked />
      </main>

      <footer className="mx-auto w-full max-w-6xl px-4 pb-10 sm:px-6">
        <PreferredSourceBadge className="mb-8" />
        <nav
          aria-label="About NeuroLens"
          className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-subtle"
        >
          <span>NeuroLens · Crafted for neurodivergent minds</span>
          <Link to="/help" className="hover:text-fg">
            Help
          </Link>
          <Link to="/support" className="hover:text-fg">
            Support
          </Link>
          <Link to="/privacy" className="hover:text-fg">
            Privacy
          </Link>
          <Link to="/terms" className="hover:text-fg">
            Terms
          </Link>
          <Link to="/accessibility" className="hover:text-fg">
            Accessibility
          </Link>
        </nav>
      </footer>
    </div>
  );
}
