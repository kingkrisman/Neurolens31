import { Link, createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { PublicLayout } from "@/components/public-layout";

export const Route = createFileRoute("/privacy")({ component: Privacy });

const UPDATED = "15 September 2026";

/**
 * Privacy.
 *
 * Every sentence here is checked against what the code does, and where the
 * code enforces a promise, the page says how — because a reader has no reason
 * to take a privacy policy's word for anything, and a promise they can verify
 * on the account page is worth more than one they are asked to trust.
 */
function Privacy() {
  return (
    <PublicLayout
      eyebrow="Privacy"
      title="Your reading stays with you."
      image="/images/nook.jpg"
      imageAlt="A reader in a sunlit armchair"
    >
      <p className="text-subtle">Last updated {UPDATED}.</p>

      <div className="rounded-md bg-fg/4 p-4">
        <p className="text-sm font-medium text-fg">In short</p>
        <ul className="mt-2 ml-4 list-disc space-y-1.5 text-sm leading-relaxed">
          <li>Your books, highlights, notes and drawings never leave your device.</li>
          <li>We do not collect your name, email, or anything you read.</li>
          <li>We do collect how the app is used — anonymously, and you can switch it off.</li>
          <li>We never sell data and never use your text to train anything.</li>
        </ul>
      </div>

      <Section title="What stays on your device">
        <p>
          Files you upload are read inside your browser. Their contents, and everything you do with
          them — highlights, notes, drawings, bookmarks, reading position and settings — are stored in
          your browser's local storage and are never sent to us. You can download all of it, or erase
          all of it, from <Link to="/account" className="text-fg underline underline-offset-2">your account</Link>.
        </p>
      </Section>

      <Section title="What we collect: how the app is used">
        <p>
          To learn which tools help and where people get stuck, NeuroLens records anonymous usage
          events: which tab was opened, which file type was read, that a highlight or a pen stroke was
          made, which setting was changed. That is the whole list.
        </p>
        <p>
          This is enforced by the code, not just promised. Each event is checked against a fixed list,
          and every field only accepts a small set of fixed values — a file type, a colour, a tool —
          so there is no place in an event where a book's text, a file name, a name or an email could
          be written. Sizes and counts are rounded into ranges, and times are rounded to the hour.
        </p>
        <p>
          Events are tied to a random number made on your device, not to your account. Switching
          analytics off deletes that number and everything recorded. If your browser sends Global
          Privacy Control or Do Not Track, analytics starts switched off.
        </p>
        <p>
          The account page shows every event recorded on your device, word for word.
        </p>
      </Section>

      <Section title="Accounts">
        <p>
          An account is optional. If you sign in with Google or Apple, they confirm who you are; we
          never see your password. Your avatar is generated from a random seed on your device — no
          photo is stored.
        </p>
      </Section>

      <Section title="Features that reach the internet">
        <p>
          A few features fetch from other services only when you use them: Bible passages
          (bible-api.com, bible.helloao.org), library records (the British Library and Open Library),
          poems (poetrydb.org), and word definitions (dictionaryapi.dev, datamuse.com). Those requests
          contain the passage, title or word you asked for, and nothing else.
        </p>
      </Section>

      <Section title="How your data is protected">
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            <span className="font-medium text-fg">Uploaded text cannot run as code.</span> Everything a
            file contains is escaped before it is shown, so a document crafted to smuggle in a script
            is displayed as text.
          </li>
          <li>
            <span className="font-medium text-fg">The app only loads its own code.</span> A security
            policy tells the browser to refuse scripts from anywhere else and to only connect to the
            services named above.
          </li>
          <li>
            <span className="font-medium text-fg">No third-party trackers or ad scripts.</span>
          </li>
          <li>
            <span className="font-medium text-fg">Encrypted in transit.</span> The app is served over
            HTTPS only.
          </li>
        </ul>
        <p>
          Because your books live on your device, keeping that device secure — its passcode, and
          which browser extensions you trust — protects them too. An extension with permission to
          read every site can read what that site stores.
        </p>
      </Section>

      <Section title="Questions">
        <p>
          <Link to="/support" className="text-fg underline underline-offset-2">
            Get in touch
          </Link>
          . You can read the{" "}
          <Link to="/terms" className="text-fg underline underline-offset-2">
            terms
          </Link>{" "}
          too.
        </p>
      </Section>
    </PublicLayout>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-fg/10 pt-6">
      <h2 className="font-serif text-lg text-fg italic">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}
