import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/public-layout";

export const Route = createFileRoute("/privacy")({ component: Privacy });

function Privacy() {
  return (
    <PublicLayout
      eyebrow="Privacy"
      title="Your reading stays with you."
      image="/images/nook.jpg"
      imageAlt="A reader in a sunlit armchair"
    >
      <p>
        NeuroLens keeps reading preferences, recent sessions, and notes in your browser’s local storage.
        Nothing is sent to a server unless you choose to fetch a Bible passage, a British National
        Bibliography record, or a poem. Those requests go to bible-api.com, bible.helloao.org, the
        British Library or Open Library, and poetrydb.org.
      </p>
      <p>
        Uploaded documents are processed on your device. Clearing data from Settings removes saved
        sessions, notes, and profile choices from this browser.
      </p>
      <p>
        We do not sell personal information, and we do not use your text to train models.
      </p>
    </PublicLayout>
  );
}
