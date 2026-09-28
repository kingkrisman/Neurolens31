import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Recall cards and the reading garden.
 *
 * The loop a reader actually goes through: finish a chapter, see a sprout,
 * take the card, see a flower, find the plant in Insights. And the promise
 * underneath it — the result is kept on the book, not shown and dropped as
 * the old understanding check did.
 */

function fakeSession(id: string) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: id, role: "authenticated", aud: "authenticated", exp })}.unsigned`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: exp,
    refresh_token: "not-used",
    user: {
      id,
      aud: "authenticated",
      role: "authenticated",
      email: `${id}@example.test`,
      app_metadata: { provider: "google" },
      user_metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
}

const PLACES = ["river", "orchard", "harbour", "mill", "bridge", "chapel", "market", "forest"];
const chapter = (who: string, count: number) =>
  Array.from(
    { length: count },
    (_, i) =>
      `${who} reached the ${PLACES[(i * 5 + who.length) % PLACES.length]} just before the ${["rain", "bells", "dark", "tide"][i % 4]} came, and stopped there for a while to think about letter ${i + 1}.`,
  ).join(" ");

const BOOK = [
  "THE LONG ROAD",
  "",
  "CHAPTER I.",
  "",
  chapter("Ada", 22),
  "",
  "CHAPTER II.",
  "",
  chapter("Beatrice", 22),
].join("\n");

async function signIn(page: Page, id: string, garden?: object) {
  await page.addInitScript(
    ([key, session, uid, seeded]) => {
      localStorage.setItem(key as string, JSON.stringify(session));
      localStorage.setItem(`neurolens-meta::${uid}`, JSON.stringify({ onboardedAt: Date.now() }));
      if (seeded) localStorage.setItem(`neurolens-garden::${uid}`, JSON.stringify(seeded));
    },
    ["neurolens-auth", fakeSession(id), id, garden ?? null],
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
}

/** Runs in the page, against the store module the page itself loaded. */
async function withStore<T>(page: Page, fn: string, arg?: unknown): Promise<T> {
  return page.evaluate(
    async ([body, value]) => {
      const url =
        performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .find((name) => name.includes("/src/lib/store.ts")) ?? "/src/lib/store.ts";
      const { useAppStore } = await import(/* @vite-ignore */ url);
      return new Function("store", "value", body)(useAppStore, value);
    },
    [fn, arg] as const,
  ) as Promise<T>;
}

test("finishing a chapter grows the garden, and a recall card opens a flower", async ({ page }) => {
  await signIn(page, "6a6a6a6a-1111-4111-8111-111111111111");
  // A fast target pace, so "genuinely finished" — a quarter of the expected
  // reading time — is seconds rather than minutes.
  await withStore(
    page,
    "store.getState().setTargetWpm(1200); store.getState().startReading(value, { title: 'The Long Road', kind: 'text' });",
    BOOK,
  );
  await expect(page.locator(".reader-scroll")).toHaveAttribute("data-layout", "pages");

  const pages = page.getByRole("navigation", { name: "Pages" });
  for (let i = 0; i < 20; i += 1) {
    const match = (await pages.innerText()).match(/(\d+) of (\d+)/);
    if (match && match[1] === match[2]) break;
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(350);
  }

  await expect(page.getByText(/A new sprout for The Long Road/)).toBeVisible({ timeout: 25_000 });
  await page.getByRole("button", { name: /Quick recall/ }).click();

  for (let question = 0; question < 2; question += 1) {
    const card = page.locator(".nl-part-done fieldset");
    if (!(await card.count())) break;
    await card.locator("button[aria-pressed]").first().click();
    await page.getByRole("button", { name: /^(Next|Done)$/ }).click();
  }

  const done = page.locator(".recall-done");
  await expect(done).toContainText(/Held on|Slipped away/);
  await expect(done).toContainText("A flower opened on The Long Road");

  const saved = await withStore<{ asked?: number; comprehension?: number }>(
    page,
    "const s = store.getState(); const b = s.sessions.find((x) => x.content === s.text); return { asked: b?.recall?.asked, comprehension: b?.comprehension };",
  );
  expect(saved.asked).toBe(2);
  expect(typeof saved.comprehension).toBe("number");

  await page.getByRole("button", { name: "Insights", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your garden" })).toBeVisible();
  await expect(page.locator(".garden-plant")).toHaveCount(1);
});

test("the garden is described to screen readers and has no accessibility violations", async ({
  page,
}) => {
  const garden = {
    plants: [
      {
        id: "a1",
        title: "Frankenstein",
        plantedAt: 1,
        grewAt: 2,
        chapters: [1, 2, 3],
        blooms: [1],
      },
      { id: "b2", title: "Dracula", plantedAt: 3, grewAt: 4, chapters: [1], blooms: [] },
    ],
  };
  await signIn(page, "6b6b6b6b-1111-4111-8111-111111111111", garden);
  await withStore(page, "store.getState().setTab('insights');");
  await expect(page.getByRole("heading", { name: "Your garden" })).toBeVisible();
  await expect(
    page.getByRole("listitem", { name: "Frankenstein: 3 chapters finished, 1 flower" }),
  ).toBeVisible();

  const results = await new AxeBuilder({ page })
    .include(".garden-plant")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});
