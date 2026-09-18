import { Link, createFileRoute } from "@tanstack/react-router";
import { breadcrumbJsonLd, jsonLd, seo } from "@/lib/seo";
import { Copyright, FileCheck2, HeartPulse, LogOut, Scale, ShieldCheck } from "lucide-react";
import { DocSection, Glance, PublicLayout, Term } from "@/components/public-layout";

export const Route = createFileRoute("/terms")({
  head: () => ({
    ...seo({
      title: "Terms",
      description:
        "Plain terms for a reading app — what you may upload, where it is stored, what we promise, what we do not, and how a dispute is settled.",
      path: "/terms",
    }),
    scripts: [
      jsonLd(
        breadcrumbJsonLd([
          { name: "NeuroLens", path: "/" },
          { name: "Terms", path: "/terms" },
        ]),
      ),
    ],
  }),
  component: Terms,
});

const UPDATED = "17 September 2026";

/**
 * Blanks, deliberately visible.
 *
 * An arbitration clause does nothing until it names where a dispute is heard
 * and under whose rules, and those follow from where NeuroLens is established —
 * which is not something this file can invent. Left as bracketed text so they
 * read as unfinished on the page as well as in the source, rather than shipping
 * as a plausible-looking answer nobody checked.
 */
const GOVERNING_LAW = "[country or state, and its courts]";
const ARBITRATION_BODY = "[arbitration body, and the rules it publishes]";

