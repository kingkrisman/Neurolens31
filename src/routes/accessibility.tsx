import { Link, createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { PublicLayout } from "@/components/public-layout";

export const Route = createFileRoute("/accessibility")({ component: Accessibility });

const UPDATED = "14 September 2026";

/**
 * Accessibility statement.
 *
 * Unusual for this app in that it is the product's whole argument, not a
 * compliance footnote — so it says what is actually true, including the parts
 * that are not finished. A statement that claims everything works is worth
 * nothing to the person it is written for, who will find out in thirty seconds
 * that it does not, and will then distrust the rest of it.
 */
function Accessibility() {
  return (
    <PublicLayout
      eyebrow="Accessibility"
      title="Built for readers the web forgets."
      image="/images/reading-room.jpg"
      imageAlt="A quiet, well-lit reading room"
    >
      <p className="text-subtle">Last updated {UPDATED}.</p>

      <p>
        NeuroLens exists because standard pages are hard to read for a lot of people. Accessibility
        is not a layer added at the end here; it is what the app does. This page says where that is
        true, and where it is not yet.
      </p>

      <Section title="What the app gives you control of">
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            <Strong>Typeface</Strong> — including OpenDyslexic, Atkinson Hyperlegible and Lexend,
            all designed for readers who find ordinary type hard.
          </li>
          <li>
            <Strong>Size, letter spacing, word spacing and line height</Strong>, independently.
            Spacing is often what helps most, and most apps only offer size.
          </li>
          <li>
            <Strong>Colour and contrast</Strong> — several themes and tints, with the live contrast
            ratio shown so you can see whether a choice is still readable.
          </li>
          <li>
            <Strong>Colour-vision preview</Strong> — check any theme as it appears with
            protanopia, deuteranopia or tritanopia.
          </li>
          <li>
            <Strong>Reading mask, word guide and syllable splitting</Strong>, for holding a line or
            breaking a long word down.
          </li>
          <li>
            <Strong>Plain words</Strong> — swaps dense vocabulary for simpler equivalents without
            changing what a passage says.
          </li>
          <li>
            <Strong>Read aloud</Strong>, using the voices your device already has.
          </li>
        </ul>
      </Section>

      <Section title="How it behaves">
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            <Strong>Motion is optional.</Strong> If your system asks for reduced motion, animation
            is switched off — including the page refraction and the drawing effects.
          </li>
          <li>
            <Strong>Keyboard throughout.</Strong> Every control can be reached and operated by
            keyboard, with a visible focus ring, and a skip link on each page.
          </li>
          <li>
            <Strong>Colour is never the only signal.</Strong> Highlight colours are named as well
            as shown, and the marker in use is stated in text.
          </li>
          <li>
            <Strong>Touch targets are at least 44&nbsp;px</Strong> on phones.
          </li>
          <li>
            <Strong>Nothing is timed.</Strong> No control disappears on a timer, and auto-scroll
            only moves when you turn it on.
          </li>
          <li>
            <Strong>It works offline</Strong>, which matters if your connection is unreliable or
            metered.
          </li>
        </ul>
      </Section>

      <Section title="Where it falls short">
        <p>
          Said plainly, because you will find these anyway and it is better to know first.
        </p>
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            <Strong>Drawings are not described to a screen reader.</Strong> Ink you draw on a page
            is visual only — a screen reader will not announce it. Highlights and notes are
            available as text.
          </li>
          <li>
            <Strong>A PDF that is only scanned images has no text to read.</Strong> NeuroLens does
            not do character recognition, so those pages are shown as pictures and cannot be
            reformatted, read aloud, or searched.
          </li>
          <li>
            <Strong>Read-aloud quality depends on your device</Strong>, not on us. Voices differ a
            great deal between platforms.
          </li>
          <li>
            <Strong>Very old browsers are not supported.</Strong> Reading a PDF in particular needs
            a reasonably current browser.
          </li>
        </ul>
      </Section>

      <Section title="Standards">
        <p>
          The app is built against{" "}
          <a
            href="https://www.w3.org/TR/WCAG22/"
            target="_blank"
            rel="noreferrer"
            className="text-fg underline underline-offset-2"
          >
            WCAG 2.2
          </a>{" "}
          Level AA. That is the target it is designed and reviewed against; it has not been audited
          by an independent third party, and claiming conformance without one would be a stronger
          statement than the evidence supports.
        </p>
      </Section>

      <Section title="If something is in your way">
        <p>
          Tell us — a specific barrier is worth more than any checklist.{" "}
          <Link to="/support" className="text-fg underline underline-offset-2">
            Get in touch
          </Link>{" "}
          and say what you were trying to do and what stopped you. Accessibility faults are treated
          as faults, not as feature requests.
        </p>
      </Section>
    </PublicLayout>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="doc-section">
      <h2 className="doc-h2">{title}</h2>
      <div className="doc-prose mt-5">{children}</div>
    </section>
  );
}

function Strong({ children }: { children: ReactNode }) {
  return <span className="font-medium text-fg">{children}</span>;
}
