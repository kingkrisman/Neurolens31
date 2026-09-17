import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SITE,
  appJsonLd,
  breadcrumbJsonLd,
  faqJsonLd,
  jsonLd,
  organizationJsonLd,
  seo,
  websiteJsonLd,
} from "./seo.ts";

const find = (meta: Array<Record<string, string>>, key: "name" | "property", value: string) =>
  meta.find((entry) => entry[key] === value)?.content;

test("a page states its own title, and the site name comes after it", () => {
  const { meta } = seo({ title: "Help" });
  assert.equal(meta.find((entry) => "title" in entry)?.title, "Help · NeuroLens");
});

test("the home page gets the descriptive title, not a bare product name", () => {
  const { meta } = seo();
  const title = meta.find((entry) => "title" in entry)?.title ?? "";
  assert.match(title, /NeuroLens/);
  assert.ok(title.length > "NeuroLens".length, "the default title should say what this is");
});

test("canonical and og:url are absolute and agree with each other", () => {
  const { meta, links } = seo({ path: "/privacy" });
  assert.equal(links[0]?.rel, "canonical");
  assert.equal(links[0]?.href, `${SITE.url}/privacy`);
  assert.equal(find(meta, "property", "og:url"), links[0]?.href);
});

test("exactly one canonical is produced per page", () => {
  assert.equal(seo({ path: "/help" }).links.filter((link) => link.rel === "canonical").length, 1);
});

test("the social image is absolute — a relative og:image is never fetched", () => {
  const { meta } = seo();
  assert.match(find(meta, "property", "og:image") ?? "", /^https?:\/\//);
  assert.match(find(meta, "name", "twitter:image") ?? "", /^https?:\/\//);
});

test("the card declares its type, or the link renders without an image", () => {
  assert.equal(find(seo().meta, "name", "twitter:card"), "summary_large_image");
});

test("indexable pages allow a large image preview", () => {
  const robots = find(seo({ path: "/help" }).meta, "name", "robots") ?? "";
  assert.match(robots, /^index, follow/);
  assert.match(robots, /max-image-preview:large/);
});

test("private pages are kept out of the index", () => {
  assert.equal(
    find(seo({ path: "/account", noindex: true }).meta, "name", "robots"),
    "noindex, nofollow",
  );
});

test("title and description appear once each across og and twitter", () => {
  const { meta } = seo({ title: "Terms", description: "Plain terms." });
  assert.equal(find(meta, "property", "og:title"), "Terms · NeuroLens");
  assert.equal(find(meta, "name", "twitter:title"), "Terms · NeuroLens");
  assert.equal(find(meta, "name", "description"), "Plain terms.");
  assert.equal(find(meta, "property", "og:description"), "Plain terms.");
});

test("a trailing slash on the configured origin never doubles in a URL", () => {
  assert.ok(!SITE.url.endsWith("/"));
  assert.ok(!seo({ path: "/help" }).links[0]?.href.includes("//help"));
});

test("json-ld is emitted as a parseable script descriptor", () => {
  const block = jsonLd(appJsonLd());
  assert.equal(block.type, "application/ld+json");
  const parsed = JSON.parse(block.children);
  assert.equal(parsed["@context"], "https://schema.org");
  assert.equal(parsed["@type"], "WebApplication");
  // The two facts a result can usefully carry about this app.
  assert.equal(parsed.isAccessibleForFree, true);
  assert.equal(parsed.offers.price, "0");
});

test("every structured-data block names a context and a type", () => {
  for (const data of [appJsonLd(), organizationJsonLd(), websiteJsonLd()]) {
    assert.equal(data["@context"], "https://schema.org");
    assert.ok(typeof data["@type"] === "string" && data["@type"].length > 0);
  }
});

test("breadcrumbs are positioned in order, with absolute items", () => {
  const trail = breadcrumbJsonLd([
    { name: "NeuroLens", path: "/" },
    { name: "Privacy", path: "/privacy" },
  ]);
  assert.equal(trail.itemListElement.length, 2);
  assert.deepEqual(
    trail.itemListElement.map((item) => item.position),
    [1, 2],
  );
  assert.equal(trail.itemListElement[1]?.item, `${SITE.url}/privacy`);
});

test("faq entries keep their question and answer paired", () => {
  const faq = faqJsonLd([{ question: "Does it watch my eyes?", answer: "No camera." }]);
  assert.equal(faq.mainEntity[0]?.["@type"], "Question");
  assert.equal(faq.mainEntity[0]?.name, "Does it watch my eyes?");
  assert.equal(faq.mainEntity[0]?.acceptedAnswer.text, "No camera.");
});
