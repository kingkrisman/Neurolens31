import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { AuthGate } from "@/components/auth/auth-gate";
import { OnboardingGate } from "@/components/onboarding-gate";
import { FAQ } from "@/lib/faq";
import { appJsonLd, faqJsonLd, jsonLd, seo } from "@/lib/seo";
import { TABS, type TabId } from "@/lib/types";

const TAB_IDS = new Set<string>(TABS.map((tab) => tab.id));

export type HomeSearch = { view?: TabId };

export const Route = createFileRoute("/")({
  /**
   * The home page is the app, so this is where it describes itself — the
   * WebApplication block, and the questions the page visibly answers. The FAQ
   * text comes from the same constant the accordion renders, because structured
   * data that does not match what is on the page is a penalty rather than a
   * feature.
   *
   * Every view lives at this one URL behind `?view=`, and the canonical points
   * at the bare path: five tabs indexed as five near-identical pages would
   * compete with each other for the same query.
   */
  head: () => ({
    ...seo({ path: "/" }),
    scripts: [jsonLd(appJsonLd()), jsonLd(faqJsonLd([...FAQ]))],
  }),
  /**
   * The active view lives in the URL so a tab can be linked, bookmarked, and
   * reached with the back button. `explore` is the default and stays absent
   * from the query string rather than writing `?view=explore` on first paint.
   *
   * An unknown value falls back to the default instead of throwing — a stale
   * or hand-edited link should land on the app, not an error boundary.
   */
  validateSearch: (search: Record<string, unknown>): HomeSearch => {
    const view = search.view;
    return typeof view === "string" && TAB_IDS.has(view) && view !== "explore"
      ? { view: view as TabId }
      : {};
  },
  component: Home,
});

function Home() {
  return (
    <AuthGate>
      {/* Inside the auth gate, so it only ever runs for somebody signed in,
          and outside the shell, so the survey covers the app rather than
          rendering into a tab. */}
      <OnboardingGate>
        <AppShell />
      </OnboardingGate>
    </AuthGate>
  );
}
