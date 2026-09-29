/// <reference types="chrome" />
import AxeBuilder from "@axe-core/playwright";
import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

/**
 * The browser extension, loaded into a real Chromium.
 *
 * Built with --test, which points it at the app on 127.0.0.1:8080 and grants
 * 127.0.0.1 up front, so the permission prompt (which a test cannot click)
 * never appears. Everything else is the extension as shipped. The site it
 * restyles is a page served here, so nothing leaves the machine.
 */

const APP = "http://127.0.0.1:8080";
const EXTENSION = path.resolve("extension/dist/test/chrome");
const FIRST = "Reading comprehension improves when the eye lands well, and a page that respects that is easier to stay with for longer.";

const ARTICLE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>The quiet shelf</title>
  <style>
    body { margin: 0 auto; max-width: 42rem; font: 16px/1.5 Georgia, serif; background: #fff; color: #111; }
    nav a { font-family: Arial, sans-serif; margin-right: 1rem; }
  </style>
</head>
<body>
  <nav><a href="#">Home</a><a href="#">Menu item</a></nav>
  <article>
    <h1>The quiet shelf</h1>
    <p id="first">${FIRST}</p>
    <p>Most of what makes a page tiring has nothing to do with the words. Lines run too long, letters crowd each other, and the background glares, so the reader spends effort holding their place rather than following the argument.</p>
    <p>Changing those things does not change what the author wrote. It changes how much work the reader has to do to take it in, which for many people is the difference between finishing an article and giving up halfway down the first screen.</p>
    <pre id="code">const reading = "left exactly as it was";</pre>
    <ul><li id="point">Spacing that suits the reader matters more than any single typeface.</li></ul>
    <p>Good tools make these choices once and then carry them everywhere, so that the effort of setting up a comfortable page is not repeated on every site a reader visits in a day.</p>
  </article>
  <footer><p id="foot">Footer text stays as it was.</p></footer>
</body>
</html>`;

const LOOK = {
  fontFamily: "lexend",
  fontSize: 20,
  lineHeight: 1.8,
  letterSpacing: 0.02,
  wordSpacing: 0.1,
  bionicStrength: 0.45,
  theme: "cream",
  modeName: "ADHD",
  at: 1,
};

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

test.describe.configure({ mode: "serial" });

let context: BrowserContext;
let server: Server;
let site: string;
let extensionId: string;
/** An extension page kept open, to read and write the extension's storage. */
let control: Page;

test.beforeAll(async () => {
  test.setTimeout(240_000);
  execFileSync(process.execPath, ["scripts/build-extension.mjs", "--test"], { stdio: "inherit" });

  server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(ARTICLE);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  site = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  // Loaded over the DevTools protocol rather than with --load-extension, which
  // current Chromium on Windows hangs on at startup, before any page exists.
  context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    ignoreDefaultArgs: ["--disable-extensions"],
    args: ["--enable-unsafe-extension-debugging"],
    reducedMotion: "reduce",
  });
  const cdp = await context.browser()!.newBrowserCDPSession();
  ({ id: extensionId } = await cdp.send("Extensions.loadUnpacked", { path: EXTENSION }));
  // Signed in on the app, and only there.
  await context.addInitScript(
    ([origin, key, session, uid]) => {
      if (location.origin !== origin) return;
      localStorage.setItem(key as string, JSON.stringify(session));
      localStorage.setItem(`neurolens-meta::${uid}`, JSON.stringify({ onboardedAt: Date.now() }));
      localStorage.setItem(`neurolens-upload-choice:${uid}`, "declined");
    },
    [APP, "neurolens-auth", fakeSession("extension-reader"), "extension-reader"] as const,
  );

  control = await context.newPage();
  await control.goto(`chrome-extension://${extensionId}/popup.html`);
});

test.afterAll(async () => {
  await context?.close();
  server?.close();
});

const setStored = (items: Record<string, unknown>) =>
  control.evaluate((values) => chrome.storage.local.set(values), items);

