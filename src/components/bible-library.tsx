import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { BIBLE_ATTRIBUTION, BIBLE_BOOKS, BIBLE_PLANS, FEATURED_PASSAGES, findPassage, type BibleBook } from "@/lib/bible";
import {
  BIBLE_TRANSLATIONS,
  DEFAULT_TRANSLATION,
  fetchPassage,
  parseReference,
  passageToReaderText,
  type BiblePassage,
  type BibleRef,
} from "@/lib/bible-api";
import { isAbortError } from "@/lib/remote";
import { announce } from "@/lib/announce";
import { NAMED_PRESETS } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge, Panel, PanelWell } from "@/components/ui/surfaces";
import { Segmented } from "@/components/segmented";
import { RemoteErrorView, RemoteLoading } from "@/components/remote-state";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const JOHN = BIBLE_BOOKS.find((book) => book.name === "John") ?? BIBLE_BOOKS[42]!;

export function BibleLibrary() {
  const startReading = useAppStore((s) => s.startReading);
  const applySavedProfile = useAppStore((s) => s.applySavedProfile);
  const [query, setQuery] = useState("");
  const [testament, setTestament] = useState<"all" | "OT" | "NT">("NT");
  const [book, setBook] = useState<BibleBook>(JOHN);
  const [chapter, setChapter] = useState(3);
  const [verse, setVerse] = useState<string | undefined>(undefined);
  const [translation, setTranslation] = useState(DEFAULT_TRANSLATION.id);
  const [passage, setPassage] = useState<BiblePassage | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<unknown>(null);
  const [retryTick, setRetryTick] = useState(0);

  const spec = BIBLE_TRANSLATIONS.find((item) => item.id === translation) ?? DEFAULT_TRANSLATION;
  const ref: BibleRef = useMemo(
    () => (verse ? { book: book.name, chapter, verse } : { book: book.name, chapter }),
    [book.name, chapter, verse],
  );

  const books = BIBLE_BOOKS.filter((item) => testament === "all" || item.testament === testament);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    setError(null);
    fetchPassage(ref, { signal: controller.signal, translation })
      .then((next) => {
        setPassage(next);
        setStatus("ready");
        announce(`Loaded ${next.reference}, ${next.translationName}`);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || isAbortError(err)) return;
        setPassage(null);
        setStatus("error");
        setError(err);
        announce("Could not load that passage");
      });
    return () => controller.abort();
  }, [ref.book, ref.chapter, ref.verse, translation, retryTick]);

  function selectBook(next: BibleBook) {
    setBook(next);
    setChapter(1);
    setVerse(undefined);
  }

  function selectChapter(next: number) {
    setChapter(next);
    setVerse(undefined);
  }

  function openPassage(next: BiblePassage) {
    startReading(passageToReaderText(next), {
      title: next.reference,
      kind: "bible",
      sourceId: next.reference,
    });
  }

  function lookup(raw: string) {
    const parsed = parseReference(raw);
    if (!parsed) {
      toast("Use a reference like John 3:16 or Psalm 23");
      return;
    }
    const meta = BIBLE_BOOKS.find((item) => item.name === parsed.book);
    if (meta) setBook(meta);
    setChapter(parsed.chapter);
    setVerse(parsed.verse == null ? undefined : String(parsed.verse));
  }

  function openFeatured(id: string) {
    const featured = findPassage(id);
    if (!featured) return;
    const meta = BIBLE_BOOKS.find((item) => item.name === featured.book);
    if (meta) setBook(meta);
    setChapter(featured.chapter);
    setVerse(featured.verse);
  }

  const heading = passage?.reference ?? `${book.name} ${chapter}${verse ? `:${verse}` : ""}`;

  return (
    <div className="space-y-8">
      <form
        className="flex max-w-2xl flex-col gap-3 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          lookup(query);
        }}
      >
        <label className="relative flex-1">
          <span className="sr-only">Bible reference</span>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="John 3:16, Psalm 23, Romans 8"
            aria-label="Bible reference"
          />
        </label>
        <Button type="submit" className="sm:w-32">
          Look up
        </Button>
      </form>

      <section>
        <h2 className="mb-3 text-xs font-medium tracking-wide text-muted uppercase">Translation</h2>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Bible translation">
          {BIBLE_TRANSLATIONS.map((item) => {
            const active = item.id === translation;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTranslation(item.id)}
                className={cn(
                  "h-9 min-h-9 rounded-md px-3 text-sm font-medium shadow-border transition-[background-color,transform] duration-[140ms] ease-[var(--ease-out)] active:scale-[0.97]",
                  active ? "bg-fg text-primary-fg" : "bg-surface text-fg hover:bg-fg/6",
                )}
              >
                {item.short}
                <span className="sr-only"> {item.name}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-subtle">{spec.name}</p>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-medium tracking-wide text-muted uppercase">Open a verse</h2>
        <div className="flex flex-wrap gap-1.5">
          {FEATURED_PASSAGES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => openFeatured(item.id)}
              className={cn(
                "h-9 rounded-md px-3 text-sm font-medium shadow-border transition-[background-color,transform] duration-[140ms] ease-[var(--ease-out)] active:scale-[0.97]",
                book.name === item.book && chapter === item.chapter && verse === item.verse
                  ? "bg-fg text-primary-fg"
                  : "bg-surface text-fg hover:bg-fg/6",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-medium tracking-wide text-muted uppercase">Reading plans</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {BIBLE_PLANS.map((plan) => (
            <Panel key={plan.id}>
              <PanelWell className="px-4 py-4">
                <p className="font-serif text-lg">{plan.name}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">{plan.description}</p>
                <Button
                  className="mt-4 w-full"
                  variant="outline"
                  onClick={() => {
                    const first = plan.chapters[0];
                    if (first) openFeatured(first);
                  }}
                >
                  Begin
                </Button>
              </PanelWell>
            </Panel>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xs font-medium tracking-wide text-muted uppercase">Books</h2>
            <Segmented
              value={testament}
              onChange={setTestament}
              label="Testament"
              options={[
                { id: "all", label: "All" },
                { id: "OT", label: "Old" },
                { id: "NT", label: "New" },
              ]}
            />
          </div>
          <div className="grid max-h-[28rem] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-1">
            {books.map((item) => {
              const active = item.name === book.name;
              return (
                <button
                  key={item.name}
                  type="button"
                  aria-pressed={active}
                  onClick={() => selectBook(item)}
                  className={cn(
                    "rounded-xl bg-surface p-2 text-left shadow-border transition-[box-shadow,transform,background-color] duration-[150ms] ease-[var(--ease-out)] hover:shadow-border-hover active:scale-[0.99]",
                    active && "bg-fg text-primary-fg",
                  )}
                >
                  <span className={cn("block rounded-lg px-3 py-3", active ? "bg-primary-fg/10" : "bg-bg")}>
                    <span className="block font-medium">{item.name}</span>
                    <span className={cn("mt-1 block text-xs", active ? "text-primary-fg/70" : "text-muted")}>
                      {item.chapters} chapter{item.chapters === 1 ? "" : "s"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <Panel>
            <div className="px-3 pt-3 pb-2">
              <p className="text-xs font-medium tracking-wide text-muted uppercase">{book.name}</p>
              <p className="mt-1 font-serif text-2xl">{book.name}</p>
            </div>
            <PanelWell className="max-h-48 overflow-y-auto p-2">
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: book.chapters }, (_, index) => {
                  const n = index + 1;
                  return (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={n === chapter}
                      onClick={() => selectChapter(n)}
                      className={cn(
                        "min-h-11 min-w-11 rounded-md px-2 text-sm tabular-nums",
                        n === chapter ? "bg-fg text-primary-fg" : "text-fg hover:bg-fg/8",
                      )}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </PanelWell>
          </Panel>

          <Panel>
            <div className="flex items-start justify-between gap-3 px-3 pt-3 pb-2">
              <div>
                <p className="text-xs font-medium tracking-wide text-muted uppercase">
                  {passage?.translationName ?? spec.name}
                </p>
                <h3 className="mt-1 font-serif text-2xl">{heading}</h3>
              </div>
              <Badge>{verse ? "Verse" : "Chapter"}</Badge>
            </div>
            <PanelWell className="max-h-[32rem] overflow-y-auto px-4 py-5" aria-busy={status === "loading"}>
              {status === "loading" ? (
                <RemoteLoading label={`Loading ${heading}`} lines={6} />
              ) : status === "error" ? (
                <RemoteErrorView
                  error={error}
                  onRetry={() => setRetryTick((n) => n + 1)}
                  hint="Check the reference, try another translation, or retry in a moment."
                />
              ) : passage ? (
                <div className="space-y-4">
                  {passage.verses.map((item) => (
                    <p key={`${item.chapter}:${item.verse}`} className="flex gap-3 text-base leading-relaxed">
                      <span className="w-7 shrink-0 pt-0.5 text-xs tabular-nums text-muted">{item.verse}</span>
                      <span className="font-serif">{item.text}</span>
                    </p>
                  ))}
                </div>
              ) : null}
            </PanelWell>
            <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
              <p className="text-xs text-subtle">
                {passage?.source === "helloao" ? "via HelloAO" : "via bible-api.com"} · {spec.short}
              </p>
              <Button
                className="pl-4 pr-3.5"
                disabled={!passage}
                onClick={() => {
                  if (passage) openPassage(passage);
                }}
              >
                Open in reader
                <ChevronRight size={16} className="icon-motion icon-shift" />
              </Button>
            </div>
          </Panel>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-xs leading-relaxed text-subtle">{BIBLE_ATTRIBUTION}</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            const preset = NAMED_PRESETS.find((item) => item.id === "bible-study");
            if (preset) applySavedProfile(preset);
          }}
        >
          Use Bible Study profile
        </Button>
      </div>
    </div>
  );
}
