import { useState, useSyncExternalStore } from "react";
import { BarChart3, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/surfaces";
import {
  analyticsEnabled,
  privacySignal,
  queuedEvents,
  setAnalyticsEnabled,
  subscribeAnalytics,
} from "@/lib/analytics";
import { cn } from "@/lib/utils";

/**
 * The analytics switch, and the exact list of what it has recorded.
 *
 * Showing the raw queue is the part that matters. "We only collect usage data"
 * is a sentence anyone can write; a list of every event this device has
 * recorded, word for word, is something a reader can check for themselves.
 */
export function AnalyticsSettings() {
  const enabled = useSyncExternalStore(subscribeAnalytics, analyticsEnabled, () => false);
  const events = useSyncExternalStore(
    subscribeAnalytics,
    () => JSON.stringify(queuedEvents()),
    () => "[]",
  );
  const [open, setOpen] = useState(false);
  const parsed = JSON.parse(events) as ReturnType<typeof queuedEvents>;
  const signal = typeof navigator !== "undefined" && privacySignal();

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <BarChart3 size={16} className="shrink-0 text-accent" aria-hidden />
        <div className="min-w-0 flex-1 basis-56">
          <p id="analytics-label" className="text-sm font-medium">
            Share how you use the app
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            Which tools and file types get used — never your name, your email, or anything you read. Off
            until you switch it on.
            {signal && !enabled ? " Your browser asks sites not to track you, so you will not be asked." : ""}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="analytics-label"
          onClick={() => setAnalyticsEnabled(!enabled)}
          className={cn(
            "relative h-7 w-12 shrink-0 rounded-full transition-colors duration-150",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
            enabled ? "bg-fg" : "bg-fg/15",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "absolute top-1 left-1 size-5 rounded-full bg-bg shadow-sm transition-transform duration-150",
              enabled && "translate-x-5",
            )}
          />
        </button>
      </div>

      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-fg"
      >
        <ChevronDown size={13} aria-hidden className={cn("transition-transform duration-150", open && "rotate-180")} />
        See exactly what has been recorded ({parsed.length})
      </button>

      {open ? (
        parsed.length ? (
          <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-fg/4 p-3 font-mono text-[11px] leading-relaxed text-muted">
            {parsed
              .slice(-50)
              .reverse()
              .map((event) => `${new Date(event.t).toISOString().slice(0, 13)}h  ${event.e}  ${JSON.stringify(event.p)}`)
              .join("\n")}
          </pre>
        ) : (
          <p className="mt-2 text-xs text-subtle">Nothing recorded on this device.</p>
        )
      ) : null}
    </Card>
  );
}
