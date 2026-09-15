import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Mark } from "@/components/mark";
import { Media } from "@/components/ui/surfaces";
import { useScrollReveal } from "@/components/doc/use-scroll-reveal";
import { cn } from "@/lib/utils";

export type TocItem = { id: string; label: string };

const RELATED = [
  { to: "/help", label: "Help" },
  { to: "/support", label: "Support" },
  { to: "/privacy", label: "Privacy" },
  { to: "/terms", label: "Terms" },
  { to: "/accessibility", label: "Accessibility" },
  { to: "/whats-new", label: "What's new" },
] as const;

/**
 * The frame every document page sits in: Help, Support, Privacy, Terms,
 * Accessibility, What's new.
 *
 * Designed as a place to read, not a place to pass through. A translucent header
 * that the page scrolls beneath, with a hairline that fills as you read; a large
 * display title set tight, the way type wants to be set when it is big; and,
 * when the page is long enough to need one, a contents list that follows you
 * down the page and marks where you are.
 */
export function PublicLayout({
  eyebrow,
  title,
  lead,
  meta,
  image,
  imageAlt = "",
  toc,
  aside,
  wide = false,
  mobileToc = true,
  children,
}: {
  eyebrow: string;
  title: string;
  lead?: ReactNode;
  meta?: ReactNode;
  image?: string;
  imageAlt?: string;
  toc?: TocItem[];
  /** Extra material under the contents list on wide screens. */
  aside?: ReactNode;
  /** Use the full content width — for layouts with their own columns. */
  wide?: boolean;
  /** Show the contents chips on small screens. Off where the page already lists its topics. */
  mobileToc?: boolean;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  useScrollReveal(root, title);

  return (
    <div ref={root} className="min-h-dvh bg-bg text-fg">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <div className="grain" aria-hidden />

      <DocHeader label={eyebrow} />

      <main id="main-content" tabIndex={-1} className="outline-none">
        <header className="mx-auto max-w-6xl px-5 pt-14 pb-10 sm:px-8 sm:pt-20 sm:pb-14">
          <div className="max-w-3xl">
            <p data-reveal className="doc-eyebrow">
              {eyebrow}
            </p>
            <h1 data-reveal className="doc-display mt-4">
              {title}
            </h1>
            {lead ? (
              <p data-reveal className="mt-6 max-w-[56ch] text-lg leading-relaxed text-muted text-pretty">
                {lead}
              </p>
            ) : null}
            {meta ? (
              <div data-reveal className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-subtle">
                {meta}
              </div>
            ) : null}
          </div>

          {image ? (
            <figure data-reveal="media" className="doc-hero-media mt-12 overflow-hidden rounded-3xl bg-surface">
              <Media
                src={image}
                alt={imageAlt}
                width={1600}
                height={800}
                className="aspect-[16/9] w-full object-cover sm:aspect-[21/9]"
              />
            </figure>
          ) : null}
        </header>

        <div
          className={cn(
            "mx-auto max-w-6xl px-5 pb-24 sm:px-8",
            toc?.length && "lg:grid lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-20",
          )}
        >
          {toc?.length ? (
            <>
              {mobileToc ? <MobileToc items={toc} /> : null}
              <aside className="hidden lg:block">
                <div className="sticky top-28">
                  <DesktopToc items={toc} />
                  {aside ? <div className="mt-10">{aside}</div> : null}
                </div>
              </aside>
            </>
          ) : null}

          <div className={cn("min-w-0", !toc?.length && !wide && "max-w-3xl")}>
            <div data-reveal-children className="doc-body">
              {children}
            </div>

            <footer data-reveal className="mt-20 border-t border-fg/10 pt-8">
              <p className="doc-eyebrow">Keep going</p>
              <nav aria-label="Related pages" className="mt-4 flex flex-wrap gap-2">
                {RELATED.map((item) => (
                  <RelatedLink key={item.to} to={item.to} label={item.label} />
                ))}
              </nav>
              <Link
                to="/"
                className="group mt-8 inline-flex items-center gap-2 text-sm font-medium text-fg"
              >
                <ArrowLeft
                  size={15}
                  aria-hidden
                  className="transition-transform duration-200 ease-[var(--ease-out)] group-hover:-translate-x-0.5"
                />
                Back to NeuroLens
              </Link>
            </footer>
          </div>
        </div>
      </main>
    </div>
  );
}

function RelatedLink({ to, label }: { to: string; label: string }) {
  const here = useRouterState({ select: (state) => state.location.pathname });
  const current = here === to;
  return (
    <Link
      to={to}
      aria-current={current ? "page" : undefined}
      className={cn(
        "group inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm",
        "transition-[background-color,color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
        current ? "bg-fg text-bg" : "bg-surface text-fg shadow-border hover:bg-fg/5",
      )}
    >
      {label}
      {current ? null : (
        <ArrowUpRight
          size={13}
          aria-hidden
          className="opacity-40 transition-[opacity,transform] duration-200 ease-[var(--ease-out)] group-hover:translate-x-px group-hover:-translate-y-px group-hover:opacity-80"
        />
      )}
    </Link>
  );
}

/**
 * Translucent chrome with a reading-progress hairline.
 *
 * No border while the page is at the top — a divider under a header with
 * nothing beneath it is noise. It appears only once content actually slides
 * under the glass, which is the only moment separation is needed.
 */
function DocHeader({ label }: { label: string }) {
  const bar = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      // transform, not width: the hairline repaints on the compositor, so it
      // keeps pace with a fast scroll instead of lagging a frame behind.
      if (bar.current) bar.current.style.transform = `scaleX(${progress})`;
      setScrolled(window.scrollY > 16);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <header data-scrolled={scrolled || undefined} className="doc-header sticky top-0 z-40">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link
          to="/"
          aria-label="NeuroLens home"
          className="flex items-center gap-2.5 rounded-md transition-transform duration-150 active:scale-[0.97]"
        >
          <Mark detail className="size-9 text-fg" />
          <span className="text-sm font-semibold tracking-[-0.01em]">NeuroLens</span>
        </Link>

        <span
          aria-hidden
          className={cn(
            "hidden text-sm text-muted transition-[opacity,transform] duration-300 ease-[var(--ease-out)] sm:block",
            scrolled ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
          )}
        >
          {label}
        </span>

        <Link
          to="/"
          className="inline-flex h-9 items-center rounded-full bg-fg px-4 text-sm font-medium text-bg transition-[transform,opacity] duration-150 ease-[var(--ease-out)] hover:opacity-90 active:scale-[0.97]"
        >
          Open reader
        </Link>
      </div>
      <div
        ref={bar}
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-px origin-left bg-fg/40"
        style={{ transform: "scaleX(0)" }}
      />
    </header>
  );
}

