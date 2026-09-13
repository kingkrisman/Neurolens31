import { useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronRight, Download, Highlighter, Search } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Media, Skeleton } from "@/components/ui/surfaces";
import { Segmented } from "@/components/segmented";
import { Poster, Shelf } from "@/components/library-shelf";
import { BibleLibrary } from "@/components/bible-library";
import { PoetryLibrary } from "@/components/poetry-library";
import { FileDrop } from "@/components/file-drop";
import { LensLoader } from "@/components/ui/loader";
import { RemoteErrorView } from "@/components/remote-state";
import { FEATURED_GUTENDEX_QUERIES, fallbackGutendexSearch, fetchGutendexPage, fetchGutendexReaderText, pickGutendexCover, searchGutendex, type GutendexBook } from "@/lib/gutendex";
import { announce } from "@/lib/announce";
import { isAbortError, isRemoteError } from "@/lib/remote";
import { processDocument } from "@/lib/document-processor";
import { downloadHighlights } from "@/lib/reading-export";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ContentKind } from "@/lib/types";
import { PageEnter, ScrollScene } from "@/components/gsap-motion";

function kindLabel(kind?: ContentKind) {
  if (kind === "bible") return "Bible";
  if (kind === "pdf") return "Document";
  if (kind === "poem") return "Poem";
  return "Reading";
}

/**
 * Cinematic opener for the catalog: one title at poster scale with its cover
 * bled behind it.
 *
 * The artwork is duplicated — blurred and scaled as the backdrop, sharp in the
 * card. Gutenberg covers are small and portrait, so stretching one to fill a
 * wide banner would show every artifact; blurring the same image instead gives
 * the row a colour field that always matches the book.
 */
