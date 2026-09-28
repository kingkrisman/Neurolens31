import { Link, createFileRoute } from "@tanstack/react-router";
import { breadcrumbJsonLd, jsonLd, seo } from "@/lib/seo";
import { BarChart3, HardDrive, Lock, UserX } from "lucide-react";
import { DocSection, Glance, PublicLayout, Term } from "@/components/public-layout";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    ...seo({
      title: "Privacy",
      description:
        "What NeuroLens stores, where, and what it measures: no camera, books stay on your device unless you choose to upload them, accounts hold only your email, and usage analytics are opt-in, anonymous and schema-locked.",
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

const UPDATED = "28 September 2026";

const TOC = [
  { id: "summary", label: "At a glance" },
  { id: "device", label: "Your books" },
  { id: "measured", label: "What is measured" },
  { id: "usage", label: "Usage analytics" },
  { id: "bringing", label: "Books from elsewhere" },
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
      lead="Your books stay on this device unless you choose to save them to your account. If you do, they reach your other devices — readable by you, and by nobody else."
      meta={
        <>
          <span>Updated {UPDATED}</span>
          <span aria-hidden className="size-1 rounded-full bg-fg/20" />
          <span>6 minute read</span>
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
              body: "Off until you say yes. Books stay on this device, and reading works offline either way.",
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
        {/* Rewritten 28 September 2026. The old text said books stayed on the
            device "until you choose to upload them", which was only true of
            books that were there before signing in: every book opened after
            that went to the account, including after "Keep them here". The
            code now honours that choice, and this says what it does. */}
        <p>
          Files you open are read inside your browser, never on our servers, and they stay on this
          device. <Term>Nothing is uploaded until you say so.</Term> The first time there is a book
          to ask about, NeuroLens asks — and tells you exactly how many books and highlights it
          would send. “Upload” saves them to your account so they are waiting on your other devices;
          “Keep them here” keeps them, and the books you open later, on this device.
        </p>
        <p>
          You can change your mind either way on <Link to="/account">your account page</Link>,
          under “Save my books to my account”.
        </p>
        <p>
          A book in your account is stored along with everything you have done to it — highlights,
          notes, drawings, bookmarks, reading position, and the reading summary described{" "}
          <a href="#measured">below</a>. Your reading settings follow your account either way,
          because they are how the page is laid out rather than anything you read. A copy of
          everything stays on the device, which is what lets you keep reading with no connection.
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

      <DocSection id="measured" title="What is measured, and how">
        <p>
          NeuroLens adjusts the page to how you read, so it keeps track of how you move through the
          text. <Term>It does this without a camera.</Term> It never asks for one, and nothing in it
          could use one.
        </p>
        <p>
          What it watches is the page. The line in a band across the upper part of the screen — or
          the line under your pointer, on a computer — is taken to be the one you are reading, and a
          clock notes how long it stays there. That is all the raw material there is:
        </p>
        <ul>
          <li>
            A line held for 0.4 seconds or more is a pause on that line. Insights calls this a{" "}
            <Term>fixation</Term>; one that lasts a second and a half is a long one.
          </li>
          <li>
            Moving on to the next line is a step forward — a <Term>saccade</Term>, in Insights.
          </li>
          <li>
            Going back to an earlier line is a reread — a <Term>regression</Term>.
          </li>
          <li>Jumping three or more lines ahead is a skip.</li>
          <li>Leaving the text altogether, so no line is in the band, is a break.</li>
        </ul>
        <p>
          From those it works out your pace in words per minute, how often you pause and reread, and
          a rough pattern — steady, scanning, or going back over things. The words fixation, saccade
          and regression are borrowed from eye-movement research because they describe the same
          shape of reading. Here they describe the page, not your eyes.
        </p>
        <p>
          When you read in pages rather than scrolling, turning a page stands in for moving down it:
          a page counts as being read for about as long as it should take at your pace, and only
          after that does a still page count as a pause.
        </p>
        <p>
          <Term>Where it is kept.</Term> The moment-to-moment detail stays on this device, where it
          adjusts the page and draws Insights. For a book saved to your account, a short summary
          goes with it: your pace, how many pauses and rereads, time spent, the pattern, and how many
          recall questions you got right. What the adaptive reader has learned about which changes
          help you is saved with your settings. None of it is part of usage analytics, and none of it
          is used for anything except your own reading.
        </p>
        <p>
          Your reading garden — the plants that grow as you finish chapters — stays on this device
          only. It names the books you have read, so it is never sent anywhere, even when your books
          are.
        </p>
        <p>
          <Term>Sensors, only when you switch them on.</Term> Two features use more than the page,
          and both are off until you turn them on:
        </p>
        <ul>
          <li>
            Motion cues read your phone’s motion sensor, to steady reading in a moving car or train.
            The readings are used on the device and never stored or sent.
          </li>
          <li>
            Talking to Neuro uses the microphone to hear its name. Your browser does the listening,
            and some browsers — Chrome among them — send the audio to their own speech service to
            turn it into words. NeuroLens never receives or keeps the audio, and it stops listening
            the moment you switch it off.
          </li>
        </ul>
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

      <DocSection id="bringing" title="Bringing books in from elsewhere">
        <p>
          Two ways of connecting what you already have, and they behave very differently, so both
          are described rather than bundled together as "integrations".
        </p>
        <p>
          <Term>A catalogue you connect.</Term> If you point NeuroLens at an OPDS catalogue — your
          own Calibre or Kavita server, or a public one like Standard Ebooks — the request is made
          by NeuroLens rather than by your browser, because your browser is not permitted to call
          arbitrary servers from this page. That means the catalogue sees a request from us, not
          from you: not your address, not your browser, nothing about you at all. We do not keep the
          address you entered, and we do not keep what came back.
        </p>
        <p>
          <Term>A Kindle file you open.</Term> <em>My Clippings.txt</em> is read entirely inside
          your browser. Nothing about it is sent anywhere — not to us, and certainly not to Amazon,
          who have no part in this. The highlights become highlights in your library, and follow the
          same rules as any other: on this device until you choose to upload them.
        </p>
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
