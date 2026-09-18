import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { declinedKeys, isDeclined, uploadChoice } from "./upload-choice.ts";

/**
 * The store is a React/zustand module, so `localOnly` and `uploadLocal` are
 * exercised through the app rather than here. What is tested here is the part
 * that carries the promise: the recorded decision, and the rule that a declined
 * book is not created in the account by some later edit.
 */

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  } as unknown as Storage;
}

const USER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = fakeStorage();
});

test("no decision has been made until one is made", () => {
  // The default must be "ask", never "upload". A missing record is the state
  // every reader starts in, and it cannot be read as consent.
  assert.equal(uploadChoice(USER), null);
});

test("a decision is remembered per account, not per device", () => {
  localStorage.setItem(`neurolens-upload-choice:${USER}`, "declined");
  assert.equal(uploadChoice(USER), "declined");
  // A second account on the same device is a different decision, and must not
  // inherit the first.
  assert.equal(uploadChoice(OTHER), null);
});

test("an unrecognised value is treated as no decision", () => {
  localStorage.setItem(`neurolens-upload-choice:${USER}`, "maybe");
  assert.equal(uploadChoice(USER), null, "anything but a real answer means ask again");
});

test("declined books are remembered by key", () => {
  localStorage.setItem("neurolens-upload-declined", JSON.stringify(["book-a", "book-b"]));
  assert.ok(isDeclined("book-a"));
  assert.ok(isDeclined("book-b"));
  assert.ok(!isDeclined("book-c"));
});

test("nothing is declined by default", () => {
  assert.equal(declinedKeys().size, 0);
  assert.ok(!isDeclined("anything"));
});

test("corrupt records fail towards asking, not towards uploading", () => {
  localStorage.setItem("neurolens-upload-declined", "{not json");
  assert.equal(declinedKeys().size, 0);
  localStorage.setItem("neurolens-upload-declined", JSON.stringify({ not: "an array" }));
  assert.equal(declinedKeys().size, 0);
});

test("blocked storage never reads as consent", () => {
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  } as unknown as Storage;

  // In private browsing the question gets asked again, which is the right
  // failure. Uploading because storage was unavailable would not be.
  assert.equal(uploadChoice(USER), null);
  assert.equal(declinedKeys().size, 0);
});
