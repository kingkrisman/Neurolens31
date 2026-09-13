import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/public-layout";

export const Route = createFileRoute("/thank-you")({ component: ThankYou });

function ThankYou() {
  return (
    <PublicLayout
      eyebrow="Thank you"
      title="Glad you’re here."
      image="/images/hands.jpg"
      imageAlt="Hands turning a paperback in warm light"
    >
      <p>
        NeuroLens exists to make dense pages feel less like work. If it helped you finish a chapter,
        a paper, or a long message, that’s the whole point.
      </p>
      <p>Come back whenever the next page needs a quieter room.</p>
    </PublicLayout>
  );
}