function Billboard({
  book,
  busy,
  onOpen,
}: {
  book: GutendexBook;
  busy: boolean;
  onOpen: () => void;
}) {
  const cover = pickGutendexCover(book.formats);
  const author = book.authors.map((person) => person.name).join(", ");

  return (
    <section className="relative mt-6 overflow-hidden rounded-xl bg-fg/90 shadow-border">
      {cover ? (
        <img
          src={cover}
          alt=""
          aria-hidden
          className="absolute inset-0 size-full scale-125 object-cover opacity-70 blur-3xl"
        />
      ) : null}
      {/* Darkest at the left where the text sits, opening up to the right so the
          blurred artwork still reads as colour rather than a flat black panel. */}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/65 to-black/20" />

      <div className="relative flex items-center gap-4 p-4 sm:gap-7 sm:p-7">
        <div className="w-24 shrink-0 overflow-hidden rounded-lg shadow-float sm:w-36 lg:w-44">
          {cover ? (
            <Media src={cover} alt="" width={400} height={600} className="aspect-[2/3] w-full object-cover" />
          ) : (
            <div className="flex aspect-[2/3] items-center justify-center bg-white/10">
              <BookOpen size={30} className="text-white/50" aria-hidden />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 text-white">
          <p className="text-[10px] font-medium tracking-[0.16em] text-white/60 uppercase sm:text-xs">
            Most read · Gutenberg
          </p>
          <h2 className="mt-1.5 line-clamp-3 font-serif text-xl leading-[1.12] tracking-tight text-balance sm:mt-2.5 sm:text-3xl lg:text-4xl">
            {book.title}
          </h2>
          <p className="mt-1.5 line-clamp-1 text-xs text-white/70 sm:mt-2.5 sm:text-sm">
            {author || "Author unrecorded"}
            <span className="tabular-nums"> · {book.download_count.toLocaleString()} reads</span>
          </p>
          <Button onClick={onOpen} disabled={busy} className="mt-3.5 bg-white pr-3 pl-4 text-black hover:opacity-90 sm:mt-5">
            {busy ? "Opening" : "Start reading"}
            <ChevronRight size={15} className="icon-motion icon-shift" />
          </Button>
        </div>
      </div>
    </section>
  );
}

const MIN_SHELF = 4;
const MAX_SHELVES = 6;

/**
 * Group a flat result list into rows using Gutenberg's own `bookshelves`.
 *
 * The categories are real catalog metadata rather than buckets invented here,
 * which matters: a row labelled "Detective Fiction" has to actually mean it. A
 * book can sit in more than one row, as it does in the catalog itself.
 *
 * Rows shorter than `MIN_SHELF` are folded into a trailing catch-all — a shelf
 * holding two books reads as a mistake, not a category.
 */
function groupIntoShelves(books: GutendexBook[]) {
  const byShelf = new Map<string, GutendexBook[]>();
  for (const book of books) {
    for (const raw of book.bookshelves) {
      // Gutenberg prefixes its shelves ("Browsing: Fiction", "Category: Novels").
      // The prefix is catalog plumbing, not part of the name a reader wants.
      const name = raw.replace(/^(?:Browsing|Category)\s*:\s*/i, "").trim();
      if (!name) continue;
      const list = byShelf.get(name);
      if (list) list.push(book);
      else byShelf.set(name, [book]);
    }
  }

  const shelves = [...byShelf.entries()]
    .filter(([, list]) => list.length >= MIN_SHELF)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, MAX_SHELVES)
    .map(([title, list]) => ({ title, books: list }));

  const shelved = new Set(shelves.flatMap((shelf) => shelf.books.map((book) => book.id)));
  const rest = books.filter((book) => !shelved.has(book.id));
  return { shelves, rest };
}

/**
 * Every passage marked across every book.
 *
 * Highlights are stored per book, which is right for reading but wrong for
 * remembering: what someone marks is usually the thing they want to find again
 * later, without first recalling which book it was in. Gathering them in one
 * place is what turns marking from a reading aid into something closer to
 * notes, and it only became possible once a highlight started carrying its own
 * text rather than a bare line number.
 *
 * Opening one reopens the book at the passage. The reader resolves the section
 * itself, so this only has to hand it the text.
 */
function MarkedPassages() {
  const highlights = useAppStore((s) => s.highlights);
  const sessions = useAppStore((s) => s.sessions);
  const startReading = useAppStore((s) => s.startReading);
  const [expanded, setExpanded] = useState(false);

  // Highlights are keyed by the opening of the book's text, which is exactly
  // what a session can be matched on without storing the book twice.
  const groups = useMemo(() => {
    return Object.entries(highlights)
      .map(([key, marks]) => {
        const session = sessions.find((item) => item.content.trim().slice(0, 48) === key);
        return {
          key,
          title: session?.title ?? key.slice(0, 40),
          content: session?.content ?? null,
          marks: [...marks].sort((a, b) => b.at - a.at),
        };
      })
      .filter((group) => group.marks.length > 0)
      .sort((a, b) => (b.marks[0]?.at ?? 0) - (a.marks[0]?.at ?? 0));
  }, [highlights, sessions]);

  const total = groups.reduce((sum, group) => sum + group.marks.length, 0);
  if (total === 0) return null;

  const shown = expanded ? groups : groups.slice(0, 2);

  return (
    <section>
      <h2 className="mb-4 flex items-baseline gap-2 text-xs font-medium tracking-wide text-muted uppercase">
        Highlights
        <span className="text-subtle tabular-nums normal-case">{total}</span>
      </h2>
      <p className="mb-4 -mt-2 text-sm text-muted">Passages you marked, across every book.</p>
      <div className="space-y-4">
        {shown.map((group) => (
          <div key={group.key}>
            <p className="mb-2 truncate text-sm font-medium">{group.title}</p>
            <div className="space-y-1.5">
              {group.marks.slice(0, expanded ? 20 : 3).map((mark) => (
                <button
                  key={`${mark.section}:${mark.lineIdx}:${mark.at}`}
                  type="button"
                  disabled={!group.content}
                  onClick={() => {
                    if (group.content) startReading(group.content, { title: group.title });
                  }}
                  className="icon-group flex w-full items-start gap-2.5 rounded-md bg-surface px-3 py-2.5 text-left shadow-border transition-[box-shadow,transform] duration-[150ms] ease-[var(--ease-out)] hover:shadow-border-hover active:not-disabled:scale-[0.99] disabled:opacity-60"
                >
                  <Highlighter size={14} className="mt-0.5 shrink-0 text-accent icon-motion icon-lift" />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 block text-sm leading-relaxed">{mark.text}</span>
                    {mark.note ? (
                      <span className="mt-1 line-clamp-2 block text-xs text-muted italic">
                        {mark.note}
                      </span>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {groups.length > 2 || total > 6 ? (
          <Button variant="outline" size="sm" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Show less" : `Show all ${total}`}
          </Button>
        ) : null}
        {/* Collecting passages across a library is only half of it if they
            cannot leave — study reading ends somewhere else. */}
        <Button
          variant="outline"
          size="sm"
          className="pl-3 pr-2.5"
          onClick={() => {
            try {
              downloadHighlights(groups);
              toast.success(`Exported ${total} passage${total === 1 ? "" : "s"}`);
            } catch {
              toast.error("Could not export");
            }
          }}
        >
          Export
          <Download size={14} className="icon-motion icon-drop" />
        </Button>
      </div>
    </section>
  );
}

function Catalog() {
  const startReading = useAppStore((s) => s.startReading);
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [books, setBooks] = useState<GutendexBook[]>([]);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [source, setSource] = useState<"gutendex" | "fallback">("gutendex");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<unknown>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    // Loading, not "ready" with two books in it.
    //
    // The offline shelf holds a handful of titles as a last resort, and showing
    // it up front meant a slow connection presented *that* as the catalogue —
    // a couple of covers where sixty thousand were expected, with no sign that
    // anything else was still coming. Leaving away and returning appeared to
    // fix it only because the real request had landed in the meantime. The
    // fallback now belongs to the failure path, which is the only place it was
    // ever meant to be.
    setStatus("loading");
    setError(null);

    (async () => {
      try {
        const result = await searchGutendex(submitted, controller.signal);
        if (controller.signal.aborted) return;

        // One page is 32 titles, which leaves the shelves looking thin — most
        // of them fall under MIN_SHELF and collapse into the catch-all. Pulling
        // a second page up front is what makes the rows read as categories.
        let all = result.results;
        let next = result.next;
        if (next) {
          try {
            const more = await fetchGutendexPage(next, controller.signal);
            if (controller.signal.aborted) return;
            const seen = new Set(all.map((book) => book.id));
            all = [...all, ...more.results.filter((book) => !seen.has(book.id))];
            next = more.next;
          } catch {
            // A thin catalogue still beats none: keep page one and move on.
          }
        }

        setBooks(all);
        setNextUrl(next);
        setTotal(result.count);
        setSource(result.source);
        setStatus("ready");
        announce(
          all.length
            ? `${all.length} Gutenberg titles${submitted ? ` for ${submitted}` : ""}`
            : `No Gutenberg titles${submitted ? ` for ${submitted}` : ""}`,
        );
      } catch (err: unknown) {
        if (controller.signal.aborted || isAbortError(err)) return;
        // Now the offline shelf earns its place.
        const fallback = fallbackGutendexSearch(submitted);
        setBooks(fallback.results);
        setNextUrl(null);
        setTotal(fallback.count);
        setSource("fallback");
        setError(err);
        setStatus(fallback.results.length ? "ready" : "error");
        announce("Could not load the Gutenberg catalog");
      }
    })();

    return () => controller.abort();
  }, [submitted, retryTick]);

  async function openBook(book: GutendexBook) {
    setOpeningId(book.id);
    try {
      const text = await fetchGutendexReaderText(book);
      startReading(text, { title: book.title, kind: "text", sourceId: `gutenberg-${book.id}` });
    } catch (err) {
      if (!isAbortError(err)) {
        toast.error(err instanceof Error ? err.message : "Could not open that book");
      }
    } finally {
      setOpeningId(null);
    }
  }

  async function loadMore() {
    if (!nextUrl || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await fetchGutendexPage(nextUrl);
      setBooks((current) => [...current, ...result.results]);
      setNextUrl(result.next);
      setTotal(result.count);
    } catch (err) {
      if (!isAbortError(err)) {
        toast.error(err instanceof Error ? err.message : "Could not load more titles");
      }
    } finally {
      setLoadingMore(false);
    }
  }

  const emptyMiss =
    status === "error" && isRemoteError(error) && (error.kind === "empty" || error.kind === "not-found");

  // The billboard takes the most-downloaded title, so the page opens on the
  // book most people actually read rather than whatever the API listed first.
  const featured = books.length > 0
    ? books.reduce((best, book) => (book.download_count > best.download_count ? book : best))
    : null;
  const { shelves, rest } = groupIntoShelves(books.filter((book) => book.id !== featured?.id));

  return (
    <>
      <form
        className="mt-8 flex max-w-2xl flex-col gap-3 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          const next = query.trim();
          setSubmitted(next);
        }}
      >
        <label className="relative flex-1">
          <span className="sr-only">Search Project Gutenberg</span>
          <Search size={16} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-subtle icon-motion icon-lift" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Austen, Darwin, Frankenstein"
            className="pl-10"
          />
        </label>
        <Button type="submit" disabled={status === "loading"} className="sm:w-32">
          {status === "loading" ? <LensLoader label="Searching" /> : "Search"}
        </Button>
      </form>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {FEATURED_GUTENDEX_QUERIES.map((item) => {
          const active = submitted.toLowerCase() === item.toLowerCase();
          return (
            <button
              key={item}
              type="button"
              onClick={() => {
                setQuery(item);
                setSubmitted(item);
              }}
              className={cn(
                "h-9 rounded-md px-3 text-sm font-medium shadow-border transition-[background-color,transform] duration-[140ms] ease-[var(--ease-out)] active:scale-[0.97]",
                active ? "bg-fg text-primary-fg" : "bg-surface text-fg hover:bg-fg/6",
              )}
            >
              {item}
            </button>
          );
        })}
      </div>

      <section className="mt-10 pb-16">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xs font-medium tracking-wide text-muted uppercase">
            Catalog · {submitted ? `“${submitted}”` : "Popular"}
          </h2>
          <span className="text-xs tabular-nums text-subtle">{status === "ready" ? total.toLocaleString() : ""}</span>
        </div>

        {status === "loading" ? (
          // Mirrors the loaded shape — a billboard over two shelves — so the
          // page does not visibly re-lay-out the moment results arrive.
          <div className="space-y-8">
            <Skeleton className="mt-6 h-40 rounded-xl sm:h-56 lg:h-64" />
            {Array.from({ length: 2 }).map((_, row) => (
              <div key={row}>
                <Skeleton className="mb-2 h-4 w-32" />
                <div className="nl-shelf">
                  {Array.from({ length: 8 }).map((__, index) => (
                    <Skeleton key={index} className="aspect-[2/3] rounded-lg" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : status === "error" && !emptyMiss ? (
          <div className="rounded-xl bg-surface p-2 shadow-border">
            <div className="rounded-lg bg-bg px-4 py-5">
              <RemoteErrorView
                error={error}
                onRetry={() => setRetryTick((n) => n + 1)}
                hint="Titles come from Gutendex, a Project Gutenberg catalog. The readable text is fetched from Gutenberg through a same-origin proxy."
              />
            </div>
          </div>
        ) : books.length === 0 || emptyMiss ? (
          <div className="overflow-hidden rounded-xl bg-surface p-2 shadow-border">
            <Media
              src="/images/feature-books.jpg"
              alt="A stack of clothbound books on a linen table"
              width={1200}
              height={900}
              className="aspect-[16/9] w-full rounded-lg object-cover"
            />
            <div className="px-6 py-8 text-center">
              <BookOpen size={22} className="mx-auto mb-3 text-muted icon-motion icon-lift" />
              <p className="font-medium">No catalog records</p>
              <p className="mt-1 text-sm text-muted">Try Austen, Darwin, or Frankenstein.</p>
              <Button className="mt-4" variant="outline" onClick={() => setRetryTick((n) => n + 1)}>
                Retry
              </Button>
            </div>
          </div>
        ) : (
          <>
            {featured ? <Billboard book={featured} busy={openingId === featured.id} onOpen={() => void openBook(featured)} /> : null}

            <div className="mt-8 space-y-7 sm:space-y-9">
              {shelves.map((shelf) => (
                <Shelf key={shelf.title} title={shelf.title}>
                  {shelf.books.map((book) => (
                    <Poster
                      key={book.id}
                      title={book.title}
                      meta={book.authors.map((person) => person.name).join(", ") || "Author unrecorded"}
                      cover={pickGutendexCover(book.formats)}
                      badge={`${Math.round(book.download_count / 1000)}k`}
                      busy={openingId === book.id}
                      onOpen={() => void openBook(book)}
                    />
                  ))}
                </Shelf>
              ))}

              {rest.length > 0 ? (
                <Shelf title={shelves.length > 0 ? "More from this search" : "Catalog"}>
                  {rest.map((book) => (
                    <Poster
                      key={book.id}
                      title={book.title}
                      meta={book.authors.map((person) => person.name).join(", ") || "Author unrecorded"}
                      cover={pickGutendexCover(book.formats)}
                      badge={`${Math.round(book.download_count / 1000)}k`}
                      busy={openingId === book.id}
                      onOpen={() => void openBook(book)}
                    />
                  ))}
                </Shelf>
              ) : null}
            </div>

            {nextUrl ? (
              <div className="mt-6 flex justify-center">
                <Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
                  {loadingMore ? <LensLoader label="Loading" /> : "More titles"}
                </Button>
              </div>
            ) : null}
            <p className="mt-6 max-w-2xl text-xs leading-relaxed text-subtle">
              {source === "fallback"
                ? "Gutendex is taking a moment, so this is a local Gutenberg shelf. Full text still opens from Project Gutenberg."
                : "Catalog from Gutendex. Full text from Project Gutenberg. Public-domain works only."}
            </p>
          </>
        )}
      </section>
    </>
  );
}

export function Library() {
  const startReading = useAppStore((s) => s.startReading);
  const sessions = useAppStore((s) => s.sessions);
  const bookmarks = useAppStore((s) => s.bookmarks);
  const removeBookmark = useAppStore((s) => s.removeBookmark);
  const [section, setSection] = useState<"catalog" | "bible" | "poems" | "yours">("catalog");
  const [uploading, setUploading] = useState(false);

  return (
    // `max-w-7xl`, wider than the other views: shelves need the extra width to
    // show a useful number of posters, and the page padding is what
    // `--shelf-inset` cancels, so the two have to stay in step.
    <PageEnter className="mx-auto h-full max-w-7xl px-4 py-8 sm:px-8 sm:py-12" replayKey={section}>
      <h1 data-enter className="text-3xl sm:text-4xl lg:text-5xl">Library</h1>
      <p data-enter className="mt-2 max-w-prose text-sm text-pretty text-muted sm:mt-3 sm:text-base">
        Project Gutenberg via Gutendex, a live Bible, PoetryDB, and what you’ve kept.
      </p>
      <div data-enter className="mt-6 -mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mt-8 sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        <Segmented
          value={section}
          onChange={setSection}
          label="Library sections"
          className="w-max"
          options={[
            { id: "catalog", label: "Catalog" },
            { id: "bible", label: "Bible" },
            { id: "poems", label: "Poems" },
            { id: "yours", label: "Yours" },
          ]}
        />
      </div>

      <ScrollScene replayKey={section}>

      {section === "bible" && (
        <div data-enter className="mt-8 pb-16">
          <BibleLibrary />
        </div>
      )}

      {section === "poems" && (
        <div data-enter className="mt-8 pb-16">
          <PoetryLibrary />
        </div>
      )}

      {section === "yours" && (
        // Four sections stacked here with matching headings and even spacing,
        // which read as one undifferentiated list. A hairline above each and a
        // count beside the heading gives the eye somewhere to stop, and tells
        // you whether a section has anything in it before you read it.
        <div className="nl-yours mt-8 pb-16">
          {/* Content first, action last. Recently read and Highlights are
              what someone came here for; Upload is how more arrives. Leading
              with the empty-until-used action buried the things that fill up. */}
          <section>
            <h2 className="mb-4 flex items-baseline gap-2 text-xs font-medium tracking-wide text-muted uppercase">
              Recently read
              {sessions.length > 0 ? (
                <span className="text-subtle tabular-nums normal-case">{sessions.length}</span>
              ) : null}
            </h2>
            {sessions.length === 0 ? (
              <p className="text-sm text-muted">Open a passage and it will land here.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {sessions.map((session) => (
                  <button
                    key={session.openedAt}
                    type="button"
                    onClick={() =>
                      startReading(session.content, {
                        title: session.title,
                        kind: session.kind,
                        sourceId: session.sourceId,
                      })
                    }
                    className="rounded-xl bg-surface p-2 text-left shadow-border transition-[box-shadow,transform] duration-[150ms] ease-[var(--ease-out)] hover:shadow-border-hover active:scale-[0.99]"
                  >
                    <span className="block rounded-lg bg-bg px-4 py-4">
                      <p className="text-xs text-muted">{kindLabel(session.kind)}</p>
                      <h3 className="mt-2 font-medium">{session.title}</h3>
                      {/* Sliced, not clamped. `line-clamp-2` hides the overflow
                          but the browser still lays out every character, so
                          printing a whole book here put ~130k chars of text node
                          in the DOM per session — twelve sessions of Gutenberg
                          novels was megabytes of invisible text. */}
                      <p className="mt-2 line-clamp-2 text-sm text-muted">
                        {session.content.slice(0, 240)}
                      </p>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
          <MarkedPassages />
          <section>
            <h2 className="mb-4 flex items-baseline gap-2 text-xs font-medium tracking-wide text-muted uppercase">
              Bookmarks
              {bookmarks.length > 0 ? (
                <span className="text-subtle tabular-nums normal-case">{bookmarks.length}</span>
              ) : null}
            </h2>
            <p className="mb-4 -mt-2 text-sm text-muted">Where you stopped reading.</p>
            {bookmarks.length === 0 ? (
              <p className="text-sm text-muted">Nothing bookmarked yet. Save a place while you read.</p>
            ) : (
              <div className="grid gap-2.5 md:grid-cols-2">
                {bookmarks.map((item) => (
                  // Relative wrapper, not a flex row: Remove overlays the card
                  // corner instead of taking a column, which on a phone left
                  // the title about ten characters of usable width.
                  <div key={item.id} className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        startReading(item.content, {
                          title: item.title,
                          kind: item.kind,
                          sourceId: item.sourceId,
                          pdfPage: item.pdfPage,
                          chapter: item.chapter,
                          progress: item.progress,
                        })
                      }
                      className="group block w-full rounded-xl bg-surface p-2 text-left shadow-border transition-[box-shadow,transform] duration-[150ms] ease-[var(--ease-out)] hover:shadow-border-hover active:scale-[0.99]"
                    >
                      <span className="block rounded-lg bg-bg px-4 py-4 pr-20">
                        <span className="block truncate font-medium">{item.title}</span>
                        {item.excerpt ? (
                          <span className="mt-1 block truncate text-sm text-muted">{item.excerpt}</span>
                        ) : null}
                        <span className="mt-2 flex items-center gap-2">
                          <span aria-hidden className="h-1 flex-1 overflow-hidden rounded-full bg-fg/10">
                            <span
                              className="block h-full rounded-full bg-fg/45"
                              style={{ width: `${Math.round(item.progress * 100)}%` }}
                            />
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-muted">
                            {Math.round(item.progress * 100)}%
                          </span>
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${item.title}`}
                      className="absolute top-1/2 right-4 min-h-11 -translate-y-1/2 rounded-md px-2 text-sm text-muted hover:text-fg"
                      onClick={() => removeBookmark(item.id)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section>
            <h2 className="mb-4 text-xs font-medium tracking-wide text-muted uppercase">Upload</h2>
            <div className="rounded-xl bg-surface p-2 shadow-border">
              <FileDrop
                busy={uploading}
                onFile={(file) => {
                  void (async () => {
                    setUploading(true);
                    try {
                      const doc = await processDocument(file);
                      startReading(doc.content, {
                        title: doc.title,
                        kind: doc.metadata.format === "PDF" ? "pdf" : "text",
                      });
                      toast.success("Opened in the reader");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Could not read that file");
                    } finally {
                      setUploading(false);
                    }
                  })();
                }}
              />
            </div>
          </section>
        </div>
      )}

      {section === "catalog" && <Catalog />}
      </ScrollScene>
    </PageEnter>
  );
}
