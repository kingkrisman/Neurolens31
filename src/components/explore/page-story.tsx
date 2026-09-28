import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { processBionicText } from "@/lib/bionic";
import { prefersReducedMotion } from "@/lib/prefers-reduced-motion";
import { cn } from "@/lib/utils";

/**
 * "Watch a page change": one paragraph, held still while the changes NeuroLens
 * makes are applied to it one at a time as the visitor scrolls.
 *
 * The page is pinned with `position: sticky`, and which step is showing is
 * decided by an IntersectionObserver watching a thin band across the
 * scroller. Nothing runs per scroll frame: the step changes four times over
 * the whole section, and each change is one attribute on one element.
 *
 * Steps build on each other, the way a reader stacks settings.
 */

const STEPS = [
  {
    title: "A dense page",
    text: "Small type, tight lines, justified edges. Every line looks like the one before it, so the eye loses its place on the way back.",
  },
  {
    title: "Bold word starts",
    text: "The first letters of each word carry a little more weight: an anchor for the eye to land on. Lighter, heavier, or off.",
  },
  {
    title: "Room to breathe",
    text: "Larger type, looser lines, more space between letters and words, and a ragged right edge. The Dyslexia mode starts from here.",
  },
  {
    title: "One line at a time",
    text: "What you are reading stays clear and the rest steps back, so there is one place to look.",
  },
] as const;

/** Public domain: Jane Austen, Pride and Prejudice (1813), chapter 1. */
const SENTENCES = [
  "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.",
  "However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered as the rightful property of some one or other of their daughters.",
  "“My dear Mr. Bennet,” said his lady to him one day, “have you heard that Netherfield Park is let at last?”",
  "Mr. Bennet replied that he had not.",
];

export function PageStory() {
  const [step, setStep] = useState(0);
  const [focus, setFocus] = useState(0);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof IntersectionObserver === "undefined") return;
    const root = list.closest(".pane-scroll");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = Number((entry.target as HTMLElement).dataset.step);
          if (Number.isInteger(index)) setStep(index);
        }
      },
      // A thin band near the middle — just below the pinned page on a phone.
      // The step whose block crosses it is the one being read.
      { root, rootMargin: "-48% 0px -51% 0px", threshold: 0 },
    );
    for (const item of list.querySelectorAll("[data-step]")) observer.observe(item);
    return () => observer.disconnect();
  }, []);

  // The reading band walks down the sentences, slowly, only while that step
  // is showing.
  useEffect(() => {
    if (step !== 3 || prefersReducedMotion()) {
      setFocus(0);
      return;
    }
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      setFocus((current) => (current + 1) % SENTENCES.length);
    }, 2600);
    return () => window.clearInterval(timer);
  }, [step]);

  const bold = step >= 1;
  const marked = useMemo(
    () => SENTENCES.map((sentence) => (bold ? processBionicText(sentence, 0.5, true) : null)),
    [bold],
  );
  // The roomy page always has bold starts: it only shows from the third step.
  const spacious = useMemo(
    () => SENTENCES.map((sentence) => processBionicText(sentence, 0.5, true)),
    [],
  );

  return (
    <section id="see-it-change" aria-labelledby="story-title" className="story mt-24">
      <div className="max-w-2xl">
        <p className="mb-3 font-serif text-base text-accent italic">Watch a page change</p>
        <h2 id="story-title" className="text-4xl text-balance sm:text-5xl">
          Four changes, one paragraph.
        </h2>
        <p className="mt-4 max-w-lg text-base leading-relaxed text-muted">
          Keep scrolling. The opening of Pride and Prejudice stays where it is while each change is
          made to it, in the order they stack up in the reader.
        </p>
      </div>

      <div className="story-grid mt-10">
        <div className="story-stage-wrap">
          <div className="story-stage" data-step={step} aria-hidden>
            <div className="flex items-center justify-between gap-3 text-xs text-muted">
              <span key={step} className="story-label">
                {STEPS[step]!.title}
              </span>
              <span className="tabular-nums">
                {step + 1} / {STEPS.length}
              </span>
            </div>
            <div className="story-meter mt-2" style={{ "--story-step": step } as CSSProperties}>
              <i />
            </div>
            {/* Two versions of the page, laid out once each and crossfaded.
                Animating the type size itself would re-lay out the paragraph
                on every frame of the change; an opacity fade is left to the
                compositor. */}
            <div className="story-layers mt-4">
              <p className={cn("story-text story-dense", step < 2 && "is-shown")}>
                {SENTENCES.map((sentence, index) => {
                  const html = marked[index];
                  return html ? (
                    <span key={index} dangerouslySetInnerHTML={{ __html: `${html} ` }} />
                  ) : (
                    <span key={index}>{`${sentence} `}</span>
                  );
                })}
              </p>
              <p className={cn("story-text story-roomy", step >= 2 && "is-shown")}>
                {SENTENCES.map((sentence, index) => (
                  <span
                    key={index}
                    className={cn("story-sentence", step === 3 && index !== focus && "is-back")}
                    dangerouslySetInnerHTML={{ __html: `${spacious[index]} ` }}
                  />
                ))}
              </p>
            </div>
          </div>
        </div>

        <ol ref={listRef} className="story-steps">
          {STEPS.map((item, index) => (
            <li key={item.title} data-step={index} className="story-step">
              <div className={cn("story-step-card", index === step && "is-current")}>
                <p className="font-serif text-sm text-accent italic tabular-nums">0{index + 1}</p>
                <h3 className="mt-2 font-serif text-2xl sm:text-3xl">{item.title}</h3>
                <p className="mt-2 max-w-md text-base leading-relaxed text-muted">{item.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
