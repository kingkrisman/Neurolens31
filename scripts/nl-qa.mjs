import { chromium } from "playwright";

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
const net = [];
page.on("requestfinished", (req) => {
  try {
    const res = typeof req.response === "function" ? req.response() : null;
    net.push({
      url: req.url().replace("http://127.0.0.1:8080", "").slice(0, 100),
      method: req.method(),
      resource: req.resourceType(),
      status: res && typeof res.status === "function" ? res.status() : 0,
    });
  } catch {
    net.push({ url: req.url().slice(0, 80), fail: "timing" });
  }
});
page.on("requestfailed", (req) => {
  net.push({
    url: req.url().slice(0, 100),
    method: req.method(),
    resource: req.resourceType(),
    status: 0,
    fail: req.failure()?.errorText,
  });
});

await page.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded", timeout: 20000 });
await page.waitForTimeout(500);

await page.getByRole("button", { name: /Academic abstract/i }).click();
await page.getByRole("button", { name: /Open in reader/i }).click();
await page.waitForTimeout(600);

async function measure() {
  return page.evaluate(() => {
    const overlay = document.querySelector(".focus-window");
    const band = document.querySelector(".focus-window-band, .focus-window-highlight");
    const active = document.querySelector(".reading-line.active");
    const first = document.querySelector(".reading-line");
    const view = overlay?.getBoundingClientRect();
    const bandBox = band?.getBoundingClientRect();
    const firstBox = first?.getClientRects()[0];
    const midY = view ? view.top + view.height / 2 : 0;
    return {
      title: document.title,
      snag: document.body.innerText.includes("snag"),
      hasOverlay: !!overlay,
      bandTopInView: bandBox && view ? Math.round(bandBox.top - view.top) : null,
      firstLineTopInView: firstBox && view ? Math.round(firstBox.top - view.top) : null,
      distBandToFirst: bandBox && firstBox ? Math.round(Math.abs(bandBox.top + bandBox.height / 2 - (firstBox.top + firstBox.height / 2))) : null,
      bandIsMidPage: !!(bandBox && view && Math.abs(bandBox.top + bandBox.height / 2 - midY) < 50),
      activeId: active?.id ?? null,
      firstId: first?.id ?? null,
      activeIsFirst: active === first,
      viewH: view ? Math.round(view.height) : null,
    };
  });
}

let before = await measure();
if (!before.hasOverlay) {
  await page.getByRole("button", { name: /Reading options/i }).click();
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: /^ADHD$/ }).click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
}
const afterMode = await measure();
await page.screenshot({ path: "/workspace/screenshots/ruler-adhd.png" });

await page.getByRole("button", { name: /Reading guides/i }).click();
await page.waitForTimeout(200);
await page.getByRole("menuitem", { name: /Syllables/i }).click();
await page.waitForTimeout(400);
const afterSyllables = {
  title: await page.title(),
  snag: await page.evaluate(() => document.body.innerText.includes("snag")),
};

await page.getByRole("button", { name: /More actions/i }).click();
await page.waitForTimeout(200);
await page.getByRole("menuitem", { name: /Speed reader/i }).click();
await page.waitForTimeout(400);
const afterSpeed = {
  dialog: await page.evaluate(() => !!document.querySelector("[role=dialog]")),
  snag: await page.evaluate(() => document.body.innerText.includes("snag")),
};
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

await page.keyboard.press("Meta+k");
await page.waitForTimeout(250);
const palette = await page.evaluate(() => !!document.querySelector("[role=dialog]"));
if (palette) {
  await page.keyboard.type("Night");
  await page.waitForTimeout(150);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
}
const afterPalette = {
  title: await page.title(),
  snag: await page.evaluate(() => document.body.innerText.includes("snag")),
};
await page.screenshot({ path: "/workspace/screenshots/after-menus.png" });

const fail = net.filter((r) => r.fail || r.status >= 400);
const slowest = [...net].filter((r) => r.resource !== "websocket").sort((a, b) => (b.dur || 0) - (a.dur || 0)).slice(0, 12);
console.log(JSON.stringify({ errors, before, afterMode, afterSyllables, afterSpeed, afterPalette, palette, slowest, fail }, null, 2));
await browser.close();