const getStored = (key: string) =>
  control.evaluate((name) => chrome.storage.local.get(name).then((all) => all[name]), key);

const registeredMatches = () =>
  control.evaluate(() =>
    chrome.scripting.getRegisteredContentScripts().then((scripts) => scripts.flatMap((script) => script.matches ?? [])),
  );

const style = (page: Page, selector: string, property: string) =>
  page.locator(selector).evaluate((el, name) => getComputedStyle(el).getPropertyValue(name), property);

async function tabIdOf(url: string): Promise<number> {
  const id = await control.evaluate((match) => chrome.tabs.query({ url: match }).then((tabs) => tabs[0]?.id), url);
  expect(id).toBeTruthy();
  return id!;
}

/** Runs in the app page, against the store module it loaded. */
function appState<T>(page: Page, body: string, arg?: unknown): Promise<T> {
  return page.evaluate(
    async ([fn, value]) => {
      const url =
        performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .find((name) => name.includes("/src/lib/store.ts")) ?? "/src/lib/store.ts";
      const { useAppStore } = await import(/* @vite-ignore */ url);
      return new Function("store", "value", fn)(useAppStore, value);
    },
    [body, arg] as const,
  ) as Promise<T>;
}

test("a switched-on site gets the reader's look, and switching off puts it back exactly", async () => {
  await setStored({ look: LOOK, sites: [site], options: { typeface: true, spacing: true, bold: true, colours: true } });
  await expect.poll(registeredMatches).toContain("http://127.0.0.1/*");

  const page = await context.newPage();
  await page.goto(`${site}/article`);
  await expect(page.locator("html")).toHaveAttribute("data-nl-ext", "");

  // Reading text: typeface, size, spacing, bold word starts.
  await expect.poll(() => style(page, "#first", "font-family")).toContain("NL Lexend");
  expect(await style(page, "#first", "font-size")).toBe("20px");
  expect(await style(page, "#first", "line-height")).toBe("36px");
  await expect(page.locator("#first nl-fx").first()).toHaveText("Rea");
  await expect(page.locator("#point nl-fx").first()).toBeAttached();
  await expect(page.locator("#first")).toHaveText(FIRST);
  await expect
    .poll(() =>
      page.evaluate(() => [...document.fonts].some((face) => face.family.replace(/"/g, "") === "NL Lexend" && face.status === "loaded")),
    )
    .toBe(true);

  // The site's furniture and code keep their own look.
  expect(await style(page, "nav a:first-child", "font-family")).toContain("Arial");
  expect(await style(page, "#foot", "font-family")).toContain("Georgia");
  await expect(page.locator("#foot nl-fx, #code nl-fx, nav nl-fx")).toHaveCount(0);

  // The palette, laid over a light page without turning it.
  expect(await style(page, "html > nl-tint", "background-color")).toBe("rgb(247, 241, 227)");
  expect(await style(page, "html > nl-tint", "mix-blend-mode")).toBe("multiply");
  await expect(page.locator("html")).not.toHaveAttribute("data-nl-flip");
  await page.screenshot({ path: test.info().outputPath("restyled-cream.png") });

  // A dark palette on a light site turns the page, live.
  await setStored({ look: { ...LOOK, theme: "night" } });
  await expect(page.locator("html")).toHaveAttribute("data-nl-flip", "");
  await page.screenshot({ path: test.info().outputPath("restyled-night.png") });

  // Off: everything the extension added comes back off, text intact.
  await setStored({ look: LOOK, sites: [] });
  await expect(page.locator("html")).not.toHaveAttribute("data-nl-ext");
  await expect(page.locator("nl-text, nl-fx, nl-tint")).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveAttribute("data-nl-flip");
  await expect(page.locator("#first")).toHaveText(FIRST);
  expect(await style(page, "#first", "font-family")).toContain("Georgia");
  await expect.poll(registeredMatches).not.toContain("http://127.0.0.1/*");

  // And a site nobody switched on is never touched.
  await page.reload();
  await page.waitForTimeout(500);
  await expect(page.locator("html")).not.toHaveAttribute("data-nl-ext");
  await page.close();
});

test("only the app itself can hand over settings", async () => {
  const page = await context.newPage();
  await page.goto(`${site}/article`);
  await page.evaluate(() =>
    window.postMessage(
      { source: "neurolens-app", kind: "profile", profile: { fontFamily: "comicneue", fontSize: 30, theme: "butter" }, modeName: "Spoofed" },
      location.origin,
    ),
  );
  await page.waitForTimeout(500);
  expect(await getStored("look")).toMatchObject({ fontFamily: "lexend", modeName: "ADHD" });
  await page.close();
});

test("the popup switches the open site on and off, and each part of the look separately", async () => {
  const article = await context.newPage();
  await article.goto(`${site}/article`);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tab=${await tabIdOf(`${site}/article`)}`);

  await expect(popup.locator("#look-line")).toHaveText("ADHD · Lexend 20 · Cream");
  await expect(popup.locator("#site-name")).toHaveText(new URL(site).host);
  const toggle = popup.getByRole("switch");
  await expect(toggle).not.toBeChecked();
  expect((await new AxeBuilder({ page: popup }).analyze()).violations).toEqual([]);
  await popup.screenshot({ path: test.info().outputPath("popup.png") });

  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect(article.locator("html")).toHaveAttribute("data-nl-ext", "");
  expect(await getStored("sites")).toEqual([site]);

  await popup.getByLabel("Colours").uncheck();
  await expect(article.locator("html > nl-tint")).toHaveCount(0);
  await popup.getByLabel("Bold word starts").uncheck();
  await expect(article.locator("nl-fx")).toHaveCount(0);
  await popup.getByLabel("Colours").check();
  await popup.getByLabel("Bold word starts").check();
  await expect(article.locator("html > nl-tint")).toHaveCount(1);
  await expect(article.locator("#first nl-fx").first()).toBeAttached();

  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect(article.locator("html")).not.toHaveAttribute("data-nl-ext");
  await expect(article.locator("#first")).toHaveText(FIRST);
  await popup.close();
  await article.close();
});

test("opening the app brings the reader's settings across, and keeps them in step", async () => {
  await control.evaluate(() => chrome.storage.local.remove("look"));
  const app = await context.newPage();
  await app.goto(`${APP}/`);
  await expect.poll(() => getStored("look"), { timeout: 20_000 }).toBeTruthy();

  const profile = await appState<Record<string, unknown>>(app, "return store.getState().profile");
  expect(await getStored("look")).toMatchObject({
    fontFamily: profile.fontFamily,
    fontSize: profile.fontSize,
    lineHeight: profile.lineHeight,
    theme: profile.theme,
    modeName: profile.name,
  });

  await appState(app, "const s = store.getState(); s.setProfile({ ...s.profile, fontSize: 23, theme: 'sage' })");
  await expect.poll(() => getStored("look")).toMatchObject({ fontSize: 23, theme: "sage" });
  await app.close();
});

test("Read this page in NeuroLens opens the article in the reader, without the site around it", async () => {
  const article = await context.newPage();
  await article.goto(`${site}/article`);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tab=${await tabIdOf(`${site}/article`)}`);

  const opened = context.waitForEvent("page");
  await popup.getByRole("button", { name: "Read this page in NeuroLens" }).click();
  const app = await opened;
  await app.waitForURL(`${APP}/**`);

  await expect.poll(() => appState<string>(app, "return store.getState().text"), { timeout: 20_000 }).toContain(FIRST);
  const text = await appState<string>(app, "return store.getState().text");
  expect(text).toContain("• Spacing that suits the reader");
  expect(text).not.toContain("Menu item");
  expect(text).not.toContain("Footer text");
  expect(await appState(app, "return store.getState().tab")).toBe("read");
  expect(await appState(app, "return store.getState().sessions[0].title")).toBe("The quiet shelf");
  expect(await getStored("pendingArticle")).toBeUndefined();
  await app.screenshot({ path: test.info().outputPath("opened-in-reader.png") });
});
