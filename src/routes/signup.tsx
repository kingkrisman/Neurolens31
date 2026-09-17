import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/seo";
import { AuthCard } from "@/components/auth/auth-card";

export const Route = createFileRoute("/signup")({
  head: () => ({
    ...seo({
      title: "Create an account",
      description:
        "Create a NeuroLens account with Google or Apple. Optional — the app works fully without one.",
      path: "/signup",
      noindex: true,
    }),
  }),
  component: () => <AuthCard mode="signup" />,
});
