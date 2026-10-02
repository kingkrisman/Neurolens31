import assert from "node:assert/strict";
import { test } from "node:test";
import { siteOrigin } from "./site-origin.mjs";

test("the bare domain becomes the www address the site is served from", () => {
  assert.equal(siteOrigin("https://neurolens.space"), "https://www.neurolens.space");
  assert.equal(siteOrigin("https://neurolens.space/"), "https://www.neurolens.space");
  assert.equal(siteOrigin("http://neurolens.space"), "https://www.neurolens.space");
});

test("nothing configured means the live address", () => {
  assert.equal(siteOrigin(undefined), "https://www.neurolens.space");
  assert.equal(siteOrigin(""), "https://www.neurolens.space");
  assert.equal(siteOrigin("not a url"), "https://www.neurolens.space");
});

test("any other origin is kept, for previews and local builds", () => {
  assert.equal(siteOrigin("https://www.neurolens.space"), "https://www.neurolens.space");
  assert.equal(siteOrigin("http://localhost:8080"), "http://localhost:8080");
});
