import { Link, createFileRoute } from "@tanstack/react-router";
import { breadcrumbJsonLd, jsonLd, seo } from "@/lib/seo";
import { BarChart3, HardDrive, Lock, UserX } from "lucide-react";
import { DocSection, Glance, PublicLayout, Term } from "@/components/public-layout";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    ...seo({
      title: "Privacy",
      description:
        "What NeuroLens collects, which is almost nothing: your files never leave your device, and usage analytics are opt-in, anonymous and schema-locked.",
      path: "/privacy",
    }),
    scripts: [
      jsonLd(
        breadcrumbJsonLd([
          { name: "NeuroLens", path: "/" },
          { name: "Privacy", path: "/privacy" },
        ]),
      ),
    ],
  }),
  component: Privacy,
});

const UPDATED = "15 September 2026";

const TOC = [
  { id: "summary", label: "At a glance" },
  { id: "device", label: "What stays on your device" },
  { id: "usage", label: "Usage analytics" },
  { id: "accounts", label: "Accounts" },
  { id: "services", label: "Outside services" },
  { id: "security", label: "How it is protected" },
  { id: "questions", label: "Questions" },
];

/**
 * Privacy.
 *
 * Every sentence is checked against what the code does, and where the code
 * enforces a promise the page says how — a reader has no reason to take a
 * privacy policy's word, and a promise they can verify on the account page is
 * worth more than one they are asked to trust.
 */
function Privacy() {
  return (
    <PublicLayout
      eyebrow="Privacy"
      title="Your reading stays with you."
      lead="NeuroLens keeps your books on your device and does not collect who you are. The small amount it can learn about how the app is used, it only learns if you say yes."
      meta={
        <>
          <span>Updated {UPDATED}</span>
          <span aria-hidden className="size-1 rounded-full bg-fg/20" />
          <span>4 minute read</span>
        </>
      }
      toc={TOC}
    >
      <section id="summary" className="scroll-mt-28">
        <Glance
          items={[
            {
              icon: HardDrive,
              title: "Your books stay here",
              body: "Files, highlights, notes and drawings never leave this device.",
            },
            {
              icon: UserX,
              title: "No personal data",
              body: "We do not collect your name, email, or anything you read.",
            },
            {
              icon: BarChart3,
              title: "Usage is opt-in",
              body: "Anonymous, off until you switch it on, and deletable any time.",
            },
            {
              icon: Lock,
              title: "Never sold",
              body: "No trackers, no ads, and your text never trains anything.",
            },
          ]}
        />
      </section>

      <DocSection id="device" title="What stays on your device">
        <p>
          Files you upload are read inside your browser. Their contents — and everything you do with
          them: highlights, notes, drawings, bookmarks, reading position and settings — are kept in
          your browser's storage and are never sent to us.
        </p>
        <p>
          You can download all of it, or erase all of it, from{" "}
          <Link to="/account">your account</Link> at any time.
        </p>
      </DocSection>

      <DocSection id="usage" title="Usage analytics">
        <p>
          With your permission, NeuroLens records anonymous events about how the app is used: which
          tab was opened, which file type was read, that a highlight or pen stroke was made, which
          setting changed. That is the whole list. <Term>It is off until you switch it on.</Term>
        </p>
        <p>
          This is enforced by the code, not just promised. Every event is checked against a fixed
          list, and each field only accepts a handful of fixed values — a file type, a colour, a
          tool — so there is nowhere in an event for a book's text, a file name, a name or an email
          to go. Sizes and counts are rounded into ranges, and times to the hour. The same check
          runs again on arrival, so an event that is not on the list is refused rather than stored.
        </p>
        <p>
          One more thing is measured: how quickly a page drew, how soon it answered a tap, and
          whether the text moved under you while you read. Those are kept only as <Term>good</Term>,{" "}
          <Term>needs work</Term> or <Term>poor</Term> — never the actual timings, which vary enough
          by device and moment to identify one.
        </p>
        <ul>
          <li>Events go to NeuroLens and nowhere else. There is no analytics company involved.</li>
          <li>
            The random number your device makes stays on it and is never sent or stored with an
            event.
          </li>
          <li>Nothing is attached to your account; there is no column for a person to go in.</li>
          <li>Switching analytics off deletes that number and everything recorded.</li>
          <li>
            If your browser sends Global Privacy Control or Do Not Track, you are never asked.
          </li>
          <li>The account page shows every recorded event, word for word, before it is sent.</li>
        </ul>
      </DocSection>

      <DocSection id="accounts" title="Accounts">
        <p>
          An account is optional. Sign in with Google or Apple and they confirm who you are;
          NeuroLens never sees your password. Your avatar is drawn on your device from a random seed
          — no photo is stored.
        </p>
      </DocSection>

      <DocSection id="services" title="Outside services">
        <p>A few features reach other services, and only when you use them:</p>
        <ul>
          <li>Bible passages — bible-api.com and bible.helloao.org</li>
          <li>Library records — the British Library and Open Library</li>
          <li>Poems — poetrydb.org</li>
          <li>Word definitions — dictionaryapi.dev and datamuse.com</li>
        </ul>
        <p>Those requests contain the passage, title or word you asked for, and nothing else.</p>
      </DocSection>

      <DocSection id="security" title="How it is protected">
        <ul>
          <li>
            <Term>Uploaded text cannot run as code.</Term> Everything a file contains is escaped
            before it is shown, so a document built to smuggle in a script is displayed as plain
            text.
          </li>
          <li>
            <Term>Only the app's own code runs.</Term> A security policy tells your browser to
            refuse scripts from anywhere else and to connect only to the services named above.
          </li>
          <li>
            <Term>No third-party trackers or ad scripts</Term>, and HTTPS only.
          </li>
        </ul>
        <p>
          Because your books live on your device, its passcode and the browser extensions you trust
          protect them too — an extension allowed to read every site can read what a site stores.
        </p>
      </DocSection>

      <DocSection id="questions" title="Questions">
        <p>
          <Link to="/support">Get in touch</Link>, or read the <Link to="/terms">terms</Link>.
        </p>
      </DocSection>
    </PublicLayout>
  );
}
