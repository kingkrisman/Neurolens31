import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  FEATURED_POEMS,
  fetchFeaturedPoem,
  fetchRandomPoems,
  poemToReaderText,
  searchPoems,
  type Poem,
} from "@/lib/poetry";
import { isAbortError, isRemoteError } from "@/lib/remote";
import { announce } from "@/lib/announce";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge, Panel, PanelWell } from "@/components/ui/surfaces";
import { RemoteErrorView, RemoteLoading } from "@/components/remote-state";
import { cn } from "@/lib/utils";

type PoemLoad =
  | { type: "featured"; title: string }
  | { type: "search"; query: string }
  | { type: "random" };

const DEFAULT_LOAD: PoemLoad = { type: "featured", title: "Ozymandias" };

function poemKey(poem: Poem) {
  return `${poem.title}::${poem.author}`;
}

export function PoetryLibrary() {
  const startReading = useAppStore((s) => s.startReading);
  const [query, setQuery] = useState("");
  const [load, setLoad] = useState<PoemLoad>(DEFAULT_LOAD);
  const [poem, setPoem] = useState<Poem | null>(null);
  const [browse, setBrowse] = useState<Poem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<unknown>(null);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    setError(null);
    const request =
      load.type === "featured"
        ? FEATURED_POEMS.find((item) => item.title === load.title) ?? FEATURED_POEMS[0]!
        : null;

    const run = async () => {
      if (load.type === "featured" && request) {
        const next = await fetchFeaturedPoem(request, controller.signal);
        setPoem(next);
        setBrowse([]);
        announce(`Loaded ${next.title} by ${next.author}`);
        return;
      }
      const poems =
        load.type === "search"
          ? await searchPoems(load.query, controller.signal)
          : await fetchRandomPoems(controller.signal);
      setBrowse(poems);
      setPoem(poems[0] ?? null);
      announce(
        load.type === "search"
          ? `Found ${poems.length} poem${poems.length === 1 ? "" : "s"}`
          : `Loaded ${poems.length} poems from PoetryDB`,
      );
    };

    run()
      .then(() => {
        if (!controller.signal.aborted) setStatus("ready");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || isAbortError(err)) return;
        setPoem(null);
        setBrowse([]);
        setStatus("error");
        setError(err);
        announce("Could not load that poem");
      });

    return () => controller.abort();
  }, [load, retryTick]);

  function openPoem(next: Poem) {
    startReading(poemToReaderText(next), {
      title: next.title,
      kind: "poem",
      sourceId: poemKey(next),
    });
  }

  const heading = poem?.title ?? (load.type === "search" ? load.query : "Poetry");
  const emptyMiss = status === "error" && isRemoteError(error) && (error.kind === "empty" || error.kind === "not-found");

  return (
    <div className="space-y-8">
      <form
        className="flex max-w-2xl flex-col gap-3 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          const next = query.trim();
          if (next) setLoad({ type: "search", query: next });
        }}
      >
        <label className="relative flex-1">
          <span className="sr-only">Search poems</span>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ozymandias, Keats, Dickinson"
            aria-label="Search poems by title or author"
          />
        </label>
        <Button type="submit" className="sm:w-32">
          Search
        </Button>
      </form>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xs font-medium tracking-wide text-muted uppercase">Open a poem</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setLoad({ type: "random" })}
          >
            Surprise me
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FEATURED_POEMS.map((item) => {
            const active = load.type === "featured" && load.title === item.title;
            return (
              <button
                key={item.title}
                type="button"
                onClick={() => setLoad({ type: "featured", title: item.title })}
                className={cn(
                  "h-9 rounded-md px-3 text-sm font-medium shadow-border transition-[background-color,transform] duration-[140ms] ease-[var(--ease-out)] active:scale-[0.97]",
                  active ? "bg-fg text-primary-fg" : "bg-surface text-fg hover:bg-fg/6",
                )}
              >
                {item.title === '"Hope" is the thing with feathers' ? "Hope" : item.title.replace(/:.*$/, "")}
              </button>
            );
          })}
        </div>
      </section>

      <Panel>
        <div className="flex items-start justify-between gap-3 px-3 pt-3 pb-2">
          <div>
            <p className="text-xs font-medium tracking-wide text-muted uppercase">
              {poem?.author ?? "PoetryDB"}
            </p>
            <h3 className="mt-1 font-serif text-2xl">{heading}</h3>
          </div>
          <Badge>{load.type === "featured" && load.title === "Ozymandias" ? "Featured" : "Poem"}</Badge>
        </div>
        <PanelWell className="max-h-[32rem] overflow-y-auto px-4 py-5" aria-busy={status === "loading"}>
          {status === "loading" ? (
            <RemoteLoading label={`Loading ${heading}`} lines={8} />
          ) : status === "error" ? (
            <RemoteErrorView
              error={error}
              onRetry={() => setRetryTick((n) => n + 1)}
              hint={
                emptyMiss
                  ? "Try Ozymandias, The Raven, or an author such as Keats."
                  : "PoetryDB may be busy. Retry in a moment."
              }
            />
          ) : poem ? (
            <div className="space-y-1">
              {poem.lines.map((line, index) => (
                <p
                  key={`${poem.title}-${index}`}
                  className={cn("font-serif text-base leading-relaxed", !line.trim() && "h-4")}
                >
                  {line || "\u00a0"}
                </p>
              ))}
            </div>
          ) : null}
        </PanelWell>
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
          <p className="text-xs text-subtle">
            {load.type === "featured" && load.title === "Ozymandias"
              ? "via poetrydb.org/title/Ozymandias/lines.json"
              : "via PoetryDB"}
          </p>
          <Button
            className="pl-4 pr-3.5"
            disabled={!poem}
            onClick={() => {
              if (poem) openPoem(poem);
            }}
          >
            Open in reader
            <ChevronRight size={16} className="icon-motion icon-shift" />
          </Button>
        </div>
      </Panel>

      {browse.length > 1 ? (
        <section>
          <h2 className="mb-3 text-xs font-medium tracking-wide text-muted uppercase">Also in this search</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {browse.slice(1).map((item) => (
              <button
                key={poemKey(item)}
                type="button"
                onClick={() => setPoem(item)}
                className="rounded-xl bg-surface p-2 text-left shadow-border transition-[box-shadow,transform] duration-[150ms] ease-[var(--ease-out)] hover:shadow-border-hover active:scale-[0.99]"
              >
                <span className="block rounded-lg bg-bg px-4 py-4">
                  <span className="block font-medium">{item.title}</span>
                  <span className="mt-1 block text-sm text-muted">{item.author}</span>
                  <span className="mt-3 block line-clamp-2 font-serif text-sm text-muted">
                    {item.lines.filter((line) => line.trim()).slice(0, 2).join(" / ")}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
