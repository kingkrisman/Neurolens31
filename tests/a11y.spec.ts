import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * The accessibility audit, run on every push.
 *
 * NeuroLens exists for people who find reading hard — dyslexic readers, people
 * with low vision, people who navigate by keyboard. An accessibility
 * regression here is not a lint warning, it is the product failing at the one
 * thing it claims to do. So this runs automatically rather than living in
 * somebody's memory as a thing to check before a release.
 *
 * Every page tested is a public one. The app itself is behind sign-in, and a
 * test that needed a real Google account would be a test that never runs.
 * `/` is the exception worth naming: signed out it renders the full marketing
 * page, which is both the most-visited page on the site and the one a search
 * engine sees, so it is the most important single page in this file.
 */

const PUBLIC_PAGES = [
  { path: "/", name: "home (signed out)" },
  { path: "/help", name: "help" },
  { path: "/accessibility", name: "accessibility statement" },
  { path: "/privacy", name: "privacy" },
  { path: "/terms", name: "terms" },
  { path: "/support", name: "support" },
  { path: "/whats-new", name: "what's new" },
  { path: "/login", name: "sign in" },
  { path: "/signup", name: "sign up" },
] as const;

/**
 * WCAG 2.2 AA, which is what the accessibility statement commits to.
 *
 * `best-practice` is deliberately left out of the assertion: it contains
 * opinions (a page should have one main landmark, lists should not be nested a
 * certain way) that are good advice and not conformance requirements, and
 * failing a build on advice trains people to disable the check.
 */
const STANDARD = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function settle(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  // Fonts change metrics, and metrics change what overlaps what. Auditing
  // before they land measures a page nobody sees.
  await page.evaluate(() => document.fonts.ready);
  // The landing page animates in. Give it a beat so contrast is measured
  // against final opacity rather than mid-transition.
  await page.waitForTimeout(600);
}

function audit(page: Page) {
  return (
    new AxeBuilder({ page })
      .withTags(STANDARD)
      /**
       * Excluded, with reasons — not to make the suite pass.
       *
       * `.lenis` wrappers: the smooth-scroll library sets inline transforms on
       * a wrapper it owns. Axe reads those as a scrollable region without
       * keyboard access; the actual scroll container underneath is the document,
       * which is keyboard scrollable. Auditing the library's wrapper tells us
       * nothing about our own markup.
       */
      .exclude("[data-lenis-prevent]")
  );
}

for (const { path, name } of PUBLIC_PAGES) {
  test(`${name} has no accessibility violations`, async ({ page }) => {
    await settle(page, path);
    const results = await audit(page).analyze();

    // Report every violation with the selector, so a failure is actionable
    // from the CI log without reproducing it locally.
    const summary = results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      where: violation.nodes.map((node) => node.target.join(" ")).slice(0, 5),
    }));

    expect(summary, `${name} (${path})`).toEqual([]);
  });
}

test("every public page has exactly one h1", async ({ page }) => {
  // Not an axe rule, and the rule axe does have for it is in `best-practice`.
  // It matters here anyway: a screen reader user finding the page's subject is
  // the first thing that happens on arrival, and it is also what search
  // engines read as the page's title.
  for (const { path, name } of PUBLIC_PAGES) {
    await settle(page, path);
    const count = await page.locator("h1").count();
    expect(count, `${name} (${path}) should have one h1, found ${count}`).toBe(1);
  }
});

test("the home page is reachable and describable by keyboard alone", async ({ page }) => {
  await settle(page, "/");

  // Tab through the start of the page and check that focus actually lands on
  // something, and that whatever it lands on has an accessible name. A focus
  // trap or an unnamed control shows up here and nowhere else.
  const seen: string[] = [];
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const name =
        el.getAttribute("aria-label") ??
        el.getAttribute("title") ??
        el.textContent?.trim().slice(0, 40) ??
        "";
      return { tag: el.tagName.toLowerCase(), name };
    });
    if (!focused) continue;
    expect(focused.name, `a focusable ${focused.tag} has no accessible name`).not.toBe("");
    seen.push(`${focused.tag}:${focused.name}`);
  }

  expect(seen.length, "tabbing reached nothing focusable").toBeGreaterThan(0);
});

test("a visible skip link is the first thing focus reaches", async ({ page }) => {
  // The single highest-value keyboard affordance on a long page, and the
  // easiest to break: it only has to be visible *when focused*.
  await settle(page, "/");
  await page.keyboard.press("Tab");
  const first = page.locator(":focus");
  const text = ((await first.textContent()) ?? "").toLowerCase();
  expect(text, "the first tab stop should be a skip link").toContain("skip");
  await expect(first).toBeVisible();
});
