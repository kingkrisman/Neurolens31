import { Link, createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { PublicLayout } from "@/components/public-layout";

export const Route = createFileRoute("/help")({ component: Help });

/**
 * How to use NeuroLens.
 *
 * Written as answers to what a reader is trying to do, not as a tour of the
 * interface — someone opens a help page because a thing they wanted did not
 * happen, and a list of buttons does not answer that. Short sections, each one
 * self-contained, because this page is skimmed by people who find long prose
 * expensive. Which is, after all, who the app is for.
 */
function Help() {
  return (
    <PublicLayout
      eyebrow="Help"
      title="How to use NeuroLens."
      image="/images/hands.jpg"
      imageAlt="Hands resting on an open book"
    >
      <nav aria-label="On this page" className="not-prose">
        <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {[
            ["Getting a book in", "books"],
            ["Making the page easier", "page"],
            ["Marking what matters", "marking"],
            ["Drawing on the page", "drawing"],
            ["Reading that adapts", "adaptive"],
            ["Finding your place again", "place"],
            ["Reading offline", "offline"],
            ["Keyboard shortcuts", "keys"],
          ].map(([label, id]) => (
            <li key={id}>
              <a href={`#${id}`} className="text-fg underline-offset-4 hover:underline">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <Section id="books" title="Getting a book in">
        <p>
          On the home page, use <Term>Upload</Term> in the Source card, or drag a file onto it. You
          can also paste text straight into the box.
        </p>
        <p>
          NeuroLens reads <Term>PDF</Term>, <Term>EPUB</Term>, <Term>Word</Term> (.docx),{" "}
          <Term>HTML</Term>, <Term>RTF</Term>, <Term>Markdown</Term> and plain text — and it will try
          anything else as text rather than refuse it. Files up to 20&nbsp;MB.
        </p>
        <p>
          A long PDF takes a moment; the button counts pages while it works. If a page or two cannot
          be read, the rest of the book still opens and you are told how many were skipped.
        </p>
        <p className="text-subtle">
          If a file is stored in iCloud or Google Drive, download it to the device first — the
          browser cannot read a file that is still in the cloud.
        </p>
      </Section>

      <Section id="page" title="Making the page easier">
        <p>
          Open <Term>Reading options</Term> from the bar at the bottom of the reader. Everything
          there changes the page immediately, so you can judge it against real text rather than a
          sample.
        </p>
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            <Term>Fixation</Term> — bolds the first letters of each word, which gives the eye a place
            to land. Turn it down or off if it feels busy.
          </li>
          <li>
            <Term>Typeface</Term> — includes OpenDyslexic, Atkinson Hyperlegible and Lexend alongside
            the usual serif and sans.
          </li>
          <li>
            <Term>Size, spacing and line height</Term> — more space between lines is often the single
            biggest help, more than a larger size.
          </li>
          <li>
            <Term>Theme and tint</Term> — a warm or tinted page reduces glare. Contrast is shown as a
            ratio so you can keep it readable.
          </li>
          <li>
            <Term>Reading mask</Term> — dims everything except the line you are on.
          </li>
        </ul>
      </Section>

      <Section id="marking" title="Marking what matters">
        <p>
          <Term>Drag across any phrase</Term> to highlight it. The mark snaps to whole words, so you
          do not have to be precise.
        </p>
        <p>
          The highlighter button in the bottom bar opens the <Term>marker palette</Term> — six
          colours, so you can sort as you read: one for the point, one for what you disagree with,
          one for what to look up. The dot on the button shows the colour you have loaded.
        </p>
        <p>
          Open <Term>Show highlights</Term> from the same menu to see every mark in one list, jump to
          one, attach a note, change its colour, or remove it. Highlights can be exported as Markdown.
        </p>
      </Section>

      <Section id="drawing" title="Drawing on the page">
        <p>
          From the highlighter menu choose <Term>Draw on the page</Term>. You get a pen, a marker, a
          pencil and an eraser, with seven colours, undo, and clear.
        </p>
        <p>
          <Term>With a stylus, just draw</Term> — an Apple Pencil or any pen draws the moment it
          touches the page, and your finger still scrolls. With a mouse or finger, drawing mode has
          to be on, because otherwise the same drag would mean selecting text.
        </p>
        <p>
          Marker ink sits behind the words like a real highlighter; pen and pencil sit in front.
          Drawings are pinned to the line they were drawn on, so they move with the text when you
          change the type size.
        </p>
      </Section>

      <Section id="adaptive" title="Reading that adapts">
        <p>
          In <Term>Adaptive</Term> mode, NeuroLens watches pace, pauses and re-reads, and suggests a
          change when the page seems to be fighting you — more spacing, a calmer theme, a slower
          pace. Suggestions are offered, never applied behind your back.
        </p>
        <p>
          You can lock any setting you do not want touched. <Term>Insights</Term> shows what it has
          noticed over time.
        </p>
      </Section>

      <Section id="place" title="Finding your place again">
        <p>
          NeuroLens remembers where you stopped. The home page offers <Term>Continue</Term> with the
          part and roughly how long is left; it returns you to the exact place, and moves on to the
          next part if you had finished the one before.
        </p>
        <p>
          <Term>Bookmarks</Term> save a spot deliberately. Long books are split into parts so a
          chapter is never an endless scroll.
        </p>
      </Section>

      <Section id="offline" title="Reading offline">
        <p>
          Once a book is open it stays on your device, so you can read it with no connection at all.
          Uploaded documents never leave your browser.
        </p>
        <p>
          Storage is limited by the browser, so a very large library may drop the oldest books.
          Download anything you want to keep from <Link to="/account" className="text-fg underline underline-offset-2">your account</Link>.
        </p>
      </Section>

      <Section id="keys" title="Keyboard shortcuts">
        <dl className="not-prose grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {[
            ["⌘K / Ctrl+K", "Open the command palette"],
            ["Space", "Start or stop auto-scroll"],
            ["← →", "Previous or next part"],
            ["F", "Find in this book"],
            ["B", "Bookmark this place"],
            ["Esc", "Close whatever is open"],
          ].map(([keys, what]) => (
            <div key={keys} className="contents">
              <dt className="font-mono text-xs text-fg tabular-nums">{keys}</dt>
              <dd className="text-muted">{what}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="still" title="Still stuck?">
        <p>
          If something is not working the way this page describes,{" "}
          <Link to="/support" className="text-fg underline underline-offset-2">
            tell us about it
          </Link>
          . Including what you were doing and what happened instead is usually enough to find it.
        </p>
      </Section>
    </PublicLayout>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-fg/10 pt-6">
      <h2 className="font-serif text-xl text-fg italic">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

/** A control named as the reader sees it on screen. */
function Term({ children }: { children: ReactNode }) {
  return <span className="font-medium text-fg">{children}</span>;
}
