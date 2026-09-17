import { Star } from "lucide-react";
import { track } from "@/lib/analytics";
import { SITE } from "@/lib/seo";
import { cn } from "@/lib/utils";

/**
 * Google's Preferred Sources control, as a link rather than their script.
 *
 * Google ships two ways to do this. The documented default is two lines that
 * load `news.google.com/swg/js/v1/publisher.js` and let Google render the
 * button; the supported alternative is a deep link to the same preferences
 * screen. This is the deep link, deliberately:
 *
 *  - the script is third-party code on every page of an app whose whole claim is
 *    that it sends nothing anywhere, and it would have to be allowed through the
 *    Content-Security-Policy to run at all;
 *  - a link works with JavaScript off, costs nothing to load, and cannot watch
 *    anyone;
 *  - the destination is identical, so the reader ends up in the same place.
 *
 * What it does not do is render Google's own badge artwork or auto-translate
 * its label. If either matters more than the above, the script version is the
 * one to switch to — and it needs `https://news.google.com` added to
 * `script-src` in scripts/security-headers.mjs.
 *
 * Eligibility is domain-level, so the query is the bare host.
 */
const PREFERRED_SOURCE_URL = `https://www.google.com/preferences/source?q=${encodeURIComponent(
  SITE.url.replace(/^https?:\/\//, ""),
)}`;

export function PreferredSourceBadge({
  className,
  tone = "quiet",
}: {
  className?: string;
  /** `quiet` sits in a footer; `card` stands alone with its own explanation. */
  tone?: "quiet" | "card";
}) {
  const link = (
    <a
      href={PREFERRED_SOURCE_URL}
      target="_blank"
      // `noopener` because the destination gets a handle on this window
      // otherwise; `noreferrer` so Google is not told which page it was clicked
      // from, which it does not need in order to do its job.
      rel="noopener noreferrer"
      onClick={() => track("preferred_source_click")}
      className={cn(
        "group inline-flex items-center gap-2 rounded-full text-sm font-medium transition-[transform,background-color,box-shadow] duration-150 ease-[var(--ease-out)] active:scale-[0.97]",
        tone === "card"
          ? "h-11 bg-fg px-5 text-bg hover:opacity-90"
          : "h-9 bg-fg/5 px-3.5 text-fg hover:bg-fg/10",
      )}
    >
      <Star
        size={15}
        aria-hidden
        className="transition-transform duration-200 ease-[var(--ease-out)] group-hover:scale-110"
      />
      Add NeuroLens to Google
      <span className="sr-only"> as a preferred source (opens Google in a new tab)</span>
    </a>
  );

  if (tone === "quiet") return <div className={className}>{link}</div>;

  return (
    <div className={cn("rounded-2xl bg-surface p-5 shadow-border sm:p-6", className)}>
      <p className="text-[15px] font-semibold tracking-[-0.01em] text-fg">
        See NeuroLens more often in Google?
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-pretty text-muted">
        Marking a site as a preferred source tells Google to show it higher in your own results. It
        changes what you see, not what anyone else does, and you can undo it in the same place.
      </p>
      <div className="mt-4">{link}</div>
    </div>
  );
}
