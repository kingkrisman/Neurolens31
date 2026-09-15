import { Link, createFileRoute } from "@tanstack/react-router";
import { FileCheck2, HeartPulse, LogOut, ShieldCheck } from "lucide-react";
import { DocSection, Glance, PublicLayout } from "@/components/public-layout";

export const Route = createFileRoute("/terms")({ component: Terms });

const UPDATED = "15 September 2026";

const TOC = [
  { id: "summary", label: "In short" },
  { id: "using", label: "Using NeuroLens" },
  { id: "documents", label: "Your documents" },
  { id: "uploads", label: "What you upload" },
  { id: "accounts", label: "Accounts" },
  { id: "services", label: "Outside services" },
  { id: "not-medical", label: "Not a treatment" },
  { id: "as-is", label: "Offered as it is" },
  { id: "changes", label: "Changes" },
  { id: "ending", label: "Ending it" },
  { id: "contact", label: "Contact" },
];

/**
 * Terms of use, written to be read.
 *
 * Terms nobody finishes are terms nobody meaningfully agreed to, and this app's
 * readers are the least likely of anyone to push through capitals and defined
 * terms. So: a summary that says the same thing as the document rather than a
 * friendlier version of it, then short numbered sections — numbered because
 * terms are cited by clause.
 *
 * Not legal advice; not reviewed by a lawyer.
 */
function Terms() {
  return (
    <PublicLayout
      eyebrow="Terms"
      title="The short version, and the long one."
      lead="Plain terms for a reading app. The summary below says the same thing as the document — not a friendlier version of it."
      meta={
        <>
          <span>Updated {UPDATED}</span>
          <span aria-hidden className="size-1 rounded-full bg-fg/20" />
          <span>5 minute read</span>
        </>
      }
      toc={TOC}
    >
      <section id="summary" className="scroll-mt-28">
        <Glance
          items={[
            { icon: FileCheck2, title: "Free, and yours", body: "What you upload stays on your device and remains entirely yours." },
            { icon: ShieldCheck, title: "Upload fairly", body: "Only upload things you are allowed to read and copy." },
            { icon: HeartPulse, title: "A reading aid", body: "Designed to help — but not a medical device, and it diagnoses nothing." },
            { icon: LogOut, title: "Leave any time", body: "Export or erase your data yourself, whenever you like." },
          ]}
        />
      </section>

      <DocSection id="using" kicker="1" title="Using NeuroLens">
        <p>
          NeuroLens is a reading application, free for personal or professional reading. You need to be
          old enough to agree to terms where you live; if you are not, an adult should agree for you.
        </p>
      </DocSection>

      <DocSection id="documents" kicker="2" title="Your documents stay yours">
        <p>
          Files you upload are read inside your browser and stored on your device. They are not sent to
          us, we cannot see them, and we do not use them to train anything.
        </p>
        <p>
          Because they live on your device, browser storage limits apply, and clearing browser data
          removes them. Keeping a copy of anything important is your responsibility —{" "}
          <Link to="/account">your account</Link> exports everything as one file.
        </p>
      </DocSection>

      <DocSection id="uploads" kicker="3" title="What you upload">
        <p>
          Only upload documents you own or are otherwise permitted to read and copy, and do not use
          NeuroLens to store or share anything unlawful. You keep every right you already had in your
          files; we acquire none.
        </p>
      </DocSection>

      <DocSection id="accounts" kicker="4" title="Accounts">
        <p>
          An account is optional — the app works fully without one. Signing in uses Google or Apple, so
          there is no password for us to hold. You are responsible for the security of the account you
          sign in with, and can stop using it at any time.
        </p>
      </DocSection>

      <DocSection id="services" kicker="5" title="Features that reach the internet">
        <p>
          A few features fetch from third parties when you ask: Bible passages, library records, poems
          and definitions. Those requests are governed by each service's own terms; the{" "}
          <Link to="/privacy">privacy page</Link> names them.
        </p>
      </DocSection>

      <DocSection id="not-medical" kicker="6" title="A reading aid, not a treatment">
        <p>
          NeuroLens is designed with dyslexia, ADHD and cognitive fatigue in mind, and may make reading
          easier. It is not a medical device, does not diagnose anything, and is no substitute for a
          professional. Nothing it shows you — including what adaptive mode notices — is a clinical
          finding.
        </p>
      </DocSection>

      <DocSection id="as-is" kicker="7" title="Offered as it is">
        <p>
          The app comes without warranties of any kind. We do not promise it will always be available,
          free of faults, or read every file correctly. As far as the law allows, we are not liable for
          loss from using it — including documents or notes stored in your browser.
        </p>
        <p>Nothing here limits liability the law does not allow to be limited, and consumer rights are unaffected.</p>
      </DocSection>

      <DocSection id="changes" kicker="8" title="Changes">
        <p>
          These terms may change as the app does; the date at the top says when. A change that
          materially reduces your rights will be announced in the app, not slipped in quietly.
        </p>
      </DocSection>

      <DocSection id="ending" kicker="9" title="Ending it">
        <p>
          Stop using NeuroLens whenever you like — erasing your data from the account page is immediate
          and complete on that device. Access may be suspended where the app is used unlawfully.
        </p>
      </DocSection>

      <DocSection id="contact" kicker="10" title="Getting in touch">
        <p>
          Questions about these terms go through <Link to="/support">support</Link>.
        </p>
        <p className="text-sm text-subtle">
          Written in plain language to describe how the app behaves. Not reviewed by a lawyer, and not
          legal advice.
        </p>
      </DocSection>
    </PublicLayout>
  );
}
