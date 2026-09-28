import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronRight, Highlighter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/surfaces";
import { useAppStore } from "@/lib/store";
import { openBook } from "@/lib/sync/open-book";
import { legacyBookKey } from "@/lib/sync/rows";
import { colorById } from "@/lib/highlight-colors";
import { duePassages, localDay, markedAgo, type DuePassage } from "@/lib/resurface";
import { markRetired, markSeen, useReturns } from "@/lib/resurface-store";
import type { Session } from "@/lib/types";

const LATER_KEY = "neurolens-returns-later";

function laterToday(): boolean {
  try {
    return sessionStorage.getItem(LATER_KEY) === localDay(Date.now());
  } catch {
    return false;
  }
}

/**
 * A passage the reader marked, back for a second look.
 *
 * One at a time, a few a day, on the page they already open. Moving on is
 * the whole interaction: "Next" counts it as seen and it returns later, further
 * apart each time. "Not this one" retires it, and the cross puts the card
 * away until tomorrow. Nothing is scored and nothing is owed — see
 * `lib/resurface.ts`.
 */
export function HighlightReturns() {
  const on = useAppStore((s) => s.profile.resurface !== false);
  const highlights = useAppStore((s) => s.highlights);
  const sessions = useAppStore((s) => s.sessions);
  const returns = useReturns();
  // Fixed for the visit, so a card does not change under someone reading it.
  const [now] = useState(() => Date.now());
  const [later, setLater] = useState(laterToday);
  const [finished, setFinished] = useState(false);

  const due = useMemo(() => duePassages(highlights, returns, now), [highlights, returns, now]);
  const books = useMemo(() => {
    const byKey = new Map<string, Session>();
    for (const session of sessions) {
      byKey.set(legacyBookKey(session.content || session.title), session);
    }
    return byKey;
  }, [sessions]);

  if (!on || later) return null;

  const current = due[0];
  if (!current) {
    if (!finished) return null;
    return (
      <Card className="returns-enter mt-10 flex items-center gap-3 px-5 py-4 sm:mt-16" role="status">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
          <Check size={15} aria-hidden />
        </span>
        <p className="text-sm text-muted">
          That is all for today. Each one comes back again, a little further apart.
        </p>
      </Card>
    );
  }

  const today = returns.day === localDay(now) ? returns.shown : 0;
  const position = today + 1;
  const total = today + due.length;
  const book = books.get(current.bookKey) ?? null;
  const canOpen = Boolean(book && (book.content.trim() || book.remoteId));

  const advance = (passage: DuePassage, retire = false) => {
    if (due.length === 1) setFinished(true);
    if (retire) markRetired(passage.id);
    else markSeen(passage.id);
  };

  const open = async () => {
    if (!book) return;
    const { mark } = current;
    advance(current);
    const opened = await openBook(book, {
      title: book.title,
      kind: book.kind,
      sourceId: book.sourceId,
      ...(book.kind === "pdf" ? { pdfPage: mark.section } : { chapter: mark.section }),
    });
    if (!opened) {
      toast.error("Could not fetch that book. Check your connection.");
      return;
    }
    // The reader waits for the section to render before scrolling to it.
    useAppStore.getState().requestJump(mark.section, mark.lineIdx);
  };

  const putAway = () => {
    try {
      sessionStorage.setItem(LATER_KEY, localDay(Date.now()));
    } catch {
      /* private mode — it goes away for this visit only */
    }
    setLater(true);
  };

  const last = due.length === 1;
  const color = colorById(current.mark.color).hex;

  return (
    <Card className="mt-10 px-5 pt-4 pb-5 sm:mt-16 sm:px-7 sm:pt-5 sm:pb-6" aria-labelledby="returns-title">
      <div className="flex items-center justify-between gap-3">
        <h2
          id="returns-title"
          className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted uppercase"
        >
          <Highlighter size={13} className="text-accent" aria-hidden />
          From your highlights
        </h2>
        <div className="-mr-2 flex items-center gap-1">
          {total > 1 ? (
            <span className="text-xs text-subtle tabular-nums">
              {position} of {total}
            </span>
          ) : null}
          <button
            type="button"
            onClick={putAway}
            aria-label="Not today"
            title="Not today"
            className="grid size-9 place-items-center rounded-full text-muted transition-[background-color,color,transform] duration-150 ease-[var(--ease-out)] hover:bg-fg/6 hover:text-fg active:scale-[0.94]"
          >
            <X size={15} aria-hidden />
          </button>
        </div>
      </div>

      <figure key={current.id} className="returns-enter mt-3">
        <blockquote className="border-l-[3px] pl-4" style={{ borderColor: color }}>
          <p className="line-clamp-6 font-serif text-lg leading-relaxed text-pretty sm:text-xl">
            {current.mark.text.replace(/\s+/g, " ").trim()}
          </p>
        </blockquote>
        {current.mark.note ? (
          <p className="mt-2.5 line-clamp-3 pl-[19px] text-sm text-muted italic">
            {current.mark.note}
          </p>
        ) : null}
        <figcaption className="mt-2.5 truncate pl-[19px] text-xs text-muted">
          {book ? <span className="font-medium text-fg/80">{book.title}</span> : null}
          {book ? " · " : null}
          {markedAgo(current.mark.at, now)}
        </figcaption>
      </figure>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button size="sm" className="min-w-20" onClick={() => advance(current)}>
          {last ? "Done" : "Next"}
        </Button>
        {canOpen ? (
          <Button size="sm" variant="outline" className="pr-2" onClick={() => void open()}>
            Open in book
            <ChevronRight size={15} className="icon-motion icon-shift" aria-hidden />
          </Button>
        ) : null}
        <button
          type="button"
          onClick={() => advance(current, true)}
          className="ml-auto min-h-9 rounded-sm px-1 text-xs text-muted underline-offset-2 transition-colors hover:text-fg hover:underline"
        >
          Not this one
        </button>
      </div>
    </Card>
  );
}
