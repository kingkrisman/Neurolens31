import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Highlights coming back on the Explore page.
 *
 * A passage marked days ago returns as a card; "Next" moves on, "Open in
 * book" lands on the marked line, and nothing comes back sooner than it
 * should. See lib/resurface.ts.
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

async function signIn(page: Page, id: string) {
  await page.addInitScript(
    ([key, session, uid]) => {
      localStorage.setItem(key as string, JSON.stringify(session));
      localStorage.setItem(`neurolens-meta::${uid}`, JSON.stringify({ onboardedAt: Date.now() }));
      localStorage.setItem(`neurolens-upload-choice:${uid}`, "declined");
    },
    ["neurolens-auth", fakeSession(id), id],
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

const BOOK = Array.from(
  { length: 90 },
  (_, i) =>
    `Paragraph ${i + 1} of the lighthouse story. The keeper climbed the stairs at dusk and lit lamp ${i + 1}.`,
).join("\n\n");

// Line ids are paragraph * 1000 + sentence: the second sentence of paragraph 61.
const LINE = 60001;

async function seed(page: Page) {
  await withStore(page, "store.getState().startReading(value, { title: 'The Lighthouse Keeper', kind: 'text' });", BOOK);
  await expect(page.locator(`#line-${LINE}`)).toBeAttached();
  const text = (await page.locator(`#line-${LINE}`).textContent())!.trim();
  await withStore(
    page,
    `const day = 86400000, now = Date.now();
     const key = store.getState().text.trim().slice(0, 48);
     store.setState({ highlights: { [key]: [
       { lineIdx: ${LINE}, section: 0, start: 0, end: value.length, text: value, at: now - 10 * day, color: "sky", note: "Why does he count them?" },
       { lineIdx: 5000, section: 0, start: 0, end: 37, text: "The keeper climbed the stairs at dusk", at: now - 30 * day, color: "butter" },
       { lineIdx: 7000, section: 0, start: 0, end: 30, text: "A passage marked only yesterday", at: now - day, color: "rose" },
     ] } });
     store.getState().setTab("explore");`,
    text,
  );
}

test("a marked passage comes back, oldest first, and opens at its line", async ({ page }) => {
  await signIn(page, "7c7c7c7c-1111-4111-8111-111111111111");
  await seed(page);

  const card = page.getByRole("heading", { name: "From your highlights" });
  await expect(card).toBeVisible();
  // Yesterday's mark is not due yet.
  await expect(page.getByText("1 of 2", { exact: true })).toBeVisible();
  await expect(page.locator("figure blockquote")).toContainText("climbed the stairs at dusk");

  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator("figure blockquote")).toContainText("lamp 61");
  await expect(page.getByText("Why does he count them?")).toBeVisible();

  await page.getByRole("button", { name: /Open in book/ }).click();
  const line = page.locator(`#line-${LINE}`);
  await expect(line).toBeInViewport();
  await expect(line).toHaveClass(/active/);

  // Both seen: nothing more today.
  await withStore(page, "store.getState().setTab('explore');");
  await expect(page.getByRole("heading", { name: "From your highlights" })).toHaveCount(0);
});

test("'Not today' puts the card away, and the card has no accessibility violations", async ({
  page,
}) => {
  await signIn(page, "7d7d7d7d-1111-4111-8111-111111111111");
  await seed(page);
  await expect(page.getByRole("heading", { name: "From your highlights" })).toBeVisible();

  const results = await new AxeBuilder({ page })
    .include("[aria-labelledby='returns-title']")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);

  await page.getByRole("button", { name: "Not today" }).click();
  await expect(page.getByRole("heading", { name: "From your highlights" })).toHaveCount(0);
});

test("turning it off in settings keeps it off", async ({ page }) => {
  await signIn(page, "7e7e7e7e-1111-4111-8111-111111111111");
  await seed(page);
  await expect(page.getByRole("heading", { name: "From your highlights" })).toBeVisible();
  await withStore(page, "const s = store.getState(); s.setProfile({ ...s.profile, resurface: false });");
  await expect(page.getByRole("heading", { name: "From your highlights" })).toHaveCount(0);
});
