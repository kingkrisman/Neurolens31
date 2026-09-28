import type { CSSProperties } from "react";
import { Link } from "@tanstack/react-router";
import {
  BookOpenText,
  ChevronRight,
  CloudOff,
  Highlighter,
  Import,
  Sparkles,
  Sprout,
  TextSearch,
  Volume2,
} from "lucide-react";
import { AmbientVideo } from "@/components/explore/ambient-video";
import { Reveal } from "@/components/reveal";
import { processBionicText } from "@/lib/bionic";
import { READING_PROFILES, type ReadingMode } from "@/lib/types";
import { cn } from "@/lib/utils";

/* ── Modes at a glance ───────────────────────────────────────────────────── */

const MODE_NOTES: Record<ReadingMode, string> = {
  default: "A calm page with even spacing. Nothing added.",
  adhd: "Bold word starts, a word guide, and quieter chrome around the page.",
  dyslexia: "OpenDyslexic, double line spacing, syllable breaks, a b/d guide, and plainer words.",
  focus: "Large type, a word guide, and everything but the page dimmed away.",
  academic: "A serif page on sepia, with light bold starts for long chapters.",
  speed: "Strong bold starts on a plain page, for moving quickly.",
  adaptive:
    "Starts light, then suggests changes as it learns how you read. Locked settings are left alone.",
};

const SAMPLE = "Words settle where the eye expects them.";

const FONT_CLASS: Record<string, string> = {
  sans: "font-sans",
  serif: "font-serif",
  opendyslexic: "font-opendyslexic",
};

/**
 * Each mode, shown by its own settings rather than described: the sample line
 * in every card is set with that mode's font, spacing and bold starts, read
 * from the same profiles the reader uses, so it cannot drift from the app.
 */
export function ModesAtAGlance() {
  const modes = Object.values(READING_PROFILES);
  return (
    <section id="modes" aria-labelledby="modes-title" className="snap-block mt-24">
      <Reveal>
        <p className="mb-3 font-serif text-base text-accent italic">Reading modes</p>
        <h2 id="modes-title" className="max-w-xl text-4xl text-balance sm:text-5xl">
          {modes.length} ways to set the page.
        </h2>
        <p className="mt-4 max-w-lg text-base leading-relaxed text-muted">
          A mode is a starting point. Every setting in it can be changed, and locked so it stays the
          way you like it.
        </p>
      </Reveal>
      <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-batch-children>
        {modes.map((mode) => {
          const style: CSSProperties = {
            letterSpacing: `${mode.letterSpacing}em`,
            wordSpacing: `${mode.wordSpacing}em`,
            lineHeight: Math.min(mode.lineHeight, 1.7),
          };
          return (
            <li
              key={mode.id}
              className="flex flex-col rounded-lg bg-surface p-4 shadow-border sm:p-5"
            >
              <p className="text-sm font-semibold">{mode.name}</p>
              <p
                aria-hidden
                className={cn(
                  "mt-3 text-[17px] text-fg",
                  FONT_CLASS[mode.fontFamily] ?? "font-sans",
                )}
                style={style}
                dangerouslySetInnerHTML={{
                  __html: processBionicText(SAMPLE, mode.bionicStrength, true),
                }}
              />
              <p className="mt-3 text-sm leading-relaxed text-pretty text-muted">
                {MODE_NOTES[mode.id]}
              </p>
            </li>
          );
        })}
        <li className="flex flex-col justify-end rounded-lg bg-fg/4 p-4 sm:p-5">
          <p className="text-sm leading-relaxed text-muted">
            Not sure? Pick one when you start. Changing later takes one tap.
          </p>
          <a
            href="#reader-start"
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent"
          >
            Choose a mode <ChevronRight size={14} className="icon-motion icon-shift" />
          </a>
        </li>
      </ul>
    </section>
  );
}

/* ── Small things that add up ────────────────────────────────────────────── */

const SMALL_THINGS = [
  {
    icon: Highlighter,
    title: "Highlights that come back",
    text: "A few passages you marked return days, then weeks later, for a second look. No streaks.",
  },
  {
    icon: Sprout,
    title: "A garden that only grows",
    text: "Each book is a plant. Finishing chapters grows it, and nothing ever wilts.",
  },
  {
    icon: Sparkles,
    title: "Quick recall",
    text: "A question or two at the end of a chapter. A wrong answer just shows the right one.",
  },
  {
    icon: BookOpenText,
    title: "Pages or scroll",
    text: "Swipe through pages like an e-reader, or scroll. Off until you choose it.",
  },
  {
    icon: Volume2,
    title: "Read aloud",
    text: "Hear the page in your device's own voice while you follow along.",
  },
  {
    icon: TextSearch,
    title: "Tap a word",
    text: "A plain definition for any word, without leaving the page.",
  },
  {
    icon: Import,
    title: "Kindle highlights",
    text: "Import My Clippings and your highlights land on the right lines.",
  },
  {
    icon: CloudOff,
    title: "Works offline",
    text: "Books you have opened stay on your device, so a train tunnel does not end the chapter.",
  },
] as const;

export function SmallThings() {
  return (
    <section id="features" aria-labelledby="features-title" className="snap-block mt-24">
      <Reveal>
        <p className="mb-3 font-serif text-base text-accent italic">Around the page</p>
        <h2 id="features-title" className="max-w-xl text-4xl text-balance sm:text-5xl">
          Small things that add up.
        </h2>
      </Reveal>
      <ul className="mt-10 grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4" data-batch-children>
        {SMALL_THINGS.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex flex-col">
            <span className="grid size-10 place-items-center rounded-full bg-accent/10 text-accent">
              <Icon size={18} aria-hidden />
            </span>
            <h3 className="mt-4 text-base font-semibold">{title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-pretty text-muted">{text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── Privacy, in one band ────────────────────────────────────────────────── */

const PROMISES = [
  "No camera, ever. Reading is measured from how the page moves.",
  "Books stay on your device unless you choose to save them to your account.",
  "Usage numbers are off until you say yes, and cannot hold a word you read.",
];

export function PrivacyBand() {
  return (
    <section aria-labelledby="privacy-title" className="snap-block mt-24">
      <Reveal>
        <div className="relative overflow-hidden rounded-xl bg-fg text-white">
          <AmbientVideo
            src="/videos/band-pages.mp4"
            poster="/videos/band-pages.jpg"
            className="absolute inset-0 h-full w-full"
          />
          <div className="absolute inset-0 bg-linear-to-r from-black/85 via-black/65 to-black/35" />
          <div className="relative grid gap-8 px-6 py-12 sm:px-10 sm:py-16 lg:grid-cols-[1fr_1.1fr] lg:items-end">
            <div>
              <p className="mb-3 font-serif text-base text-white/75 italic">Private by design</p>
              <h2 id="privacy-title" className="max-w-md text-4xl text-balance sm:text-5xl">
                Your reading stays yours.
              </h2>
            </div>
            <div>
              <ul className="space-y-3">
                {PROMISES.map((promise) => (
                  <li
                    key={promise}
                    className="flex gap-3 text-[15px] leading-relaxed text-white/90"
                  >
                    <span aria-hidden className="mt-2.5 h-px w-4 shrink-0 bg-white/60" />
                    {promise}
                  </li>
                ))}
              </ul>
              <Link
                to="/privacy"
                hash="measured"
                className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-white underline decoration-white/40 underline-offset-4 hover:decoration-white"
              >
                What is measured, and how <ChevronRight size={14} aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
