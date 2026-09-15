import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Bookmark,
  FileUp,
  Highlighter,
  Keyboard,
  MessageCircle,
  PenLine,
  Search,
  Sparkles,
  Type,
  UserRound,
  WifiOff,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { DocSection, PublicLayout, Term } from "@/components/public-layout";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/help")({ component: Help });

type Topic = {
  id: string;
  title: string;
  summary: string;
  icon: ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
  /** Words people type when they are looking for this, not just the title. */
  keywords: string;
  body: ReactNode;
};

const SHORTCUTS: Array<[string, string]> = [
  ["⌘ K", "Open the command palette"],
  ["Space", "Start or stop auto-scroll"],
  ["← →", "Previous or next part"],
  ["F", "Find in this book"],
  ["B", "Bookmark this place"],
  ["Esc", "Close whatever is open"],
];

const TOPICS: Topic[] = [
  {
    id: "books",
    title: "Getting a book in",
    summary: "Upload, drag in, or paste.",
    icon: FileUp,
    keywords: "upload file pdf epub word docx html rtf markdown text paste import open drag cloud icloud drive fails",
    body: (
      <>
        <p>
          On the home page, use <Term>Upload</Term> in the Source card, drag a file onto it, or paste
          text straight into the box.
        </p>
        <p>
          NeuroLens reads <Term>PDF</Term>, <Term>EPUB</Term>, <Term>Word</Term>, <Term>HTML</Term>,{" "}
          <Term>RTF</Term>, <Term>Markdown</Term> and plain text — and tries anything else as text
          rather than refusing it. Files up to 20&nbsp;MB.
        </p>
        <p>
          A long PDF takes a moment; the button counts pages while it works. If a page or two cannot
          be read, the rest of the book still opens and you are told how many were skipped.
        </p>
        <Callout>
          A file stored in iCloud or Google Drive has to be downloaded to the device first — the
          browser cannot read a file that is still in the cloud.
        </Callout>
      </>
    ),
  },
  {
    id: "page",
    title: "Making the page easier",
    summary: "Type, spacing, colour and focus.",
    icon: Type,
    keywords: "font typeface size spacing line height theme tint colour color contrast dyslexia opendyslexic mask bionic fixation dark",
    body: (
      <>
        <p>
          Open <Term>Reading options</Term> from the bar at the bottom of the reader. Every change
          applies at once, so you judge it against real text rather than a sample.
        </p>
        <ul>
          <li>
            <Term>Fixation</Term> bolds the start of each word to give the eye a landing point. Turn it
            down if it feels busy.
          </li>
          <li>
            <Term>Typeface</Term> includes OpenDyslexic, Atkinson Hyperlegible and Lexend.
          </li>
          <li>
            <Term>Spacing and line height</Term> often help more than a bigger size.
          </li>
          <li>
            <Term>Theme and tint</Term> reduce glare, with the contrast ratio shown so it stays readable.
          </li>
          <li>
            <Term>Reading mask</Term> dims everything except the line you are on.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "marking",
    title: "Marking what matters",
    summary: "Six colours to sort as you read.",
    icon: Highlighter,
    keywords: "highlight mark colour color note annotate export markdown palette",
    body: (
      <>
        <p>
          <Term>Drag across any phrase</Term> to highlight it. The mark snaps to whole words, so there
          is no need to be precise.
        </p>
        <p>
          The highlighter button in the bottom bar holds six colours — one for the point, one for a
          doubt, one for something to look up. The dot on the button shows the colour loaded.
        </p>
        <p>
          <Term>Show highlights</Term> lists every mark: jump to one, add a note, change its colour,
          or export them all as Markdown.
        </p>
      </>
    ),
  },
  {
    id: "drawing",
    title: "Drawing on the page",
    summary: "Pen, marker, pencil, eraser.",
    icon: PenLine,
    keywords: "draw pen pencil stylus apple pencil ink circle underline eraser undo",
    body: (
      <>
        <p>
          Choose <Term>Draw on the page</Term> from the highlighter menu for a pen, marker, pencil and
          eraser, with undo and clear.
        </p>
        <p>
          <Term>A stylus just draws</Term> — an Apple Pencil draws the moment it touches the page, and
          your finger still scrolls. With a mouse or finger, turn drawing on first.
        </p>
        <p>
          Drawings are pinned to the line they were drawn on, so they move with the text when the type
          size changes.
        </p>
      </>
    ),
  },
  {
    id: "adaptive",
    title: "Reading that adapts",
    summary: "Suggestions when the page fights you.",
    icon: Sparkles,
    keywords: "adaptive suggestion pace pause reread insights lock setting",
    body: (
      <>
        <p>
          In <Term>Adaptive</Term> mode NeuroLens notices pace, pauses and re-reads, and suggests a
          change when the page seems to be working against you. Suggestions are offered, never applied
          behind your back.
        </p>
        <p>
          Lock any setting you do not want touched. <Term>Insights</Term> shows what it has noticed.
        </p>
      </>
    ),
  },
  {
    id: "place",
    title: "Finding your place again",
    summary: "Continue, bookmarks and parts.",
    icon: Bookmark,
    keywords: "resume continue bookmark place position part chapter where left off",
    body: (
      <>
        <p>
          The home page offers <Term>Continue</Term> with the part you were in and roughly how long is
          left, and returns you to the exact spot.
        </p>
        <p>
          <Term>Bookmarks</Term> save a place on purpose. Long books are split into parts, so a chapter
          is never an endless scroll.
        </p>
      </>
    ),
  },
  {
    id: "offline",
    title: "Reading offline",
    summary: "Your books stay on this device.",
    icon: WifiOff,
    keywords: "offline storage space lost library device full",
    body: (
      <>
        <p>
          An open book stays on your device, so you can read it with no connection. Uploaded documents
          never leave your browser.
        </p>
        <p>
          Browsers limit storage, so a very large library may drop the oldest books. Download anything
          you want to keep from <Link to="/account">your account</Link>.
        </p>
      </>
    ),
  },
  {
    id: "account",
    title: "Your account and privacy",
    summary: "Avatar, analytics, your data.",
    icon: UserRound,
    keywords: "account sign in google apple avatar customise analytics privacy download erase delete data",
    body: (
      <>
        <p>
          Sign in with <Term>Google</Term> or <Term>Apple</Term> — there is no password. In{" "}
          <Link to="/account">your account</Link> you can pick an avatar style, shuffle it, and choose a
          background.
        </p>
        <p>
          Usage analytics is <Term>off until you switch it on</Term>, and never includes your name,
          email, or anything you read. The account page shows every event it has recorded.
        </p>
        <p>
          <Term>Download everything</Term> or <Term>Erase everything</Term> at any time, with no request
          needed.
        </p>
      </>
    ),
  },
  {
    id: "keys",
    title: "Keyboard shortcuts",
    summary: "Move without the mouse.",
    icon: Keyboard,
    keywords: "keyboard shortcut keys hotkey command palette",
    body: (
      <dl className="grid overflow-hidden rounded-2xl bg-surface shadow-border sm:grid-cols-2">
        {SHORTCUTS.map(([keys, what]) => (
          <div key={keys} className="flex items-center justify-between gap-4 border-b border-fg/6 px-5 py-3.5 last:border-b-0">
            <dd className="text-sm text-muted">{what}</dd>
            <dt>
              <kbd className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-bg px-2 font-mono text-xs text-fg shadow-border">
                {keys}
              </kbd>
            </dt>
          </div>
        ))}
      </dl>
    ),
  },
];

function normalise(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

/**
 * Help, organised around what people are trying to do.
 *
 * Someone opens a help page because something did not happen the way they
 * expected. So it leads with a search that understands the words they will
 * actually type — "icloud", "dyslexia", "pencil" — rather than a list of
 * features, and every topic is a short answer rather than a tour.
 */
function Help() {
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const visible = useMemo(() => {
    const terms = normalise(query).split(/\s+/).filter(Boolean);
    if (!terms.length) return TOPICS;
    return TOPICS.filter((topic) => {
      const haystack = normalise(`${topic.title} ${topic.summary} ${topic.keywords}`);
      return terms.every((term) => haystack.includes(term));
    });
  }, [query]);

  // "/" focuses search, the way it does on most documentation sites. No
  // animation: a shortcut is used too often to be made to wait.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (event.key === "/" && !typing) {
        event.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <PublicLayout
      eyebrow="Help"
      title="How can we help?"
      lead="Short answers to what you are trying to do. Search for it in your own words, or pick a topic."
      toc={visible.map((topic) => ({ id: topic.id, label: topic.title }))}
      // The topic cards already are the contents on a phone; chips above them
      // would list the same nine things twice in one screen.
      mobileToc={false}
      aside={<StillStuck />}
    >
      <div className="space-y-6">
        <label htmlFor="help-search" className="sr-only">
          Search help
        </label>
        <div className="group relative">
          <Search
            size={18}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-5 -translate-y-1/2 text-subtle transition-colors duration-200 group-focus-within:text-fg"
          />
          <input
            ref={input}
            id="help-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try “icloud” or “pencil”"
            autoComplete="off"
            className={cn(
              "h-14 w-full rounded-2xl bg-surface pr-24 pl-13 text-base text-fg shadow-float placeholder:text-subtle",
              "transition-[box-shadow] duration-200 ease-[var(--ease-out)]",
              "focus:shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-fg)_22%,transparent),0_12px_32px_-12px_rgba(22,22,21,0.22)] focus:outline-none",
              "[&::-webkit-search-cancel-button]:hidden",
            )}
          />
          <div className="absolute top-1/2 right-4 flex -translate-y-1/2 items-center gap-2">
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  input.current?.focus();
                }}
                aria-label="Clear search"
                className="grid size-8 place-items-center rounded-full text-muted transition-[background-color,transform] duration-150 hover:bg-fg/6 active:scale-[0.94]"
              >
                <X size={15} aria-hidden />
              </button>
            ) : (
              <kbd className="hidden h-6 items-center rounded-md bg-bg px-2 font-mono text-[11px] text-subtle shadow-border sm:inline-flex">
                /
              </kbd>
            )}
          </div>
        </div>

        <p role="status" className="text-sm text-subtle">
          {query
            ? visible.length
              ? `${visible.length} ${visible.length === 1 ? "topic matches" : "topics match"}`
              : "Nothing matches that yet."
            : `${TOPICS.length} topics`}
        </p>

        {visible.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map(({ id, title, summary, icon: Icon }) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className={cn(
                    "group flex h-full items-start gap-4 rounded-2xl bg-surface p-5 shadow-border",
                    "transition-[box-shadow,transform] duration-200 ease-[var(--ease-out)]",
                    "hover:shadow-[0_0_0_1px_rgba(22,22,21,0.07),0_14px_30px_-16px_rgba(22,22,21,0.28)] active:scale-[0.985]",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
                  )}
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent transition-transform duration-300 ease-[var(--ease-out)] group-hover:-rotate-3">
                    <Icon size={18} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold tracking-[-0.01em] text-fg">{title}</span>
                    <span className="mt-1 block text-sm leading-snug text-muted">{summary}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-2xl bg-surface p-6 shadow-border">
            <p className="text-[15px] font-semibold text-fg">No topic covers that yet.</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              Tell us what you were looking for and it will be answered — and added here.
            </p>
            <Link
              to="/support"
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-fg px-5 text-sm font-medium text-bg transition-transform duration-150 active:scale-[0.97]"
            >
              <MessageCircle size={15} aria-hidden />
              Ask support
            </Link>
          </div>
        )}
      </div>

      {visible.map((topic) => (
        <DocSection key={topic.id} id={topic.id} title={topic.title}>
          {topic.body}
        </DocSection>
      ))}

      <div className="lg:hidden">
        <StillStuck />
      </div>
    </PublicLayout>
  );
}

function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border-l-2 border-accent/50 bg-accent/5 px-4 py-3 text-sm leading-relaxed text-muted">
      {children}
    </div>
  );
}

function StillStuck() {
  return (
    <div className="rounded-2xl bg-surface p-5 shadow-border">
      <p className="text-sm font-semibold text-fg">Still stuck?</p>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">
        Say what you were doing and what happened instead. That is usually enough.
      </p>
      <Link
        to="/support"
        className="mt-4 inline-flex h-9 items-center gap-2 rounded-full bg-fg px-4 text-sm font-medium text-bg transition-transform duration-150 active:scale-[0.97]"
      >
        <MessageCircle size={14} aria-hidden />
        Contact support
      </Link>
    </div>
  );
}
