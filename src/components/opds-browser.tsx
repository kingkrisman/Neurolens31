import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Download, FolderOpen, Library as LibraryIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { processDocument } from "@/lib/document-processor";
import { useAppStore } from "@/lib/store";
import { fetchBookFile, fetchFeed, OpdsError, PRESET_CATALOGUES } from "@/lib/opds/client";
import {
  bestAcquisition,
  collapseEditions,
  entryByline,
  isNavigation,
  type OpdsEntry,
  type OpdsFeed,
} from "@/lib/opds/parse";
import { bucketSize, formatOf, track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Browse a reader's own book catalogue.
 *
 * OPDS is the open standard for this, and it is what lets NeuroLens honestly
 * say "connect your library": Calibre-Web, Kavita, Komga, Standard Ebooks and
 * many public libraries publish one. Kindle, Libby and Hoopla publish nothing
 * and cannot be supported — not for want of effort, but because their
 * catalogues are behind DRM that only their own apps may open.
 *
 * Covers are deliberately not rendered. They live on the catalogue's own
 * server, so showing them would mean the page fetching images from whatever
 * host somebody typed in — a Content-Security-Policy hole and a request to a
 * third party on every browse. The list is text, which is also faster.
 */
export function OpdsBrowser() {
  const startReading = useAppStore((s) => s.startReading);

  const [address, setAddress] = useState("");
  const [feed, setFeed] = useState<OpdsFeed | null>(null);
  const [stack, setStack] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const rows = useMemo(() => (feed ? collapseEditions(feed.entries) : []), [feed]);

  // Abandon an in-flight feed when the component goes away, so a slow
  // catalogue cannot resolve into a component that is no longer mounted.
  useEffect(() => () => request.current?.abort(), []);

  const open = useCallback(async (url: string, push: boolean) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;

    setLoading(true);
    setError(null);
    try {
      const next = await fetchFeed(url, controller.signal);
      if (controller.signal.aborted) return;
      setFeed(next);
      setStack((previous) => (push ? [...previous, url] : previous));
    } catch (problem) {
      if ((problem as Error)?.name === "AbortError") return;
      setError(
        problem instanceof OpdsError ? problem.message : "That catalogue could not be read.",
      );
      setFeed(null);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  const back = () => {
    const previous = stack.slice(0, -1);
    setStack(previous);
    const to = previous[previous.length - 1];
    if (to) void open(to, false);
    else setFeed(null);
  };

  const download = async (entry: OpdsEntry) => {
    const file = bestAcquisition(entry);
    if (!file) return;

    setDownloading(entry.id);
    try {
      const downloaded = await fetchBookFile(file.href, entry.title, file.type);
      const doc = await processDocument(downloaded);
      track("file_opened", {
        format: formatOf(downloaded.name),
        size: bucketSize(downloaded.size),
      });
      startReading(doc.content, {
        title: doc.title || entry.title,
        kind: doc.metadata.format === "PDF" ? "pdf" : "text",
      });
      toast.success("Opened in the reader");
    } catch (problem) {
      toast.error(problem instanceof Error ? problem.message : "Could not download that book");
    } finally {
      setDownloading(null);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const url = address.trim();
    if (url) void open(url, true);
  };

  return (
    <section>
      <h2 className="mb-1 text-lg font-medium">Free book libraries</h2>
      <p className="mb-4 text-sm leading-relaxed text-pretty text-muted">
        Browse thousands of free, public-domain books and open any of them straight into the reader.
      </p>

      {/* The common case first, and in plain words.
          The first version led with a URL box and the words "Calibre-Web,
          Kavita or Komga, or your library publishes an OPDS feed" — accurate,
          and meaningless to almost everybody who opened this tab. Most people
          want free books; a few run their own library server. The first group
          now sees two buttons, and the second finds their form one tap away. */}
      {!feed && !loading ? (
        <div className="flex flex-col gap-2">
          {PRESET_CATALOGUES.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => void open(preset.url, true)}
              className="flex min-h-16 items-center gap-3.5 rounded-xl bg-surface px-4 py-3 text-left shadow-border transition-[transform,box-shadow] duration-150 ease-[var(--ease-out)] hover:shadow-border-hover active:scale-[0.99]"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
                <LibraryIcon size={18} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">{preset.name}</span>
                <span className="mt-0.5 block text-sm leading-snug text-pretty text-muted">
                  {preset.description}
                </span>
              </span>
            </button>
          ))}

          {error ? (
            <p role="alert" className="mt-1 text-sm leading-relaxed text-danger">
              {error}
            </p>
          ) : null}

          <details className="mt-2 rounded-xl bg-surface px-4 py-3 shadow-border">
            <summary className="cursor-pointer text-sm font-medium">
              Have your own library server?
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-pretty text-muted">
              If you keep your books in Calibre, Kavita or Komga, paste the address of its book feed
              below (it usually ends in <span className="font-mono text-fg">/opds</span>). Your
              books will appear here, and nothing is uploaded — each one is fetched only when you
              open it.
            </p>
            <form onSubmit={submit} className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                type="url"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="https://books.example.com/opds"
                aria-label="Your library server address"
                className="h-11 min-w-0 flex-1 rounded-lg bg-bg px-3.5 text-sm shadow-border outline-none focus-visible:shadow-border-hover"
              />
              <Button type="submit" className="h-11 shrink-0">
                Open library
              </Button>
            </form>
          </details>
        </div>
      ) : null}

      {loading ? (
        <p className="flex items-center gap-2 rounded-xl bg-surface p-5 text-sm text-muted shadow-border">
          <Loader2 size={15} className="animate-spin" aria-hidden />
          Loading books…
        </p>
      ) : null}

      {feed && !loading ? (
        <div className="rounded-xl bg-surface p-2 shadow-border">
          <div className="flex items-center gap-2 px-2 py-2">
            <Button variant="ghost" size="sm" onClick={back} className="shrink-0">
              <ChevronLeft size={15} aria-hidden />
              Back
            </Button>
            <p className="min-w-0 truncate text-sm font-medium">{feed.title}</p>
          </div>

          {error ? (
            <p role="alert" className="px-3 pb-2 text-sm text-danger">
              {error}
            </p>
          ) : null}

          {rows.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted">No books here yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {rows.map((entry) => {
                const folder = isNavigation(entry);
                const file = folder ? null : bestAcquisition(entry);
                const busy = downloading === entry.id;
                // Neither a folder nor anything this reader can open: a loan,
                // a purchase, or an audiobook. Shown greyed rather than hidden,
                // so a catalogue does not look mysteriously empty.
                const inert = !folder && !file;

                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      disabled={inert || busy}
                      onClick={() => {
                        if (folder && entry.navigationUrl) void open(entry.navigationUrl, true);
                        else if (file) void download(entry);
                      }}
                      className={cn(
                        "flex w-full min-h-14 items-center gap-3 rounded-lg px-3.5 py-2.5 text-left",
                        // Not faded with opacity: at 55% the title failed
                        // contrast. The label below says why it cannot open.
                        !inert && "hover:bg-fg/6",
                      )}
                    >
                      <span className="shrink-0 text-accent" aria-hidden>
                        {busy ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : folder ? (
                          <FolderOpen size={16} />
                        ) : (
                          <Download size={16} />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{entry.title}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted">
                          {inert
                            ? "Can't be opened here — needs a loan or purchase"
                            : (entryByline(entry) ?? (folder ? "Open" : "Tap to read"))}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {feed.nextUrl ? (
            <div className="px-2 py-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => void open(feed.nextUrl!, false)}
              >
                More
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
