import { expect, test, type Page } from "@playwright/test";

/**
 * Turning pages.
 *
 * A tester asked for Kindle-style pages in fiction and the long scroll for
 * documents. Pages are CSS columns turned by moving the scroller exactly one
 * screen, and several things only a browser can show have to hold: a turn is
 * one whole screen, the edges of a chapter lead into the next one (and back
 * into the last page of the previous one), a turn is not mistaken for
 * skipping ahead, and on a phone a swipe turns the page without opening the
 * definition of the word under the finger.
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

const paragraphs = (chapter: number, count: number) =>
  Array.from(
    { length: count },
    (_, i) =>
      `In chapter ${chapter}, paragraph ${i + 1} tells a small part of the story. The lamp was low, the road was long, and the reader kept going one line at a time until the page was done.`,
  ).join("\n\n");

const BOOK = [
  "THE LONG ROAD",
  "",
  "CHAPTER I.",
  "",
  paragraphs(1, 18),
  "",
  "CHAPTER II.",
  "",
  paragraphs(2, 18),
  "",
  "CHAPTER III.",
  "",
  paragraphs(3, 18),
].join("\n");

/** Open the book; with `pages`, turn page turning on first, as a reader would. */
async function openBook(page: Page, id: string, pages = true) {
  await page.addInitScript(
    ([key, session, uid]) => {
      localStorage.setItem(key as string, JSON.stringify(session));
      localStorage.setItem(`neurolens-meta::${uid}`, JSON.stringify({ onboardedAt: Date.now() }));
    },
    ["neurolens-auth", fakeSession(id), id],
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await page.evaluate(
    async ([text, turnPages]) => {
      // The store module the page itself loaded. A dev server that has hot-
      // reloaded serves it under a versioned URL, and the bare path would give
      // a second, unconnected store.
      const url =
        performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .find((name) => name.includes("/src/lib/store.ts")) ?? "/src/lib/store.ts";
      const { useAppStore } = await import(/* @vite-ignore */ url);
      if (turnPages) {
        const state = useAppStore.getState();
        state.setProfile({ ...state.profile, pageLayout: "pages" });
      }
      useAppStore.getState().startReading(text, { title: "The Long Road", kind: "text" });
    },
    [BOOK, pages] as const,
  );
  await expect(page.locator(".reader-scroll")).toHaveAttribute(
    "data-layout",
    pages ? "pages" : "scroll",
    { timeout: 10_000 },
  );
  await page.waitForTimeout(800);
}

test("a book scrolls unless the reader has turned pages on", async ({ page }) => {
  // Pages were the default for books for one release and were reported as
  // stressful. They are off until a reader asks for them.
  await openBook(page, "5e5e5e5e-1111-4111-8111-111111111111", false);
  await expect(page.getByRole("navigation", { name: "Pages" })).toHaveCount(0);
});

const scroller = (page: Page) =>
  page.evaluate(() => {
    const node = document.querySelector<HTMLElement>(".reader-scroll")!;
    return { left: Math.round(node.scrollLeft), width: node.clientWidth };
  });

const readerState = (page: Page) =>
  page.evaluate(async () => {
    const url =
      performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .find((name) => name.includes("/src/lib/store.ts")) ?? "/src/lib/store.ts";
    const { useAppStore } = await import(/* @vite-ignore */ url);
    const state = useAppStore.getState();
    return { chapter: state.chapterIndex, skips: state.reading.skips?.length ?? 0 };
  });

test("a book with chapters opens in pages, and a turn is exactly one screen", async ({ page }) => {
  await openBook(page, "5a5a5a5a-1111-4111-8111-111111111111");
  await expect(page.getByRole("navigation", { name: "Pages" })).toContainText(/1 of \d+/);

  await page.getByRole("button", { name: "Next page" }).click();
  await expect.poll(async () => (await scroller(page)).left).toBe((await scroller(page)).width);

  await page.keyboard.press("ArrowRight");
  const { width } = await scroller(page);
  await expect.poll(async () => (await scroller(page)).left).toBe(2 * width);

  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => (await scroller(page)).left).toBe(width);
});

test("the edges of a chapter lead into the next and back into the last page", async ({ page }) => {
  await openBook(page, "5b5b5b5b-1111-4111-8111-111111111111");
  const start = (await readerState(page)).chapter;

  for (let i = 0; i < 40 && (await readerState(page)).chapter === start; i += 1) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(250);
  }
  expect((await readerState(page)).chapter).toBeGreaterThan(start);
  await expect.poll(async () => (await scroller(page)).left).toBe(0);

  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => (await readerState(page)).chapter).toBe(start);
  // Turning back opens the previous chapter where the reader left it: its end.
  await expect.poll(async () => (await scroller(page)).left).toBeGreaterThan(0);
  await expect(page.getByRole("navigation", { name: "Pages" })).toContainText(/(\d+) of \1/);

  // None of that was skipping ahead.
  expect((await readerState(page)).skips).toBe(0);
});

test("one book can be switched to scrolling from the reader's menu", async ({ page }) => {
  await openBook(page, "5c5c5c5c-1111-4111-8111-111111111111");
  await page
    .getByRole("button", { name: /More|options/i })
    .last()
    .click();
  await page.getByRole("menuitem", { name: "Scroll instead" }).click();
  await expect(page.locator(".reader-scroll")).toHaveAttribute("data-layout", "scroll");
  await expect(page.getByRole("navigation", { name: "Pages" })).toHaveCount(0);
});

test.describe("on a phone", () => {
  // An iPhone-sized touch screen. Not the iPhone preset itself: that also
  // switches the browser engine, which a single file cannot do.
  test.use({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true });

  test("a swipe turns the page and does not open a definition", async ({ page, context }) => {
    await openBook(page, "5d5d5d5d-1111-4111-8111-111111111111");
    const cdp = await context.newCDPSession(page);
    const swipe = async (from: number, to: number) => {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: from, y: 420 }],
      });
      for (let i = 1; i <= 6; i += 1) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: from + ((to - from) * i) / 6, y: 420 }],
        });
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    };

    const { width } = await scroller(page);
    await swipe(320, 120);
    await expect.poll(async () => (await scroller(page)).left).toBe(width);
    await swipe(100, 300);
    await expect.poll(async () => (await scroller(page)).left).toBe(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
