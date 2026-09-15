import { Link } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { useEffect, useState } from "react";
import { setAnalyticsEnabled, shouldAskForAnalytics, track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

const STARTED_KEY = "neurolens-started";

/**
 * Asking, once, whether usage can be measured.
 *
 * Not on arrival. A consent banner on the first screen is a wall between a
 * person and the thing they came for, and the answer means nothing before they
 * know what the app is. So it waits until someone has actually read something,
 * then appears once, quietly, in a corner — never while reading — and either
 * answer is final.
 *
 * It enters like a real object (rising, sharpening from a light blur) and
 * leaves faster than it arrived: arriving asks for attention, leaving should
 * never make anyone wait.
 */
export function AnalyticsConsent({ hidden = false }: { hidden?: boolean }) {
  const [eligible, setEligible] = useState(false);
  const [shown, setShown] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let started = false;
    try {
      started = Boolean(localStorage.getItem(STARTED_KEY));
    } catch {
      started = false;
    }
    if (!started || !shouldAskForAnalytics()) return;
    const timer = window.setTimeout(() => setEligible(true), 2500);
    return () => window.clearTimeout(timer);
  }, []);

  // Mount hidden, then show on the next frame so the transition has a start.
  useEffect(() => {
    if (!eligible || hidden) return;
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, [eligible, hidden]);

  if (!eligible) return null;

  const answer = (yes: boolean) => {
    setAnalyticsEnabled(yes);
    if (yes) track("app_open");
    setLeaving(true);
    window.setTimeout(() => setEligible(false), 220);
  };

  const visible = shown && !leaving && !hidden;

  return (
    <div
      role="dialog"
      aria-labelledby="consent-title"
      aria-describedby="consent-body"
      className={cn(
        // Right, and high enough to clear the floating pause control: at the
        // bottom-left it sat on the home page's call-to-action buttons, and
        // lower on the right the pause button covered "No thanks".
        "pointer-events-auto fixed right-4 bottom-4 left-4 z-50 max-w-sm rounded-2xl bg-surface p-5 shadow-[0_0_0_1px_rgba(22,22,21,0.07),0_24px_48px_-20px_rgba(22,22,21,0.35)] sm:left-auto sm:right-6 sm:bottom-40 sm:w-[24rem]",
        visible ? "translate-y-0 opacity-100 blur-0" : "translate-y-3 opacity-0 blur-[4px]",
        leaving
          ? "transition-[opacity,transform,filter] duration-200 ease-[var(--ease-out)]"
          : "transition-[opacity,transform,filter] duration-500 ease-[var(--ease-out)]",
        !visible && "pointer-events-none",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
          <BarChart3 size={16} aria-hidden />
        </span>
        <div className="min-w-0">
          <p id="consent-title" className="text-[15px] font-semibold tracking-[-0.01em] text-fg">
            Help improve NeuroLens?
          </p>
          <p id="consent-body" className="mt-1 text-sm leading-relaxed text-muted">
            Share which tools you use — anonymously. Never your name, email, or anything you read.{" "}
            <Link to="/privacy" hash="usage" className="text-fg underline decoration-fg/30 underline-offset-2">
              What is shared
            </Link>
          </p>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => answer(true)}
          className="h-10 flex-1 rounded-full bg-fg px-4 text-sm font-semibold text-bg transition-[transform,opacity] duration-150 ease-[var(--ease-out)] hover:opacity-90 active:scale-[0.97]"
        >
          Share usage
        </button>
        <button
          type="button"
          onClick={() => answer(false)}
          className="h-10 flex-1 rounded-full bg-bg px-4 text-sm font-medium text-fg shadow-border transition-[transform,background-color] duration-150 ease-[var(--ease-out)] hover:bg-fg/5 active:scale-[0.97]"
        >
          No thanks
        </button>
      </div>
    </div>
  );
}
