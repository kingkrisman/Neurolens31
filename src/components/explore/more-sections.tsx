import type { CSSProperties } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Reveal } from "@/components/reveal";
import { Plant } from "@/components/garden-view";
import { Media } from "@/components/ui/surfaces";
import { processBionicText } from "@/lib/bionic";
import type { GardenPlant } from "@/lib/garden";
import { photo } from "@/lib/photos";
import { FONT_CLASS, READING_PROFILES, type ReadingMode } from "@/lib/types";
import { cn } from "@/lib/utils";

/*
 * Three calm sections for Explore, in one visual language: soft tinted cards
 * with generous rounding and room around everything, no borders, no shadows,
 * nothing that moves on its own. The tints are mixed from the page colour, so
 * they follow the reader's palette, dark ones included (see .calm-* in CSS).
 */

const TINTS = ["calm-sand", "calm-sage", "calm-blush", "calm-mist"] as const;

/* ── Reading modes ───────────────────────────────────────────────────────── */

const MODE_NOTES: Record<ReadingMode, string> = {
  default: "Even spacing, nothing added.",
  adhd: "Bold starts and a word guide.",
  dyslexia: "OpenDyslexic, double spacing, syllables.",
  focus: "Large type; everything else dims.",
  academic: "A serif page on sepia.",
  speed: "Strong bold starts, for skimming.",
  adaptive: "Suggests changes as it learns you.",
};

const SAMPLE = "Words settle in.";

/**
 * Each mode as a soft card with the same short line set in that mode's own
 * font, spacing and bold starts — read from the profiles the reader uses, so
 * the card and the app cannot disagree.
 */
export function ModesAtAGlance() {
  const modes = Object.values(READING_PROFILES);
  return (
    <section id="modes" aria-labelledby="modes-title" className="snap-block mt-28">
      <Reveal>
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <h2 id="modes-title" className="max-w-lg text-4xl text-balance sm:text-5xl">
            {modes.length} ways to set the page.
          </h2>
          <p className="max-w-sm text-[15px] leading-relaxed text-muted">
            A mode is only a starting point. Change any setting, and lock the ones you like.
          </p>
        </div>
      </Reveal>
      <ul className="calm-modes mt-10" data-batch-children>
        {modes.map((mode, index) => (
          <li key={mode.id} className={cn("calm-card calm-mode", TINTS[index % TINTS.length])}>
            <span className="calm-tag">{mode.name}</span>
            <p
              aria-hidden
              className={cn("calm-mode-sample", FONT_CLASS[mode.fontFamily] ?? "font-sans")}
              style={
                {
                  letterSpacing: `${mode.letterSpacing}em`,
                  wordSpacing: `${mode.wordSpacing}em`,
                } as CSSProperties
              }
              dangerouslySetInnerHTML={{
                __html: processBionicText(SAMPLE, mode.bionicStrength, true),
              }}
            />
            <p className="calm-mode-note">{MODE_NOTES[mode.id]}</p>
          </li>
        ))}
        <li className="calm-card calm-mode calm-paper-card">
          <span className="calm-tag">Not sure?</span>
          <p className="calm-mode-note text-fg">
            Pick one when you start. Changing later takes one tap.
          </p>
          <a href="#reader-start" className="calm-link">
            Choose a mode <ChevronRight size={14} aria-hidden />
          </a>
        </li>
      </ul>
    </section>
  );
}

/* ── Also in the app ─────────────────────────────────────────────────────── */

const SMALL = [
  { title: "Quick recall", text: "A question or two at the end of a chapter. Nothing to fail." },
  { title: "Pages or scroll", text: "Turn pages like an e-reader, or scroll. Your choice." },
  { title: "Read aloud", text: "Hear the page in your device's voice as you follow along." },
  { title: "Tap a word", text: "A plain definition, without leaving the page." },
  { title: "Kindle highlights", text: "Import My Clippings; your marks land on the right lines." },
  { title: "Works offline", text: "Books you have opened stay on your device." },
] as const;

/** A plant from the reader's garden, drawn by the garden itself. */
const SAMPLE_PLANT: GardenPlant = {
  id: "explore-sample",
  title: "",
  plantedAt: 0,
  grewAt: 0,
  chapters: [1, 2, 3, 4, 5],
  blooms: [2, 4],
};

export function SmallThings() {
  return (
    <section id="features" aria-labelledby="features-title" className="snap-block mt-28">
      <Reveal>
        <h2 id="features-title" className="max-w-xl text-4xl text-balance sm:text-5xl">
          Also in the app.
        </h2>
      </Reveal>
      <div className="calm-bento mt-10" data-batch-children>
        <article className="calm-card calm-paper-card calm-bento-hero">
          <div className="calm-bento-photo">
            <Media
              {...photo("glasses-linen", "(min-width: 1024px) 540px, 100vw")}
              alt="Reading glasses and flowers on an open book, on white linen"
              width={1600}
              height={1067}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="p-6 sm:p-7">
            <h3 className="font-serif text-2xl">Highlights that come back</h3>
            <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-muted">
              A few passages you marked return days, then weeks later, for a second look. No
              streaks, nothing to keep up.
            </p>
          </div>
        </article>

        <article className="calm-card calm-sage calm-bento-wide">
          <div className="min-w-0">
            <h3 className="font-serif text-2xl">A garden that only grows</h3>
            <p className="mt-2 max-w-xs text-[15px] leading-relaxed text-muted">
              Each book is a plant. Finishing chapters helps it grow, and nothing ever wilts.
            </p>
          </div>
          <Plant plant={SAMPLE_PLANT} className="calm-plant" />
        </article>

        {SMALL.map((item, index) => (
          <article key={item.title} className={cn("calm-card", TINTS[(index + 2) % TINTS.length])}>
            <h3 className="text-base font-semibold">{item.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{item.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ── Privacy ─────────────────────────────────────────────────────────────── */

const PROMISES = [
  "No camera, ever. Reading is measured from how the page moves.",
  "Books stay on your device unless you choose to save them to your account.",
  "Usage numbers are off until you say yes, and never hold a word you read.",
];

export function PrivacyBand() {
  return (
    <section aria-labelledby="privacy-title" className="snap-block mt-28">
      <Reveal>
        <div className="calm-card calm-mist calm-privacy">
          <div className="calm-privacy-text">
            <h2 id="privacy-title" className="max-w-sm text-4xl text-balance sm:text-5xl">
              Your reading stays yours.
            </h2>
            <ul className="mt-6 space-y-3">
              {PROMISES.map((promise) => (
                <li key={promise} className="calm-promise">
                  {promise}
                </li>
              ))}
            </ul>
            <Link to="/privacy" hash="measured" className="calm-link mt-6">
              What is measured, and how <ChevronRight size={14} aria-hidden />
            </Link>
          </div>
          <div className="calm-privacy-photo">
            <Media
              {...photo("lap-reader", "(min-width: 768px) 520px, 100vw")}
              alt="Someone sitting outdoors with a book open on their lap"
              width={1600}
              height={1067}
              className="h-full w-full object-cover"
            />
          </div>
        </div>
      </Reveal>
    </section>
  );
}
