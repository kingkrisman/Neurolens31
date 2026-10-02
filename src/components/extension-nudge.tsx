import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Puzzle, X } from "lucide-react";
import { BROWSER_NAMES, guessBrowser, storeLinkFor, useExtensionInstalled, type BrowserId } from "@/lib/extension";
import { cn } from "@/lib/utils";

const DISMISSED = "neurolens-extension-nudge";

/**
 * Telling readers, once, that the extension exists.
 *
 * Only where it can be acted on: a computer, a browser it is made for, a store
 * that lists it, and not already installed. Only once: dismissing it, or
 * following it, puts it away for good on this device. And never mid-read —
 * the shell hides it on the Read tab, where an interruption costs most.
 */
export function ExtensionNudge({ hidden }: { hidden: boolean }) {
  const installed = useExtensionInstalled();
  const [offer, setOffer] = useState<{ browser: BrowserId; link: string } | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISSED)) return;
    } catch {
      return;
    }
    const guess = guessBrowser(navigator.userAgent);
    const link = storeLinkFor(guess);
    if (!link || !guess.browser) return;
    const browser = guess.browser;
    // A while after arriving, and after the extension has had its chance to
    // say it is already here.
    const timer = window.setTimeout(() => setOffer({ browser, link }), 6000);
    return () => window.clearTimeout(timer);
  }, []);

  if (!offer || installed || hidden) return null;

  const close = () => {
    try {
      localStorage.setItem(DISMISSED, String(Date.now()));
    } catch {
      /* private mode: it will simply ask again next visit */
    }
    setLeaving(true);
    window.setTimeout(() => setOffer(null), 220);
  };

  return (
    <aside
      aria-labelledby="extension-nudge-title"
      className={cn(
        "pointer-events-auto fixed right-4 bottom-4 left-4 z-40 max-w-sm rounded-2xl bg-surface p-5 shadow-[0_0_0_1px_rgba(22,22,21,0.07),0_24px_48px_-20px_rgba(22,22,21,0.35)] sm:right-auto sm:bottom-6 sm:left-6 sm:w-[23rem]",
        "transition-[opacity,transform,filter] duration-300 ease-out",
        leaving ? "translate-y-3 opacity-0 blur-[4px]" : "translate-y-0 opacity-100 blur-0",
      )}
    >
      <button
        type="button"
        onClick={close}
        aria-label="Not now"
        className="absolute top-3 right-3 grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-fg/6 hover:text-fg"
      >
        <X size={15} aria-hidden />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
          <Puzzle size={16} aria-hidden />
        </span>
        <div className="min-w-0">
          <p id="extension-nudge-title" className="text-[15px] font-semibold tracking-[-0.01em] text-fg">
            Your settings, on every site
          </p>
          <p className="mt-1 text-sm leading-relaxed text-pretty text-muted">
            The NeuroLens extension for {BROWSER_NAMES[offer.browser]} brings your typeface, spacing and
            colours to the websites you read, social posts included.{" "}
            <Link to="/extension" onClick={close} className="text-fg underline decoration-fg/30 underline-offset-2">
              What it does
            </Link>
          </p>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <a
          href={offer.link}
          target="_blank"
          rel="noopener noreferrer"
          onClick={close}
          className="inline-flex h-10 flex-1 items-center justify-center rounded-full bg-fg px-4 text-sm font-semibold text-bg transition-[transform,opacity] duration-150 ease-out hover:opacity-90 active:scale-[0.97]"
        >
          Add to {BROWSER_NAMES[offer.browser]}
        </a>
        <button
          type="button"
          onClick={close}
          className="h-10 flex-1 rounded-full bg-bg px-4 text-sm font-medium text-fg shadow-border transition-[transform,background-color] duration-150 ease-out hover:bg-fg/5 active:scale-[0.97]"
        >
          Not now
        </button>
      </div>
    </aside>
  );
}
