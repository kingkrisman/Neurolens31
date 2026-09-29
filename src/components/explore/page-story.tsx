import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { processBionicText } from "@/lib/bionic";
import { prefersReducedMotion } from "@/lib/prefers-reduced-motion";
import { lenisFor } from "@/lib/smooth-scroll";
import { cn } from "@/lib/utils";

/**
 * "Watch one page change": the opening of Pride and Prejudice on one calm card,
 * held still while four small changes are made to it as the visitor scrolls.
 *
 * Deliberately quiet. One card, one page, one sentence of explanation at a
 * time, and four pills that say where you are — and take you to a step when
 * tapped, for anyone who would rather not scroll through it.
 *
 * Mechanics. The section is a few screens tall and its frame is sticky, so it
 * holds still while the page scrolls past behind it. Four invisible markers
 * share the section's height; an IntersectionObserver watching a thin band in
 * the middle of the scroller says which one is being passed. Nothing runs per
 * scroll frame, and the two layouts of the text are crossfaded rather than
 * animated, which would re-lay out the paragraph every frame.
 */

const STEPS = [
  {
    label: "As printed",
    note: "Tight lines and justified edges. Every line looks like the last, so the eye loses its place on the way back.",
  },
  {
    label: "Bold starts",
    note: "A little weight at the start of each word gives the eye somewhere to land.",
  },
  {
    label: "More space",
    note: "Larger type, looser lines and a ragged right edge. The Dyslexia mode starts from here.",
  },
  {
    label: "One line",
    note: "The sentence you are on stays clear, and the rest steps back.",
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
  const sectionRef = useRef<HTMLElement>(null);

  // How tall the scroller is, for the pinned frame. The app scrolls inside a
  // pane under a header, so 100svh would be taller than the space it has.
  useLayoutEffect(() => {
    const section = sectionRef.current;
    const pane = section?.closest(".pane-scroll");
    if (!section || !(pane instanceof HTMLElement)) return;
    const apply = () => section.style.setProperty("--pane-h", `${pane.clientHeight}px`);
    apply();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(apply);
    observer.observe(pane);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || typeof IntersectionObserver === "undefined") return;
    const root = section.closest(".pane-scroll");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = Number((entry.target as HTMLElement).dataset.step);
          if (Number.isInteger(index)) setStep(index);
        }
      },
      { root, rootMargin: "-50% 0px -49% 0px", threshold: 0 },
    );
    for (const marker of section.querySelectorAll("[data-step]")) observer.observe(marker);
    return () => observer.disconnect();
  }, []);

  // On the last step the clear sentence moves on, slowly, while it is shown.
  useEffect(() => {
    if (step !== 3 || prefersReducedMotion()) {
      setFocus(0);
      return;
    }
    // A phone shows only the first two sentences (see .calm-paper in CSS).
    const shown = window.matchMedia("(min-width: 768px)").matches ? SENTENCES.length : 2;
    const timer = window.setInterval(() => {
      if (!document.hidden) setFocus((current) => (current + 1) % shown);
    }, 3200);
    return () => window.clearInterval(timer);
  }, [step]);

  const goTo = (index: number) => {
    const section = sectionRef.current;
    const pane = section?.closest(".pane-scroll");
    const marker = section?.querySelector<HTMLElement>(`[data-step="${index}"]`);
    if (!(pane instanceof HTMLElement) || !marker) return;
    const top =
      marker.getBoundingClientRect().top -
      pane.getBoundingClientRect().top +
      pane.scrollTop +
      marker.offsetHeight / 2 -
      pane.clientHeight / 2;
    const lenis = lenisFor(pane);
    if (lenis) lenis.scrollTo(top);
    else pane.scrollTo({ top, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };

  const bold = step >= 1;
  const plain = useMemo(
    () => SENTENCES.map((sentence) => (bold ? processBionicText(sentence, 0.5, true) : null)),
    [bold],
  );
  const roomy = useMemo(
    () => SENTENCES.map((sentence) => processBionicText(sentence, 0.5, true)),
    [],
  );

  return (
    <section
      ref={sectionRef}
      id="see-it-change"
      aria-labelledby="story-title"
      className="calm-story mt-24"
    >
      <div className="calm-story-frame">
        <div className="calm-story-head">
          <h2 id="story-title" className="text-4xl text-balance sm:text-5xl">
            Watch one page change.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-muted">
            Keep scrolling. Four small changes to the opening of <cite>Pride and Prejudice</cite>,
            one at a time.
          </p>
        </div>

        <div className="calm-story-card calm-sand">
          <div className="calm-pills" role="group" aria-label="Changes">
            {STEPS.map((item, index) => (
              <button
                key={item.label}
                type="button"
                aria-pressed={index === step}
                onClick={() => goTo(index)}
                className={cn("calm-pill", index === step && "is-on", index < step && "is-done")}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="calm-paper" aria-hidden>
            <p className={cn("calm-layer calm-plain", step < 2 && "is-shown")}>
              {SENTENCES.map((sentence, index) => {
                const html = plain[index];
                return html ? (
                  <span key={index} dangerouslySetInnerHTML={{ __html: `${html} ` }} />
                ) : (
                  <span key={index}>{`${sentence} `}</span>
                );
              })}
            </p>
            <p className={cn("calm-layer calm-roomy", step >= 2 && "is-shown")}>
              {SENTENCES.map((_, index) => (
                <span
                  key={index}
                  className={cn("calm-sentence", step === 3 && index !== focus && "is-back")}
                  dangerouslySetInnerHTML={{ __html: `${roomy[index]} ` }}
                />
              ))}
            </p>
          </div>

          <p key={step} className="calm-caption" aria-live="polite">
            {STEPS[step]!.note}
          </p>
        </div>
      </div>

      {/* Four equal stretches of the section, one per change. */}
      <div className="calm-story-markers" aria-hidden>
        {STEPS.map((item, index) => (
          <div key={item.label} data-step={index} />
        ))}
      </div>
    </section>
  );
}
