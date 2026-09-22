import { useState } from "react";
import { BookMarked, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";
import { groupByBook, parseClippings, type ClippingBook } from "@/lib/import/kindle-clippings";
import { anchorClippings, type AnchorResult } from "@/lib/import/anchor-clippings";
import { Button } from "@/components/ui/button";

/**
 * Bring years of Kindle highlights in from the device itself.
 *
 * Amazon has no API for this and is not going to have one. What it does have
 * is `My Clippings.txt`, written to every Kindle's own storage: plug the thing
 * in, and the file is right there. It is the reader's data on the reader's
 * hardware, so this asks nobody's permission and breaks nobody's terms — which
 * is exactly why it is the only Kindle integration worth building.
 *
 * Highlights are anchored into the matching book where one is in the library,
 * so they behave like marks made here: visible on the page, searchable,
 * synced. Where the book is not here they are kept as notes attached to the
 * title, because a highlight you can still read is better than one that was
 * dropped for want of a place to put it.
 */
export function KindleImport() {
  const [books, setBooks] = useState<ClippingBook[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AnchorResult | null>(null);

  const read = async (file: File) => {
    setBusy(true);
    setResult(null);
    try {
      const text = await file.text();
      const found = groupByBook(parseClippings(text));
      if (found.length === 0) {
        toast.error("No Kindle highlights in that file — is it My Clippings.txt?");
        setBooks(null);
        return;
      }
      setBooks(found);
    } catch {
      toast.error("Could not read that file");
    } finally {
      setBusy(false);
    }
  };

  const bring = () => {
    if (!books) return;
    setBusy(true);
    try {
      const outcome = anchorClippings(books, useAppStore.getState());
      setResult(outcome);
      toast.success(
        outcome.anchored > 0
          ? `${outcome.anchored} highlight${outcome.anchored === 1 ? "" : "s"} placed in your books`
          : "Highlights saved",
      );
    } finally {
      setBusy(false);
    }
  };

  const totalHighlights = books?.reduce((sum, book) => sum + book.highlights.length, 0) ?? 0;

  return (
    <section>
      <h2 className="mb-1 text-lg font-medium">Kindle highlights</h2>
      <p className="mb-4 text-sm leading-relaxed text-pretty text-muted">
        Bring the passages you highlighted on a Kindle into NeuroLens.
      </p>

      <div className="rounded-xl bg-surface p-5 shadow-border">
        {!books ? (
          <>
            <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm leading-relaxed text-pretty text-muted marker:text-subtle">
              <li>Connect your Kindle to this computer with its USB cable.</li>
              <li>
                Open the Kindle drive and find the{" "}
                <span className="font-medium text-fg">documents</span> folder.
              </li>
              <li>
                Choose the file called <span className="font-medium text-fg">My Clippings.txt</span>{" "}
                below.
              </li>
            </ol>

            <label className="mt-4 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-fg px-5 text-sm font-semibold text-bg transition-[transform,opacity] duration-150 ease-[var(--ease-out)] hover:opacity-90 active:scale-[0.97]">
              {busy ? (
                <Loader2 size={15} className="animate-spin" aria-hidden />
              ) : (
                <BookMarked size={15} aria-hidden />
              )}
              Choose My Clippings.txt
              <input
                type="file"
                accept=".txt,text/plain"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void read(file);
                  // Cleared so choosing the same file twice still fires.
                  event.target.value = "";
                }}
              />
            </label>
          </>
        ) : result ? (
          <>
            <p className="flex items-center gap-2 text-sm font-medium">
              <Check size={15} className="text-accent" aria-hidden />
              Imported {result.anchored + result.kept} of {totalHighlights} highlights
            </p>
            <ul className="mt-3 flex flex-col gap-1.5 text-sm leading-relaxed text-muted">
              {result.anchored > 0 ? (
                <li>
                  <span className="font-medium text-fg">{result.anchored}</span> placed on the page
                  in {result.matchedBooks} book{result.matchedBooks === 1 ? "" : "s"} you already
                  have.
                </li>
              ) : null}
              {result.kept > 0 ? (
                <li>
                  <span className="font-medium text-fg">{result.kept}</span> saved under Library →
                  Yours → Bookmarks, because those books are not in your library yet.
                </li>
              ) : null}
              {result.notFound > 0 ? (
                <li>
                  <span className="font-medium text-fg">{result.notFound}</span> not matched — your
                  copy of the book is probably a different edition.
                </li>
              ) : null}
            </ul>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => {
                setBooks(null);
                setResult(null);
              }}
            >
              Import another file
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm font-medium">
              {totalHighlights} highlight{totalHighlights === 1 ? "" : "s"} across {books.length}{" "}
              book
              {books.length === 1 ? "" : "s"}
            </p>
            <ul className="mt-3 flex max-h-56 flex-col gap-1 overflow-y-auto">
              {books.slice(0, 40).map((book) => (
                <li key={book.title} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{book.title}</span>
                  <span className="shrink-0 text-xs text-muted">{book.highlights.length}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={bring} disabled={busy}>
                {busy ? "Importing…" : "Import highlights"}
              </Button>
              <Button variant="ghost" onClick={() => setBooks(null)}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
