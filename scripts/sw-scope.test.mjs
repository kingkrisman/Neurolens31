import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

/**
 * Which requests the service worker takes over.
 *
 * It used to take over Gutenberg's cover images, and every one of them broke:
 * a worker's own fetches answer to its Content-Security-Policy, whose
 * `connect-src` does not list gutenberg.org. The page may show those images;
 * the worker may not fetch them. Anything cross-origin must be left to the
 * browser, which loads it under `img-src` as the policy intends.
 */

function loadWorker() {
  const context = {
    self: { addEventListener() {}, location: { origin: "https://www.neurolens.space" } },
    URL,
    caches: {},
  };
  vm.createContext(context);
  const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  vm.runInContext(`${source};globalThis.__isContent = isContent;`, context);
  return (url) => context.__isContent(new URL(url));
}

test("cross-origin images are left to the browser", () => {
  const isContent = loadWorker();
  assert.equal(isContent("https://www.gutenberg.org/cache/epub/84/pg84.cover.medium.jpg"), false);
  assert.equal(isContent("https://covers.openlibrary.org/b/id/1-M.jpg"), false);
});

test("same-origin reading material is still cached for offline", () => {
  const isContent = loadWorker();
  assert.equal(isContent("https://www.neurolens.space/api/gutendex/books?page=2"), true);
  assert.equal(isContent("https://www.neurolens.space/images/hero.webp"), true);
});

test("the catalogue proxy is not cached by the worker", () => {
  const isContent = loadWorker();
  assert.equal(isContent("https://www.neurolens.space/api/opds?url=x"), false);
});