/** Which section is in view, from the top of the reading area. */
function useActiveSection(items: TocItem[]): string | undefined {
  const [active, setActive] = useState(items[0]?.id);
  const signature = items.map((item) => item.id).join("|");

  useEffect(() => {
    const targets = signature
      .split("|")
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (!targets.length || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const inView = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (inView[0]) setActive(inView[0].target.id);
      },
      // A band a little below the header: the section you are reading is the
      // one crossing it, not the one whose last line is still on screen.
      { rootMargin: "-18% 0px -70% 0px" },
    );
    for (const target of targets) observer.observe(target);
    return () => observer.disconnect();
  }, [signature]);

  return active;
}

function DesktopToc({ items }: { items: TocItem[] }) {
  const active = useActiveSection(items);
  return (
    <nav aria-label="On this page">
      <p className="doc-eyebrow">On this page</p>
      <ul className="mt-4 space-y-0.5 border-l border-fg/10">
        {items.map((item) => {
          const current = item.id === active;
          return (
            <li key={item.id} className="relative">
              <span
                aria-hidden
                className={cn(
                  "absolute top-1.5 bottom-1.5 -left-px w-px bg-fg transition-transform duration-300 ease-[var(--ease-out)]",
                  current ? "scale-y-100" : "scale-y-0",
                )}
              />
              <a
                href={`#${item.id}`}
                aria-current={current ? "location" : undefined}
                className={cn(
                  "block py-1.5 pl-4 text-sm leading-snug transition-colors duration-200",
                  current ? "font-medium text-fg" : "text-muted hover:text-fg",
                )}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function MobileToc({ items }: { items: TocItem[] }) {
  const active = useActiveSection(items);
  return (
    <nav aria-label="On this page" className="-mx-5 mb-10 lg:hidden">
      <ul className="flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
        {items.map((item) => {
          const current = item.id === active;
          return (
            <li key={item.id} className="shrink-0">
              <a
                href={`#${item.id}`}
                aria-current={current ? "location" : undefined}
                className={cn(
                  "inline-flex h-9 items-center rounded-full px-4 text-sm transition-colors duration-200",
                  current ? "bg-fg text-bg" : "bg-surface text-muted shadow-border",
                )}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** A titled section of a document page. */
export function DocSection({
  id,
  title,
  kicker,
  children,
}: {
  id: string;
  title: string;
  kicker?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="doc-section scroll-mt-28">
      {kicker ? <p className="doc-eyebrow">{kicker}</p> : null}
      <h2 className="doc-h2 mt-2">{title}</h2>
      <div className="doc-prose mt-5">{children}</div>
    </section>
  );
}

/** The "at a glance" summary that opens a long document. */
export function Glance({
  items,
}: {
  items: Array<{ icon: ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>; title: string; body: string }>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map(({ icon: Icon, title, body }) => (
        <div key={title} className="rounded-2xl bg-surface p-5 shadow-border">
          <span className="grid size-9 place-items-center rounded-full bg-accent/10 text-accent">
            <Icon size={16} aria-hidden />
          </span>
          <p className="mt-4 text-[15px] font-semibold tracking-[-0.01em] text-fg">{title}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
        </div>
      ))}
    </div>
  );
}

/** A plain, well-set term — a control named the way it appears on screen. */
export function Term({ children }: { children: ReactNode }) {
  return <span className="font-medium text-fg">{children}</span>;
}
