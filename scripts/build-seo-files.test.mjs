import assert from "node:assert/strict";
import { test } from "node:test";
import { PRIVATE_ROUTES, buildRobots, buildSitemap, collectRoutes } from "./build-seo-files.mjs";

test("collects the public pages and nothing else", () => {
  const routes = collectRoutes();
  assert.ok(routes.includes("/"), "the home page belongs in the sitemap");
  assert.ok(routes.includes("/help"));
  assert.ok(routes.includes("/privacy"));
  // The shell, the data endpoints and the private pages are not pages a search
  // result should ever offer.
  assert.ok(!routes.some((path) => path.includes("__root")));
  assert.ok(!routes.some((path) => path.startsWith("/api")));
  for (const name of PRIVATE_ROUTES) {
    assert.ok(!routes.includes(`/${name}`), `${name} must stay out of the sitemap`);
  }
});

test("home sorts first, so the sitemap opens with the page that matters", () => {
  assert.equal(collectRoutes()[0], "/");
});

test("sitemap is well-formed and uses the sitemaps.org namespace", () => {
  const xml = buildSitemap(["/", "/help"]);
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
  assert.equal((xml.match(/<url>/g) ?? []).length, 2);
  assert.match(xml, /<loc>https?:\/\/[^<]+\/help<\/loc>/);
  // A date, not a timestamp — the hour a file happened to be touched is noise.
  assert.match(xml, /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
});

test("every sitemap URL is absolute", () => {
  for (const loc of buildSitemap(collectRoutes()).match(/<loc>([^<]+)<\/loc>/g) ?? []) {
    assert.match(loc, /<loc>https?:\/\//, `relative URL in sitemap: ${loc}`);
  }
});

test("robots disallows the private pages and points at the sitemap", () => {
  const robots = buildRobots();
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  for (const name of PRIVATE_ROUTES) {
    assert.match(robots, new RegExp(`^Disallow: /${name}$`, "m"));
  }
  assert.match(robots, /^Disallow: \/api\/$/m);
  // The tab query duplicates the home page five times over.
  assert.match(robots, /^Disallow: \/\*\?view=$/m);
  assert.match(robots, /^Sitemap: https?:\/\/\S+\/sitemap\.xml$/m);
});

test("the private list is shared, so robots and the sitemap cannot disagree", () => {
  const robots = buildRobots();
  const sitemap = buildSitemap(collectRoutes());
  for (const name of PRIVATE_ROUTES) {
    assert.match(robots, new RegExp(`Disallow: /${name}`));
    assert.ok(!sitemap.includes(`/${name}<`), `${name} is disallowed but still listed`);
  }
});
