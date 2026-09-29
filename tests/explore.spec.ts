import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * The Explore page's pinned reel and its clips.
 *
 * "Wherever you read" slides a row of clips sideways while pinned. It has to
 * stay smooth, which here means: nothing downloads before it is near, only
 * what is on screen plays, and reduced motion gets neither the slide nor the
 * video.
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
  // The signed-out page renders first; wait for the app's own scrolling pane.
  await expect(page.locator(".pane-scroll #scenes")).toBeAttached({ timeout: 15_000 });
}

/** Scroll the pane so `selector` sits `offset` of a screen from the top. */
async function scrollPaneTo(page: Page, selector: string, offset = 0, within = 0) {
  await page.evaluate(
    ([sel, off, frac]) => {
      const pane = document.querySelector<HTMLElement>(".pane-scroll")!;
      const el = document.querySelector<HTMLElement>(sel as string)!;
      const top =
        el.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop;
      pane.scrollTop =
        top -
        pane.clientHeight * (off as number) +
        (el.offsetHeight - pane.clientHeight) * (frac as number);
    },
    [selector, offset, within] as const,
  );
  await page.waitForTimeout(500);
}

// The suite runs with reduced motion on (playwright.config.ts). This one is
// about the motion itself.
test.describe("with motion", () => {
  test.use({ reducedMotion: "no-preference" });

  test("the reel slides sideways while pinned, and clips load only when near", async ({ page }) => {
    const videos: string[] = [];
    page.on("request", (request) => {
      if (request.url().endsWith(".mp4")) videos.push(request.url());
    });
    await signIn(page, "8b8b8b8b-1111-4111-8111-111111111111");
    await page.waitForTimeout(1500);
    expect(videos, "no clip is downloaded at the top of the page").toEqual([]);

    const offsetOf = async () =>
      page
        .locator(".scenes-track")
        .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41);
    const pinTop = async () => Math.round((await page.locator(".scenes-pin").boundingBox())!.y);

    await scrollPaneTo(page, "#scenes", 0, 0.1);
    const [startX, startTop] = [await offsetOf(), await pinTop()];
    await scrollPaneTo(page, "#scenes", 0, 0.9);
    const [endX, endTop] = [await offsetOf(), await pinTop()];

    expect(endX).toBeLessThan(startX - 200);
    expect(Math.abs(endTop - startTop)).toBeLessThanOrEqual(2);
    expect(videos.length, "the clips near the screen have loaded").toBeGreaterThan(0);

    const playing = await page
      .locator("video")
      .evaluateAll((all) => all.filter((video) => !(video as HTMLVideoElement).paused).length);
    expect(playing, "only what is on screen plays").toBeLessThanOrEqual(3);
  });
});

test("reduced motion gets no slide and no video", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  const videos: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith(".mp4")) videos.push(request.url());
  });
  await signIn(page, "8c8c8c8c-1111-4111-8111-111111111111");
  await scrollPaneTo(page, "#scenes", 0, 0.5);
  await scrollPaneTo(page, "#privacy-title", 0.3);
  const transform = await page
    .locator(".scenes-track")
    .evaluate((el) => getComputedStyle(el).transform);
  expect(transform).toBe("none");
  expect(videos).toEqual([]);
  await context.close();
});

test("the new sections have no accessibility violations", async ({ page }) => {
  await signIn(page, "8d8d8d8d-1111-4111-8111-111111111111");
  for (const selector of ["#scenes", "#features", "#privacy-title"]) {
    await scrollPaneTo(page, selector, 0.1);
  }
  await page.waitForTimeout(800);
  const results = await new AxeBuilder({ page })
    .include("#scenes")
    .include("#features")
    .include('section[aria-labelledby="privacy-title"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
});
