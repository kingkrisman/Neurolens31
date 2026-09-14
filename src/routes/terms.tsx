import { Link, createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { PublicLayout } from "@/components/public-layout";

export const Route = createFileRoute("/terms")({ component: Terms });

/** Kept in one place so the page and its summary cannot drift apart. */
const UPDATED = "14 September 2026";

/**
 * Terms of use.
 *
 * Written to be read. Terms that nobody finishes are terms nobody agreed to in
 * any meaningful sense, and this app's readers are the least likely of anyone
 * to push through a wall of defined terms in capital letters. So: short
 * sections, plain sentences, and a summary at the top that says the same thing
 * as the document rather than a friendlier version of it.
 *
 * This is not legal advice and has not been reviewed by a lawyer. It states
 * honestly how the app actually behaves, which is the part only this codebase
 * knows.
 */
function Terms() {
  return (
    <PublicLayout eyebrow="Terms" title="The short version, and the long one.">
      <p className="text-subtle">Last updated {UPDATED}.</p>

      <div className="not-prose rounded-md bg-fg/4 p-4">
        <p className="text-sm font-medium text-fg">In short</p>
        <ul className="mt-2 ml-4 list-disc space-y-1.5 text-sm leading-relaxed text-muted">
          <li>NeuroLens is free to use, and your documents stay on your device.</li>
          <li>What you upload remains yours. We claim nothing in it and do not train on it.</li>
          <li>Only upload things you are allowed to read.</li>
          <li>The app is offered as it is. It is a reading aid, not a medical device.</li>
          <li>You can take your data out, or delete it, at any time, without asking.</li>
        </ul>
      </div>

      <Section title="1. Using NeuroLens">
        <p>
          NeuroLens is a reading application. It is free to use, and you may use it for personal or
          professional reading. You need to be old enough to agree to terms where you live; if you
          are not, an adult should agree on your behalf.
        </p>
      </Section>

      <Section title="2. Your documents stay yours">
        <p>
          Files you upload are read inside your browser and stored on your device. They are not sent
          to us, we cannot see them, and we do not use them to train anything.
        </p>
        <p>
          Because they live on your device, they are subject to your browser's storage limits.
          Clearing your browser data removes them. Keeping a copy of anything important is your
          responsibility — the{" "}
          <Link to="/account" className="text-fg underline underline-offset-2">
            account page
          </Link>{" "}
          will export everything as a single file.
        </p>
      </Section>

      <Section title="3. What you upload">
        <p>
          Only upload documents you own or are otherwise permitted to read and copy. Do not use
          NeuroLens to store or distribute anything unlawful. You keep every right you already had in
          your own files; we acquire none.
        </p>
      </Section>

      <Section title="4. Accounts">
        <p>
          An account is optional — the app works fully without one. Signing in uses Google or Apple,
          so there is no password for us to hold or lose. We receive your name, email address and
          profile picture from them, and nothing else.
        </p>
        <p>
          You are responsible for the security of the account you sign in with. You can sign out or
          stop using the account at any time.
        </p>
      </Section>

      <Section title="5. Features that reach the internet">
        <p>
          Most of NeuroLens is offline. A few features fetch from third parties when you ask for
          them: Bible passages, library catalogue records, poems, and dictionary lookups. Those
          requests go to the service concerned and are governed by its terms. The{" "}
          <Link to="/privacy" className="text-fg underline underline-offset-2">
            Privacy Policy
          </Link>{" "}
          names each one.
        </p>
      </Section>

      <Section title="6. This is a reading aid, not a treatment">
        <p>
          NeuroLens is designed with dyslexia, ADHD and cognitive fatigue in mind, and it may make
          reading easier. It is not a medical device, it does not diagnose anything, and it is not a
          substitute for advice from a professional. Nothing it shows you — including anything the
          adaptive mode notices about your reading — is a clinical finding.
        </p>
      </Section>

      <Section title="7. Offered as it is">
        <p>
          The app is provided without warranties of any kind. We do not promise it will be available
          without interruption, free of faults, or that it will read every file correctly. To the
          fullest extent the law allows, we are not liable for loss arising from using it — including
          loss of documents or notes stored in your browser.
        </p>
        <p>
          Nothing here limits liability that cannot be limited by law, and if you are a consumer, your
          statutory rights are unaffected.
        </p>
      </Section>

      <Section title="8. Changes">
        <p>
          These terms may change as the app does. The date at the top says when they last did.
          Continuing to use NeuroLens after a change means the new terms apply. A change that
          materially reduces your rights will be announced in the app, not slipped in quietly.
        </p>
      </Section>

      <Section title="9. Ending it">
        <p>
          You can stop using NeuroLens whenever you like; deleting your data from the account page is
          immediate and complete on that device. We may suspend access where it is being used
          unlawfully.
        </p>
      </Section>

      <Section title="10. Getting in touch">
        <p>
          Questions about these terms, or anything else, go through{" "}
          <Link to="/support" className="text-fg underline underline-offset-2">
            support
          </Link>
          .
        </p>
      </Section>

      <p className="border-t border-fg/10 pt-6 text-subtle">
        This document describes how the app behaves and is written in plain language rather than
        legal drafting. It has not been reviewed by a lawyer, and it is not legal advice.
      </p>
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
