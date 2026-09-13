import { useState, useEffect, useMemo, useRef, type MouseEvent } from "react";
import { useInView } from "@/lib/use-in-view";
import { describePart, describeTimeLeft, positionOf, resumeTarget } from "@/lib/reading-position";
import { useReducedMotion } from "@/lib/prefers-reduced-motion";
import { toast } from "sonner";
import { ChevronRight } from "lucide-react";
import { processBionicText } from "@/lib/bionic";
import { processDocument } from "@/lib/document-processor";
import { DEMO_SENTENCE, SAMPLE_TEXTS } from "@/lib/samples";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Badge, Card, Media } from "@/components/ui/surfaces";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Segmented } from "@/components/segmented";
import { Reveal } from "@/components/reveal";
import { HeroTitle } from "@/components/hero-title";
import { ParallaxHero } from "@/components/parallax-hero";
import { FileDrop } from "@/components/file-drop";
import { AccessibleBionic } from "@/components/accessible-bionic";
import { PatternExplorer } from "@/components/pattern-panel";
import { GsapCount, Magnetic, ScrollScene, StaggerBlock } from "@/components/gsap-motion";
import { scrollToId } from "@/lib/gsap";
import { cn } from "@/lib/utils";
import { markStarted } from "@/components/reading-coach";

const FEATURES = [
  {
    image: "/images/hands.jpg",
    alt: "Hands turning a paperback beside a terracotta mug",
    index: "01",
    title: "Adaptive formatting",
    text: "Emphasis, spacing, type, and contrast that make dense pages easier to enter.",
  },
  {
    image: "/images/feature-focus.jpg",
    alt: "A beam of window light falling across an open book",
    index: "02",
    title: "Focus-friendly rhythm",
    text: "Visual anchors that keep your eyes on the line without losing the thread.",
  },
  {
    image: "/images/feature-books.jpg",
    alt: "Clothbound books beside a closed tablet on a linen table",
    index: "03",
    title: "Read your way",
    text: "Paste text, open a PDF, look up a Bible chapter, or read a poem.",
  },
] as const;

const START_MODES = [
  { id: "default" as const, label: "Standard", hint: "A calm page, nothing extra." },
  { id: "adhd" as const, label: "ADHD", hint: "Stronger fixation, quieter chrome." },
  { id: "dyslexia" as const, label: "Dyslexia", hint: "Plain words, more space, distinct letters." },
];

