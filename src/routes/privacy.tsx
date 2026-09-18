import { Link, createFileRoute } from "@tanstack/react-router";
import { breadcrumbJsonLd, jsonLd, seo } from "@/lib/seo";
import { BarChart3, HardDrive, Lock, UserX } from "lucide-react";
import { DocSection, Glance, PublicLayout, Term } from "@/components/public-layout";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    ...seo({
      title: "Privacy",
      description:
        "What NeuroLens stores and where: books stay on your device until you choose to upload them, accounts hold only your email, and usage analytics are opt-in, anonymous and schema-locked.",
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

const UPDATED = "18 September 2026";

const TOC = [
  { id: "summary", label: "At a glance" },
  { id: "device", label: "Your books" },
  { id: "usage", label: "Usage analytics" },
  { id: "crashes", label: "When something breaks" },
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
      lead="Your books stay on this device until you choose to upload them. When you do, they are stored in your account so they reach your other devices — readable by you, and by nobody else."
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
              title: "Uploading is your choice",
              body: "Books stay on this device until you say otherwise, and reading works offline.",
            },
            {
              icon: UserX,
              title: "Only your email",
              body: "An account stores your address and nothing else about who you are.",
            },
            {
              icon: BarChart3,
              title: "Usage is opt-in",
              // Names the exception here rather than only in the section below.
              // "Usage is opt-in" on its own reads as "nothing is sent unless
              // you agree", and crash reports are not opt-in.
              body: "Anonymous and off until you switch it on. Crash reports are the one exception.",
            },
            {
              icon: Lock,
              title: "Never sold",
              body: "No trackers, no ads, and your text never trains anything.",
            },
          ]}
        />
      </section>

      <DocSection id="device" title="Your books, and where they are">
        <p>
          Files you open are read inside your browser and kept on this device. They stay there, and
          only there, until you choose to upload them — the first time you sign in with books
          already saved, NeuroLens asks, tells you exactly how many, and does nothing unless you
          agree. <Term>Declining leaves everything where it is.</Term>
        </p>
        <p>
          Once you do upload, a book and everything you have done to it — highlights, notes,
          drawings, bookmarks, reading position and settings — are stored in your account so they
          reach whatever you next read on. A copy stays on the device, which is what lets you keep
          reading with no connection.
        </p>
        <ul>
          <li>Stored in NeuroLens's database, hosted by Supabase in Ireland, inside the EU.</li>
          <li>Encrypted on the way there, and encrypted where it rests.</li>
          <li>
            <Term>Readable by your account alone.</Term> The database refuses to return one reader's
            rows to another — a rule enforced by the database itself, not by application code that
            could forget.
          </li>
          <li>Never read by us for any purpose, never sold, and never used to train anything.</li>
        </ul>
        <p>
          You can download all of it, or erase all of it, from{" "}
          <Link to="/account">your account</Link> at any time. Erasing removes it from your account
          and from this device.
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
          <li>
            Events are deleted after 90 days, automatically. Nothing older than that answers the
            question "how is the app used", so there is no reason to keep it.
          </li>
        </ul>
      </DocSection>

      <DocSection id="crashes" title="When something breaks">
        <p>
          If part of NeuroLens fails while you are using it, it sends a short report so the fault
          can be found and fixed. This is separate from analytics above, and it is the one thing
          that is not switched off by default — a reading app that only hears about crashes from
          people who went looking for a settings page does not hear about them at all.
        </p>
        <p>
          The awkward part is that an error message is written by whatever broke, and a file reader
          that chokes on a page will quote that page back in its complaint. So the message is
          rewritten on your device before it is sent:{" "}
          <Term>anything in quotation marks is replaced</Term>, along with every web address, every
          email address and every number. What is left is the shape of the fault —{" "}
          <em>Unexpected token &lt;q&gt; in JSON at position &lt;n&gt;</em> — which tells a
          developer what to fix and tells them nothing about what you were reading.
        </p>
        <ul>
          <li>
            What is sent: that rewritten message, which part of the app it came from, the list of
            components involved, and the app version.
          </li>
          <li>
            What is not: your account, your address, your name, your IP address, your browser, the
            page you were on, and any part of your text. The table it is stored in has no column for
            any of them.
          </li>
          <li>The same crash is sent once, not once per attempt, and at most ten per visit.</li>
          <li>
            Reports are deleted after 30 days — a crash report is useless once the version it came
            from is gone.
          </li>
          <li>
            <Term>Switching analytics off also stops these.</Term> If you have told NeuroLens not to
            send things, that covers this too, and a browser sending Global Privacy Control or Do
            Not Track is never asked and never reports.
          </li>
        </ul>
      </DocSection>

      <DocSection id="accounts" title="Accounts">
        <p>
          Reading needs an account. Sign in with Google and they confirm who you are; NeuroLens
          never sees your password, and stores nothing from them but your name and email address.
          Your avatar is drawn on your device from a random seed — no photo is fetched or stored.
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
          Because a copy of your books stays on this device, its passcode and the browser extensions
          you trust protect them too — an extension allowed to read every site can read what a site
          stores. Your account password protects the other copy, which is why signing in uses Google
          rather than a password we would have to hold.
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
