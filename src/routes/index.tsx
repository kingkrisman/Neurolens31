import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { TABS, type TabId } from "@/lib/types";

const TAB_IDS = new Set<string>(TABS.map((tab) => tab.id));

export type HomeSearch = { view?: TabId };

export const Route = createFileRoute("/")({
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
  return <AppShell />;
}