function FirstStart() {
  const setMode = useAppStore((s) => s.setMode);

  return (
    <Card className="first-start mt-16 p-5 sm:p-6">
      <p className="font-medium">How should the first page feel?</p>
      <p className="mt-1 text-sm leading-relaxed text-pretty text-muted">
        One choice. You can change it later. Nothing else is required.
      </p>
      <div className="mt-4 grid gap-1.5 sm:grid-cols-3">
        {START_MODES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setMode(item.id);
              markStarted();
            }}
            className="flex min-h-11 min-w-0 flex-col items-start justify-center rounded-md bg-fg/4 px-3 py-3 text-left hover:bg-fg/8"
          >
            <span className="text-sm font-medium">{item.label}</span>
            <span className="mt-0.5 text-xs leading-snug text-pretty text-muted">{item.hint}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

export function Landing() {
  const startReading = useAppStore((s) => s.startReading);
  const sessions = useAppStore((s) => s.sessions);
  const [input, setInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [meta, setMeta] = useState<{ title: string; format: string; wordCount: number; readTime: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const targetWpm = useAppStore((s) => s.targetWpm);

  /**
   * The book to offer, if there is one worth offering.
   *
   * Deliberately picky. A session opened and abandoned inside a few seconds is
   * not something anyone wants to be shown on their next visit, and a book
   * already finished is worse — being invited to continue something you
   * completed reads as the app not having noticed.
   */
  const resumable = useMemo(() => {
    // Something actually started and not yet finished. A session abandoned in
    // the first seconds is not worth offering back, and being invited to
    // continue a book you completed reads as the app not having noticed.
    const latest = sessions.find(
      (item) => ((item.progress ?? 0) > 0.01 || (item.section ?? 0) > 1) && item.content.trim(),
    );
    if (!latest) return null;
    const position = positionOf(latest, targetWpm);
    if (position.finished) return null;

    // Describe the destination, not the last known position — the two differ
    // for a part the reader finished without turning the page, and a button
    // that names one place and opens another is worse than no button.
    const target = resumeTarget(position);
    const position2 = positionOf({ ...latest, section: target.part, progress: target.within }, targetWpm);
    const detail = [describePart(position2), describeTimeLeft(position2)]
      .filter(Boolean)
      .join(" · ");
    return { session: latest, detail, target };
  }, [sessions, targetWpm]);

  const [demoBionic, setDemoBionic] = useState(true);
  // Once the visitor works the toggle themselves, the demo stops driving it.
  // Something that keeps moving after you have taken hold of it is a fight,
  // not a demonstration.
  const [demoTaken, setDemoTaken] = useState(false);
  const demoRef = useRef<HTMLDivElement>(null);
  const demoInView = useInView(demoRef, { once: false, rootMargin: "0px" });
  const reduceMotion = useReducedMotion();

  /**
   * Let the fixation preview demonstrate itself.
   *
   * This card carries the whole idea of the product and it sat still until
   * somebody clicked it, which meant the one thing worth watching on the page
   * never moved. Cycling it turns the hero from a description of adaptive
   * formatting into a showing of it.
   *
   * Deliberately slow. At four seconds a pass the change registers as the text
   * re-setting itself rather than as a flicker demanding attention — which
   * matters more than usual for the readers this is built for. It runs only
   * while the card is actually on screen, stops for good once the visitor takes
   * the control, and never starts under reduced motion.
   */
  useEffect(() => {
    if (demoTaken || reduceMotion || !demoInView) return;
    const timer = window.setInterval(() => setDemoBionic((on) => !on), 4000);
    return () => window.clearInterval(timer);
  }, [demoTaken, reduceMotion, demoInView]);
  // The floating mobile CTA is a stand-in for the hero button. While the real
  // one is on screen it is pure duplication — and it sat on top of the preview
  // card — so it only rides in once the hero button has scrolled away.
  const [heroCtaGone, setHeroCtaGone] = useState(false);

  useEffect(() => {
    const cta = document.getElementById("hero-cta");
    if (!cta || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setHeroCtaGone(!entry?.isIntersecting),
      { rootMargin: "-8px 0px 0px 0px" },
    );
    observer.observe(cta);
    return () => observer.disconnect();
  }, []);

  async function onUpload(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const doc = await processDocument(file);
      setInput(doc.content);
      setMeta({
        title: doc.title,
        format: doc.metadata.format,
        wordCount: doc.metadata.wordCount,
        readTime: doc.metadata.estimatedReadTime,
      });
      toast.success("Document ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that file.");
      toast.error(err instanceof Error ? err.message : "Could not read that file");
    } finally {
      setUploading(false);
    }
  }

  function onInPageNav(event: MouseEvent<HTMLDivElement>) {
    const link = (event.target as HTMLElement).closest("a[href^='#']");
    if (!(link instanceof HTMLAnchorElement) || !link.hash) return;
    const id = decodeURIComponent(link.hash.slice(1));
    if (!id || !document.getElementById(id)) return;
    event.preventDefault();
    scrollToId(id);
  }

  return (
    <div className="flex min-h-full flex-col pb-24 sm:pb-16" onClick={onInPageNav}>
      <ParallaxHero>
        {/* Full-bleed: no max-width cage, so the hero spans the viewport and the
            artwork behind it is framed by the copy rather than by a centred
            column floating in it. Padding scales with the viewport instead, so
            the text still stops short of the edge on a wide display.
            `flex-1` on the copy column only applies in the lg row layout — in
            the stacked layout it grew to eat the container's min-height and
            opened a dead gap between the buttons and the preview card. */}
        <div className="flex min-h-[min(78vh,44rem)] w-full flex-col justify-end gap-8 px-5 pt-[5.5rem] pb-10 sm:min-h-[min(84vh,50rem)] sm:gap-10 sm:px-10 sm:pt-28 sm:pb-14 lg:min-h-[min(92vh,56rem)] lg:flex-row lg:items-end lg:gap-16 lg:px-14 xl:px-20">
          <div className="min-w-0 lg:flex-1">
            <StaggerBlock>
              <p className="mb-4 font-serif text-base text-accent italic">Adaptive reading</p>
            </StaggerBlock>
            <HeroTitle />
            <StaggerBlock delay={160} className="mt-5 max-w-prose text-base leading-relaxed text-pretty text-muted sm:text-lg">
              Formatting that follows your attention. Less visual friction, stronger fixation, a calmer page.
            </StaggerBlock>
            <StaggerBlock delay={220} className="mt-8 flex flex-col gap-3 sm:flex-row">
              {resumable ? (
                <>
                  {/* The primary action, in the place the primary action was
                      already. A returning reader should not be shown a pitch —
                      and should not have to cross the Library and pick out of a
                      list to reach the thing they were part way through.
                      Starting is the hardest part; this is the whole feature. */}
                  <Button
                    // `h-auto` because the base Button is a fixed-height,
                    // nowrap row and this one carries two lines. The width cap
                    // is what keeps a book with a long title from stretching
                    // the button across the hero.
                    className="h-auto min-h-11 w-full max-w-full py-2 pl-4 pr-3 text-left sm:w-auto sm:max-w-80"
                    onClick={() => {
                      startReading(resumable.session.content, {
                        title: resumable.session.title,
                        kind: resumable.session.kind,
                        sourceId: resumable.session.sourceId,
                        // Both coordinates. `progress` is a scroll fraction of
                        // one section, so it needs the section to mean anything
                        // — sending it alone reopened Part 1 while the button
                        // said Part 2, the kind of small lie that costs a reader
                        // their place and their trust in the number.
                        ...(resumable.session.kind === "pdf"
                          ? { pdfPage: resumable.target.part }
                          : { chapter: resumable.target.part }),
                        progress: resumable.target.within,
                      });
                    }}
                  >
                    {/* `min-w-0` on the column and `w-full` on each line are
                        both required for truncation: without them the text sets
                        the flex basis and overflows instead of clipping. */}
                    <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                      <span className="w-full truncate">Continue · {resumable.session.title}</span>
                      {resumable.detail ? (
                        <span className="w-full truncate text-xs font-normal opacity-75">
                          {resumable.detail}
                        </span>
                      ) : null}
                    </span>
                    <ChevronRight size={16} className="shrink-0 icon-motion icon-shift" />
                  </Button>
                  <Button asChild variant="outline" className="min-w-44 bg-surface/80">
                    <a id="hero-cta" href="#reader-start">
                      Start something new
                    </a>
                  </Button>
                </>
              ) : (
                <>
                  <Button asChild className="min-w-44 pl-4 pr-3.5">
                    <a id="hero-cta" href="#reader-start">
                      Start reading
                      <ChevronRight size={16} className="icon-motion icon-shift" />
                    </a>
                  </Button>
                  <Button asChild variant="outline" className="min-w-44 bg-surface/80">
                    <a href="#how-it-works">See how it works</a>
                  </Button>
                </>
              )}
            </StaggerBlock>
          </div>

          <div ref={demoRef} className="relative w-full min-w-0 pb-4 lg:w-[38%] lg:max-w-xl lg:shrink-0 lg:pb-0">
            <Card className="material-surface overflow-hidden p-4 sm:p-5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="font-serif text-sm text-accent italic">Fixation</span>
                <Segmented
                  value={demoBionic ? "bionic" : "standard"}
                  onChange={(id) => {
                    setDemoTaken(true);
                    setDemoBionic(id === "bionic");
                  }}
                  label="Fixation preview"
                  options={[
                    { id: "bionic", label: "Bionic" },
                    { id: "standard", label: "Standard" },
                  ]}
                  className="w-max shrink-0"
                />
              </div>
              <StaggerBlock delay={80}>
              <p
                key={demoBionic ? "bionic" : "standard"}
                className="nl-demo-swap text-left text-sm leading-relaxed sm:text-base"
              >
                {demoBionic ? (
                  <AccessibleBionic text={DEMO_SENTENCE} html={processBionicText(DEMO_SENTENCE, 0.55, true)} />
                ) : (
                  DEMO_SENTENCE
                )}
              </p>
              </StaggerBlock>
            </Card>
          </div>
        </div>
      </ParallaxHero>

      <div className="mx-auto flex w-full max-w-6xl flex-col px-4 sm:px-6">
      <ScrollScene>
      <Reveal>
      <Card className="relative mt-10 overflow-hidden p-0 sm:mt-16">
        <Media
          src="/images/reading-room.jpg"
          alt="A sunlit university reading room with walnut shelves"
          width={1600}
          height={900}
          data-scrub
          className="aspect-[16/9] w-full object-cover parallax-entry sm:aspect-[21/9]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-fg/80 to-fg/15" />
        <div className="absolute inset-0 flex flex-col justify-end gap-6 p-5 text-primary-fg sm:flex-row sm:items-end sm:justify-between sm:p-8">
          <p className="max-w-sm font-serif text-2xl leading-snug italic sm:text-3xl">
            Built for the way attention actually works.
          </p>
          <div className="flex gap-8">
            <div>
              <p className="font-serif text-4xl tracking-tight">
                <GsapCount value={92} suffix="%" />
              </p>
              <p className="mt-1 text-xs text-primary-fg/70">Focus gain</p>
            </div>
            <div>
              <p className="font-serif text-4xl tracking-tight">
                <GsapCount value={40} suffix="%" />
              </p>
              <p className="mt-1 text-xs text-primary-fg/70">Less fatigue</p>
            </div>
          </div>
        </div>
      </Card>
      </Reveal>

      <Reveal>
      <FirstStart />
      <div id="reader-start" className="snap-block mt-16 grid gap-6 md:grid-cols-2">
        <Card
          className="flex min-h-[26rem] flex-col p-5 sm:p-6"
          onDragOver={(event) => {
            if (event.dataTransfer && [...event.dataTransfer.types].includes("Files")) event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            void onUpload(event.dataTransfer?.files?.[0]);
          }}
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="font-serif text-sm text-accent italic">Source</span>
            <FileDrop compact busy={uploading} onFile={(file) => void onUpload(file)} />
          </div>
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Paste an article, essay, or chapter…"
            className="flex-1"
            aria-label="Text to read"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "upload-error" : undefined}
          />
          {meta && (
            <div className="mt-4 rounded-md bg-fg/4 px-3 py-2 text-xs text-muted">
              <span className="font-medium text-fg">{meta.title}</span>
              <span className="mx-2 text-subtle">·</span>
              {meta.format} · {meta.wordCount.toLocaleString()} words · ~{meta.readTime} min
            </div>
          )}
          <Button
            className="mt-5 w-full pl-4 pr-3.5"
            disabled={!(input.trim() || meta?.format === "PDF")}
            onClick={() =>
              startReading(input, meta ? { title: meta.title, kind: meta.format === "PDF" ? "pdf" : "text" } : undefined)
            }
          >
            Open in reader
            <ChevronRight size={16} className="icon-motion icon-shift" />
          </Button>
          {error && (
            <p id="upload-error" role="alert" className="mt-3 text-xs text-danger">
              {error}
            </p>
          )}
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="mb-4 font-serif text-xl italic">Try a passage</h2>
          <div className="space-y-2">
            {SAMPLE_TEXTS.map((sample) => (
              <button
                key={sample.title}
                type="button"
                data-batch
                onClick={() => setInput(sample.text)}
                className="group flex w-full items-start gap-3 rounded-md p-2 text-left transition-[background-color] duration-[150ms] ease-[var(--ease-standard)] hover:bg-fg/4 active:scale-[0.97]"
              >
                <Media
                  src={sample.image}
                  alt=""
                  width={120}
                  height={160}
                  className="h-16 w-12 shrink-0 rounded-sm object-cover"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{sample.title}</span>
                  <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
                    {sample.text}
                  </span>
                </span>
                <ChevronRight
                  size={14}
                  className="mt-1 shrink-0 text-subtle icon-motion icon-shift"
                />
              </button>
            ))}
          </div>
        </Card>
      </div>
      </Reveal>

      <section id="how-it-works" className="snap-block mt-24">
        <Reveal>
          <p className="mb-3 font-serif text-base text-accent italic">Designed for attention</p>
          <h2 data-scrub-fade className="max-w-xl text-4xl sm:text-5xl">
            Clarity without changing who you are.
          </h2>
        </Reveal>
        <div className="mt-12 space-y-10">
          {FEATURES.map((feature, index) => (
            <Reveal key={feature.title} delay={index * 60}>
              <div
                className={cn(
                  "grid items-center gap-6 md:grid-cols-2 md:gap-10",
                  index % 2 === 1 && "md:[&>div:first-child]:order-2",
                )}
              >
                <Card className="group overflow-hidden p-2">
                  <Magnetic strength={6}>
                  <div className="overflow-hidden rounded-sm">
                    <Media
                      src={feature.image}
                      alt={feature.alt}
                      width={1200}
                      height={1600}
                      zoom
                      data-scrub
                      className="aspect-[4/5] w-full object-cover sm:aspect-[5/4]"
                    />
                  </div>
                  </Magnetic>
                </Card>
                <div className="px-1">
                  <p className="font-serif text-sm text-accent italic">{feature.index}</p>
                  <h3 className="mt-3 font-serif text-3xl">{feature.title}</h3>
                  <p className="mt-3 max-w-md text-base leading-relaxed text-muted">{feature.text}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="patterns" className="snap-block mt-24">
        <Reveal>
          <p className="mb-3 font-serif text-base text-accent italic">Neural reading patterns</p>
          <h2 data-scrub-fade className="max-w-xl text-4xl sm:text-5xl">
            The page can tell when you are actually reading.
          </h2>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-muted">
            A line held in the reading band is a fixation. The next line is a saccade. A jump, a return, or
            a long pause names the sitting — without a camera, and without asking you to click.
          </p>
        </Reveal>
        <div className="mt-10">
          <Reveal>
            <PatternExplorer />
          </Reveal>
        </div>
      </section>

      <section id="case-studies" className="snap-block mt-24">
        <Reveal>
          <p className="mb-3 font-serif text-base text-accent italic">How it lands</p>
          <h2 data-scrub-fade className="max-w-xl text-4xl sm:text-5xl">
            Built for the way reading actually happens.
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-4 lg:grid-cols-5">
          <Reveal className="lg:col-span-3">
            <Card className="group overflow-hidden p-2">
            <div className="overflow-hidden rounded-sm">
              <Media
                src="/images/reading-room.jpg"
                alt="A graduate student working in a sunlit reading room"
                width={1600}
                height={900}
                zoom
                data-scrub
                className="aspect-[16/10] w-full object-cover"
              />
            </div>
            <div className="px-4 pt-5 pb-4 sm:px-5">
              <p className="font-serif text-sm text-accent italic">Graduate student</p>
              <h3 className="mt-2 font-serif text-2xl">A clearer first pass</h3>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
                A calmer layout made intimidating research blocks approachable in shorter sessions.
              </p>
              <a href="#reader-start" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent">
                Try it <ChevronRight size={14} className="icon-motion icon-shift" />
              </a>
            </div>
          </Card>
          </Reveal>
          <div className="grid gap-4 lg:col-span-2">
            {[
              {
                image: "/images/case-team.jpg",
                alt: "Product documentation spread across a sunlit desk",
                label: "Product team",
                title: "Docs with less friction",
                text: "Shared documents became easier to scan when decisions had to move.",
              },
              {
                image: "/images/nook.jpg",
                alt: "A reader in an armchair by a window",
                label: "Daily reader",
                title: "Energy for the last page",
                text: "A personalized rhythm made it easier to continue when attention was thin.",
              },
            ].map((study, index) => (
              <Reveal key={study.title} delay={index * 80}>
              <Card className="group overflow-hidden p-2">
                <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 sm:grid-cols-[8.5rem_minmax(0,1fr)]">
                  <div className="overflow-hidden rounded-sm">
                    <Media
                      src={study.image}
                      alt={study.alt}
                      width={1200}
                      height={1600}
                      zoom
                      data-scrub
                      className="h-full min-h-28 w-full object-cover"
                    />
                  </div>
                  <div className="py-2 pr-2">
                    <p className="font-serif text-sm text-accent italic">{study.label}</p>
                    <h3 className="mt-1 font-serif text-lg">{study.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{study.text}</p>
                  </div>
                </div>
              </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="snap-block mt-24 pb-8">
        <Reveal>
          <h2 data-scrub-fade className="mb-6 max-w-xl text-4xl sm:text-5xl">
            A little more clarity before you start.
          </h2>
        </Reveal>
        <Reveal>
        <Accordion type="single" collapsible className="max-w-3xl border-t border-border">
          {[
            { q: "Does it watch my eyes?", a: "No camera. NeuroLens infers fixations and saccades from which line sits in the reading band, how long it is held, and how the page moves. That log stays in this browser." },
            { q: "Who is NeuroLens for?", a: "Anyone who finds dense pages tiring — ADHD, dyslexia, cognitive fatigue, or a preference for calmer text." },
            { q: "Can I use my own documents?", a: "Paste text, or upload a PDF or text file. PDFs open one page at a time, including figures, then you can format the words on that page." },
            { q: "How quickly will I see a result?", a: "Typical passages open in an adapted view in under 30 seconds. Short text is ready immediately." },
            { q: "Is my text used to train a model?", a: "Reading preferences and recent sessions stay in your browser. You can clear them from Settings at any time." },
          ].map(({ q, a }) => (
            <AccordionItem key={q} value={q}>
              <AccordionTrigger>{q}</AccordionTrigger>
              <AccordionContent>{a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        </Reveal>
      </section>

      <Reveal>
      <Card className="relative mt-16 mb-8 overflow-hidden p-0">
        <Media
          src="/images/nook.jpg"
          alt=""
          width={1200}
          height={1600}
          data-scrub
          className="absolute inset-0 h-full w-full object-cover object-[center_30%]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-fg/80 to-fg/25" />
        <div className="relative px-8 py-12 text-center text-primary-fg sm:px-12 sm:py-16">
          <Badge className="mb-4 bg-primary-fg/10 text-primary-fg">Private by default</Badge>
          <h2 className="font-serif text-4xl italic sm:text-5xl">Your next page can start here.</h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-primary-fg/75">
            Bring a passage, choose a profile, and see what changes when reading is shaped around your attention.
          </p>
          <Button asChild variant="outline" className="mt-7 bg-surface text-fg">
            <a href="#reader-start">Open the reader</a>
          </Button>
        </div>
      </Card>
      </Reveal>
      </ScrollScene>
      </div>

      <a
        href="#reader-start"
        aria-hidden={!heroCtaGone}
        tabIndex={heroCtaGone ? undefined : -1}
        className={cn(
          // Clears the footer row below it.
          "fixed right-4 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 inline-flex h-12 items-center gap-1 rounded-lg bg-primary px-4 pr-3.5 text-sm font-medium text-primary-fg shadow-float sm:hidden",
          "transition-[opacity,transform] duration-[250ms] ease-[var(--ease-out)] active:scale-[0.97] motion-reduce:transition-none",
          heroCtaGone
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-3 opacity-0",
        )}
      >
        Start reading <ChevronRight size={16} className="icon-motion icon-shift" />
      </a>
    </div>
  );
}
