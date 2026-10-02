import assert from "node:assert/strict";
import { test } from "node:test";
import { guessBrowser, storeLinkFor } from "./extension.ts";

const UA = {
  chrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
  firefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0",
  safari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15",
  opera:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 OPR/125.0.0.0",
  android:
    "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1",
};

test("the browsers the extension is made for are told apart", () => {
  assert.deepEqual(guessBrowser(UA.chrome), { browser: "chrome", mobile: false });
  assert.deepEqual(guessBrowser(UA.edge), { browser: "edge", mobile: false });
  assert.deepEqual(guessBrowser(UA.firefox), { browser: "firefox", mobile: false });
});

test("anything else gets no button of its own", () => {
  assert.equal(guessBrowser(UA.safari).browser, null);
  assert.equal(guessBrowser(UA.opera).browser, null);
});

test("phones are recognised, and offered no store link", () => {
  assert.equal(guessBrowser(UA.android).mobile, true);
  assert.equal(guessBrowser(UA.iphone).mobile, true);
  assert.equal(storeLinkFor(guessBrowser(UA.android)), null);
});