const TOC = [
  { id: "summary", label: "In short" },
  { id: "using", label: "Using NeuroLens" },
  { id: "documents", label: "Your documents" },
  { id: "uploads", label: "What you upload" },
  { id: "responsibility", label: "Answering for it" },
  { id: "accounts", label: "Accounts" },
  { id: "services", label: "Outside services" },
  { id: "not-medical", label: "Not a treatment" },
  { id: "as-is", label: "Offered as it is" },
  { id: "disputes", label: "Disputes" },
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
 * Two clauses carry more weight than the rest and are written accordingly. The
 * one about content says plainly that nothing here is moderated — neither what
 * stays on a device nor what is uploaded. The one about disputes gives up a
 * right people usually
 * are not told they are giving up, so it says so in the summary, keeps its
 * opt-out in the open rather than in a footnote, and does not pretend to
 * override consumer law that says arbitration cannot be forced.
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
          <span>7 minute read</span>
        </>
      }
      toc={TOC}
    >
      <section id="summary" className="scroll-mt-28">
        <Glance
          items={[
            {
              icon: FileCheck2,
              title: "Free, and yours",
              body: "Uploading is your choice, and what you upload remains entirely yours.",
            },
            {
              icon: ShieldCheck,
              title: "Upload fairly",
              body: "Only upload things you are allowed to read and copy.",
            },
            {
              icon: Copyright,
              title: "Yours to answer for",
              body: "Nothing you open is checked or approved by us, wherever it is kept.",
            },
            {
              icon: Scale,
              title: "Disputes, and an opt-out",
              body: "Serious disputes go to individual arbitration — and you have 30 days to opt out of that.",
            },
            {
              icon: HeartPulse,
              title: "A reading aid",
              body: "Designed to help — but not a medical device, and it diagnoses nothing.",
            },
            {
              icon: LogOut,
              title: "Leave any time",
              body: "Export or erase your data yourself, whenever you like.",
            },
          ]}
        />
      </section>

      <DocSection id="using" kicker="1" title="Using NeuroLens">
        <p>
          NeuroLens is a reading application, free for personal or professional reading. You need to
          be old enough to agree to terms where you live; if you are not, an adult should agree for
          you.
        </p>
      </DocSection>

      <DocSection id="documents" kicker="2" title="Your documents stay yours">
        <p>
          Files you open are read inside your browser and kept on your device. They stay there until
          you choose to upload them to your account; NeuroLens asks before it sends anything, and
          declining leaves everything where it is.
        </p>
        <p>
          Uploaded or not, they remain yours. You keep every right you already had in them, we
          acquire none, we do not read them, and we do not use them to train anything. What an
          account changes is reach — the same book, on whatever you next read on — not ownership.
        </p>
        <p>
          A copy stays on the device either way, which is what lets you read offline, so browser
          storage limits still apply and clearing browser data still clears that copy. Anything in
          your account survives it. <Link to="/account">Your account</Link> exports everything as
          one file, and erases everything on request.
        </p>
      </DocSection>

      <DocSection id="uploads" kicker="3" title="What you upload">
        <p>
          Only upload documents you own or are otherwise permitted to read and copy, and do not use
          NeuroLens to store or share anything unlawful. You keep every right you already had in
          your files; we acquire none.
        </p>
      </DocSection>

      <DocSection id="responsibility" kicker="4" title="Answering for what you bring in">
        <p>
          Everything you bring into NeuroLens — a document, a note, a highlight, a bookmark — is
          yours. It is also yours to answer for.
        </p>
        <p>
          Nothing you open here is reviewed, moderated or approved by us. What you keep on your
          device never reaches us at all; what you upload is stored for you and read by nobody.{" "}
          <Term>Nothing being blocked is not the same as something being checked.</Term> No person
          looks at what you open, and no system vets it.
        </p>
        <p>
          So having the right to read, copy and adapt what you bring in is on you, as is what you do
          with it afterwards — including anything you export and pass on to somebody else. If a
          third party brings a claim against us because of material you brought in or shared, you
          cover what it reasonably costs us to deal with. That does not apply where the claim is our
          fault rather than yours, and it takes away none of the rights the law gives you as a
          consumer.
        </p>
        <p>
          We cannot take a file off your device — only you can do that, and the account page erases
          what you have uploaded. Where something is being used unlawfully, that sits between you
          and whoever holds the rights; where it sits in an account and we are told,{" "}
          <Link to="/support">support</Link> is how to reach us, and we will act on it.
        </p>
      </DocSection>

      <DocSection id="accounts" kicker="5" title="Accounts">
        <p>
          Reading requires an account, so that your books and highlights can follow you between
          devices. Signing in uses Google, so there is no password for us to hold. You are
          responsible for the security of the account you sign in with, and can stop using it at any
          time — the account page erases everything we hold.
        </p>
      </DocSection>

      <DocSection id="services" kicker="6" title="Features that reach the internet">
        <p>
          A few features fetch from third parties when you ask: Bible passages, library records,
          poems and definitions. Those requests are governed by each service's own terms; the{" "}
          <Link to="/privacy">privacy page</Link> names them.
        </p>
      </DocSection>

      <DocSection id="not-medical" kicker="7" title="A reading aid, not a treatment">
        <p>
          NeuroLens is designed with dyslexia, ADHD and cognitive fatigue in mind, and may make
          reading easier. It is not a medical device, does not diagnose anything, and is no
          substitute for a professional. Nothing it shows you — including what adaptive mode notices
          — is a clinical finding.
        </p>
      </DocSection>

      <DocSection id="as-is" kicker="8" title="Offered as it is">
        <p>
          The app comes without warranties of any kind. We do not promise it will always be
          available, free of faults, or read every file correctly. As far as the law allows, we are
          not liable for loss from using it — including documents or notes stored in your browser.
        </p>
        <p>
          Nothing here limits liability the law does not allow to be limited, and consumer rights
          are unaffected.
        </p>
      </DocSection>

      <DocSection id="disputes" kicker="9" title="If we end up in a dispute">
        <p>
          <Term>Talk to us first.</Term> Nearly everything is a misunderstanding or a bug. Send{" "}
          <Link to="/support">support</Link> a description of the problem and what you would like
          done about it, and give us 60 days to put it right. Most of this section never comes up.
        </p>
        <p>
          <Term>Then arbitration, not a courtroom.</Term> If 60 days pass without resolution, a
          dispute between us is settled by binding arbitration before {ARBITRATION_BODY}, rather
          than by a judge or a jury. Arbitration is usually faster and cheaper than a court case,
          and the arbitrator can award the same remedies a court could — but it is more private, the
          grounds for appeal are far narrower, and you are giving up a day in court. That is why it
          is named in the summary at the top of this page rather than left down here to be
          discovered.
        </p>
        <p>
          <Term>You can opt out, and it costs you nothing.</Term> Within 30 days of first accepting
          these terms, email <Link to="/support">support</Link> with the words{" "}
          <Term>arbitration opt-out</Term> and the address you use here. That is the whole process.
          Nothing else in these terms changes, and we will not treat you differently for it — you
          simply keep the courts in {GOVERNING_LAW} instead.
        </p>
        <p>
          <Term>One person at a time.</Term> Claims are brought individually: not as a class action,
          not combined with anybody else's claim, and not by a representative acting for a group. If
          that restriction turns out to be unenforceable for a particular claim, then that claim
          belongs in court rather than in arbitration, and the rest of this section still stands.
        </p>
        <p>
          <Term>Two things either of us can still take to court.</Term> A claim small enough for a
          small claims court can go there instead, and either side can ask a court to stop misuse of
          intellectual property without waiting on arbitration.
        </p>
        <p>
          <Term>Where local law says otherwise, local law wins.</Term> Plenty of places — the EU and
          the UK among them — do not let a consumer be required to arbitrate in advance. If you live
          somewhere like that, this section takes nothing away from you: you keep your local courts,
          and your mandatory consumer protections apply in full. These terms are otherwise governed
          by the law of {GOVERNING_LAW}.
        </p>
      </DocSection>

      <DocSection id="changes" kicker="10" title="Changes">
        <p>
          These terms may change as the app does; the date at the top says when. A change that
          materially reduces your rights will be announced in the app, not slipped in quietly.
        </p>
      </DocSection>

      <DocSection id="ending" kicker="11" title="Ending it">
        <p>
          Stop using NeuroLens whenever you like — erasing your data from the account page is
          immediate and complete on that device. Access may be suspended where the app is used
          unlawfully.
        </p>
      </DocSection>

      <DocSection id="contact" kicker="12" title="Getting in touch">
        <p>
          Questions about these terms go through <Link to="/support">support</Link>.
        </p>
        <p className="text-sm text-subtle">
          Written in plain language to describe how the app behaves. Not reviewed by a lawyer, and
          not legal advice. The arbitration section in particular decides where and how a dispute is
          heard, and it is unfinished until the bracketed blanks above are filled in and a lawyer
          has read it.
        </p>
      </DocSection>
    </PublicLayout>
  );
}
