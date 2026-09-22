import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * The Connect tab: an OPDS catalogue, and a Kindle's clippings file.
 *
 * Both features are about bringing in books and marks somebody already has.
 * Neither can be verified by unit tests alone — one needs a network round trip
 * through the proxy, the other needs a real file input — so this drives them.
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

async function openConnect(page: Page, id: string) {
  await page.addInitScript(
    ([key, session]) => {
      try {
        localStorage.setItem(key as string, JSON.stringify(session));
        // Past onboarding, so the survey is not in the way.
        localStorage.setItem(
          `neurolens-meta::${(session as { user: { id: string } }).user.id}`,
          JSON.stringify({ onboardedAt: Date.now() }),
        );
      } catch {
        /* the assertions will report it */
      }
    },
    ["neurolens-auth", fakeSession(id)],
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  // Navigated by clicking, not by `?view=library`. Signing in re-reads the
  // store for the new account and puts the reader on Explore, which overrides
  // the query string — so a test that trusted the URL waited sixty seconds for
  // a tab that was never going to be selected.
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.waitForTimeout(1200);
  // The library section switcher is a radiogroup, not buttons — `Segmented`
  // gives its options role="radio" when they are a choice rather than links.
  // Asking for a button found nothing and waited the full timeout out.
  await page.getByRole("radio", { name: "Connect", exact: true }).click();
  await page.waitForTimeout(800);
}

test("the Connect tab offers a catalogue and a Kindle import", async ({ page }) => {
  await openConnect(page, "aaaa1111-1111-4111-8111-111111111111");
  await expect(page.getByRole("heading", { name: "Free book libraries" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kindle highlights" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Standard Ebooks/ })).toBeVisible();
});

test("a bad catalogue address is refused in words, not a stack trace", async ({ page }) => {
  await openConnect(page, "bbbb2222-2222-4222-8222-222222222222");

  // The address form is folded away for the few who run their own server.
  await page.getByText("Have your own library server?").click();
  await page.getByLabel("Your library server address").fill("http://example.com/opds");
  await page.getByRole("button", { name: "Open library" }).click();
  await expect(page.getByRole("alert")).toContainText(/https/i);
});

test("the proxy refuses a private address", async ({ page }) => {
  // The one endpoint in the app that fetches a URL somebody typed. If this
  // ever returns 200, it is a request forger.
  await openConnect(page, "cccc3333-3333-4333-8333-333333333333");

  for (const target of [
    "https://169.254.169.254/latest/meta-data/",
    "https://127.0.0.1/opds",
    "https://10.0.0.1/opds",
    "http://example.com/opds",
  ]) {
    const response = await page.request.get(`/api/opds?url=${encodeURIComponent(target)}`);
    expect(response.status(), `${target} should be refused`).toBeGreaterThanOrEqual(400);
  }
});

test("a Kindle clippings file is read and reported", async ({ page }) => {
  await openConnect(page, "dddd4444-4444-4444-8444-444444444444");

  const clippings = [
    "Moby-Dick (Herman Melville)",
    "- Your Highlight on page 1 | Location 1-2 | Added on Monday, 3 March 2025 21:14:52",
    "",
    "Call me Ishmael.",
    "==========",
    "Moby-Dick (Herman Melville)",
    "- Your Highlight on page 2 | Location 3-4 | Added on Monday, 3 March 2025 21:15:52",
    "",
    "There now is your insular city of the Manhattoes.",
    "==========",
    "Another Book (Someone Else)",
    "- Your Note on page 9 | Location 40 | Added on Monday, 3 March 2025 21:16:52",
    "",
    "Worth remembering.",
    "==========",
    "",
  ].join("\n");

  await page.getByLabel(/Choose My Clippings/i).setInputFiles({
    name: "My Clippings.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(clippings, "utf8"),
  });

  // Two highlights across two books — the note is not counted as a highlight.
  await expect(page.getByText(/2 highlights across 2 books/)).toBeVisible();
  await expect(page.getByText("Moby-Dick")).toBeVisible();

  await page.getByRole("button", { name: "Import highlights" }).click();
  await expect(page.getByText(/Imported 2 of 2 highlights/)).toBeVisible();

  // Nothing in the library matches, so both are kept as notes rather than lost.
  const bookmarks = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("neurolens-bookmarks::"));
    return key ? (JSON.parse(localStorage.getItem(key)!) as { title: string }[]) : [];
  });
  expect(bookmarks.length).toBeGreaterThan(0);
  expect(bookmarks.map((b) => b.title)).toContain("Moby-Dick");
});

test("the Connect tab has no accessibility violations", async ({ page }) => {
  await openConnect(page, "eeee5555-5555-4555-8555-555555555555");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
    "Connect tab",
  ).toEqual([]);
});

test("choosing a book from a library opens it in the reader", async ({ page }) => {
  // The first version failed exactly here — books came through the proxy as
  // text-decoded bytes and every EPUB was corrupt — and no test clicked a
  // book. The proxy is answered locally so this does not depend on anybody
  // else's server being up; the proxy itself is checked against the real
  // sites by hand before release.
  const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Sample Library</title>
  <entry>
    <id>urn:sample:1:noimages</id>
    <title>A Short Book</title>
    <author><name>Ada Writer</name></author>
    <link rel="http://opds-spec.org/acquisition" type="text/plain" href="https://books.example.com/1.txt"/>
  </entry>
  <entry>
    <id>urn:sample:1:images</id>
    <title>A Short Book</title>
    <author><name>Ada Writer</name></author>
    <link rel="http://opds-spec.org/acquisition" type="text/plain" href="https://books.example.com/1-images.txt"/>
  </entry>
</feed>`;
  const book = Array.from(
    { length: 40 },
    (_, i) => `This is sentence ${i + 1} of a short sample book, here to be read.`,
  ).join(" ");

  await page.route("**/api/opds?**", (route) => {
    const url = new URL(route.request().url());
    return url.searchParams.get("kind") === "book"
      ? route.fulfill({ status: 200, contentType: "text/plain", body: book })
      : route.fulfill({ status: 200, contentType: "application/atom+xml", body: feed });
  });

  await openConnect(page, "ffff6666-6666-4666-8666-666666666666");
  await page.getByRole("button", { name: /Standard Ebooks/ }).click();

  // Two editions of one book show as one row, with its author.
  const rows = page.getByRole("button", { name: /A Short Book/ });
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText("Ada Writer");

  await rows.click();
  await expect(page.getByText("Opened in the reader")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/sentence 1 of a short sample book/).first()).toBeVisible();
});

test("a book that cannot be downloaded says why", async ({ page }) => {
  await page.route("**/api/opds?**", (route) => {
    const url = new URL(route.request().url());
    return url.searchParams.get("kind") === "book"
      ? route.fulfill({
          status: 502,
          contentType: "application/json",
          body: JSON.stringify({ error: "That book is too large to open here." }),
        })
      : route.fulfill({
          status: 200,
          contentType: "application/atom+xml",
          body: `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>L</title><entry><id>b</id><title>Huge Book</title><link rel="http://opds-spec.org/acquisition" type="text/plain" href="https://books.example.com/huge.txt"/></entry></feed>`,
        });
  });

  await openConnect(page, "abab7777-7777-4777-8777-777777777777");
  await page.getByRole("button", { name: /Project Gutenberg/ }).click();
  await page.getByRole("button", { name: /Huge Book/ }).click();
  await expect(page.getByText("That book is too large to open here.")).toBeVisible();
});
