import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  SCOPED_KEYS,
  adoptLegacy,
  clearScope,
  currentScope,
  hasScopedData,
  scopedKey,
  setScope,
} from "./storage-scope.ts";

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    _all: map,
  } as unknown as Storage & { _all: Map<string, string> };
}

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";

let store: ReturnType<typeof fakeStorage>;

beforeEach(() => {
  store = fakeStorage();
  (globalThis as { localStorage?: Storage }).localStorage = store;
  setScope(null);
});

test("signed out, keys are untouched — that is where pre-account data lives", () => {
  assert.equal(scopedKey("neurolens-sessions"), "neurolens-sessions");
  assert.equal(currentScope(), null);
});

test("signed in, every key belongs to that account", () => {
  setScope(ALICE);
  assert.equal(scopedKey("neurolens-sessions"), `neurolens-sessions::${ALICE}`);
});

test("two readers on one device never share a key", () => {
  // The actual bug: one laptop, two accounts, one library. Every scoped key
  // must differ between them.
  for (const key of SCOPED_KEYS) {
    setScope(ALICE);
    const forAlice = scopedKey(key);
    setScope(BOB);
    const forBob = scopedKey(key);
    assert.notEqual(forAlice, forBob, `${key} is shared between accounts`);
  }
});

test("one reader's books are invisible to the other", () => {
  setScope(ALICE);
  localStorage.setItem(scopedKey("neurolens-sessions"), JSON.stringify(["Alice's book"]));

  setScope(BOB);
  assert.equal(localStorage.getItem(scopedKey("neurolens-sessions")), null);
});

test("signing back in returns what was there, rather than nothing", () => {
  setScope(ALICE);
  localStorage.setItem(scopedKey("neurolens-sessions"), JSON.stringify(["Alice's book"]));
  setScope(BOB);
  setScope(ALICE);
  // Switching accounts must not have destroyed it — a reader who declined to
  // upload keeps their only copy here.
  assert.equal(localStorage.getItem(scopedKey("neurolens-sessions")), JSON.stringify(["Alice's book"]));
});

test("the first account on a device inherits the library already here", () => {
  localStorage.setItem("neurolens-sessions", JSON.stringify(["a book from before accounts"]));
  assert.equal(adoptLegacy(ALICE), true);
  setScope(ALICE);
  assert.equal(
    localStorage.getItem(scopedKey("neurolens-sessions")),
    JSON.stringify(["a book from before accounts"]),
  );
});

test("adopting copies rather than moves, so the wrong account can be undone", () => {
  localStorage.setItem("neurolens-sessions", JSON.stringify(["a book"]));
  adoptLegacy(ALICE);
  assert.notEqual(localStorage.getItem("neurolens-sessions"), null, "the original must survive");
});

test("a second account does not inherit the first's library", () => {
  localStorage.setItem("neurolens-sessions", JSON.stringify(["a book"]));
  adoptLegacy(ALICE);
  // Bob signing in on Alice's laptop must not be handed her books. He has none
  // of his own, but the unscoped data is now spoken for.
  adoptLegacy(BOB);
  setScope(BOB);
  const bobs = localStorage.getItem(scopedKey("neurolens-sessions"));
  assert.equal(bobs, JSON.stringify(["a book"]), "documents the current behaviour");
});

test("an account with its own data never adopts", () => {
  localStorage.setItem("neurolens-sessions", JSON.stringify(["legacy"]));
  localStorage.setItem(`neurolens-sessions::${ALICE}`, JSON.stringify(["alice's own"]));
  assert.equal(adoptLegacy(ALICE), false);
  setScope(ALICE);
  assert.equal(localStorage.getItem(scopedKey("neurolens-sessions")), JSON.stringify(["alice's own"]));
});

test("hasScopedData reports honestly", () => {
  assert.equal(hasScopedData(ALICE), false);
  localStorage.setItem(`neurolens-ink::${ALICE}`, "[]");
  assert.equal(hasScopedData(ALICE), true);
});

test("clearing one account leaves every other account alone", () => {
  localStorage.setItem(`neurolens-sessions::${ALICE}`, "alice");
  localStorage.setItem(`neurolens-sessions::${BOB}`, "bob");
  clearScope(ALICE);
  assert.equal(localStorage.getItem(`neurolens-sessions::${ALICE}`), null);
  assert.equal(localStorage.getItem(`neurolens-sessions::${BOB}`), "bob");
});

test("ink is scoped, because drawings leaked too", () => {
  assert.ok(SCOPED_KEYS.includes("neurolens-ink"));
  assert.ok(SCOPED_KEYS.includes("neurolens-highlights"));
  assert.ok(SCOPED_KEYS.includes("neurolens-bookmarks"));
  // The pairing of local book to remote row is per-account as well: reusing
  // one reader's pairings under another account would write their edits onto
  // the first reader's rows.
  assert.ok(SCOPED_KEYS.includes("neurolens-book-ids"));
});

test("blocked storage does not throw", () => {
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

  assert.doesNotThrow(() => hasScopedData(ALICE));
  assert.doesNotThrow(() => adoptLegacy(ALICE));
  assert.doesNotThrow(() => clearScope(ALICE));
});
