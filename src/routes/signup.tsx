import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/seo";
import { AuthCard } from "@/components/auth/auth-card";

export const Route = createFileRoute("/signup")({
  head: () => ({
    ...seo({
      title: "Create an account",
      description:
        "Create a free NeuroLens account with Google. Your books, highlights and reading profile, on every device you read on.",
      path: "/signup",
      noindex: true,
    }),
  }),
  component: () => <AuthCard mode="signup" />,
});
