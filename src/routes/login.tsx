import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/seo";
import { AuthCard } from "@/components/auth/auth-card";

export const Route = createFileRoute("/login")({
  head: () => ({
    ...seo({
      title: "Sign in",
      description:
        "Sign in to NeuroLens with Google or Apple. Optional — the app works fully without an account.",
      path: "/login",
      noindex: true,
    }),
  }),
  component: () => <AuthCard mode="signin" />,
});
