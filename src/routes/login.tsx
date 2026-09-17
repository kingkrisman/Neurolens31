import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/seo";
import { AuthCard } from "@/components/auth/auth-card";

export const Route = createFileRoute("/login")({
  head: () => ({
    ...seo({
      title: "Sign in",
      description:
        "Sign in to NeuroLens with Google to reach your books, highlights and reading settings on any device.",
      path: "/login",
      noindex: true,
    }),
  }),
  component: () => <AuthCard mode="signin" />,
});
