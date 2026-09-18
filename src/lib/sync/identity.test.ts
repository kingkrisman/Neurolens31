import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { allPairs, clearPairs, forget, keepOnly, localKeyFor, remember, remoteIdFor } from "./identity.ts";

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  } as unknown as Storage;
}

const MOBY = "Call me Ishmael. Some years ago — never mind how long precisely.";
const HAMLET = "Who's there? Nay, answer me. Stand and unfold yourself.";

beforeEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = fakeStorage();
  clearPairs();
});

test("a pairing is remembered and found again", () => {
  remember(MOBY, "uuid-1");
  assert.equal(remoteIdFor(MOBY), "uuid-1");
});

test("an unpaired book reports nothing rather than guessing", () => {
  assert.equal(remoteIdFor(MOBY), null);
});

test("the same book found by different text after the key point still pairs", () => {
  // The key is the opening 48 characters, so an edit further in is the same
  // book — which is the behaviour the store already relies on.
  remember(MOBY, "uuid-1");
  assert.equal(remoteIdFor(`${MOBY} And then something new entirely.`), "uuid-1");
});

test("two books pair independently", () => {
  remember(MOBY, "uuid-1");
  remember(HAMLET, "uuid-2");
  assert.equal(remoteIdFor(MOBY), "uuid-1");
  assert.equal(remoteIdFor(HAMLET), "uuid-2");
});

test("re-pairing replaces rather than duplicates", () => {
  remember(MOBY, "uuid-1");
  remember(MOBY, "uuid-2");
  assert.equal(remoteIdFor(MOBY), "uuid-2");
  assert.equal(Object.keys(allPairs()).length, 1);
});

test("the pairing can be walked backwards, for what a pull returns", () => {
  remember(MOBY, "uuid-1");
  assert.ok(localKeyFor("uuid-1"));
  assert.equal(localKeyFor("nobody"), null);
});

test("forgetting one leaves the others", () => {
  remember(MOBY, "uuid-1");
  remember(HAMLET, "uuid-2");
  forget(MOBY);
  assert.equal(remoteIdFor(MOBY), null);
  assert.equal(remoteIdFor(HAMLET), "uuid-2");
});

test("pairings for books deleted elsewhere are dropped after a pull", () => {
  remember(MOBY, "uuid-1");
  remember(HAMLET, "uuid-2");
  // Only uuid-2 came back, so uuid-1 is gone from the account. Keeping it would
  // mean the next edit writes against a row that no longer exists — which fails
  // silently, because updating no rows is not an error.
  keepOnly(["uuid-2"]);
  assert.equal(remoteIdFor(MOBY), null);
  assert.equal(remoteIdFor(HAMLET), "uuid-2");
});

test("a pull that returns everything changes nothing", () => {
  remember(MOBY, "uuid-1");
  remember(HAMLET, "uuid-2");
  keepOnly(["uuid-1", "uuid-2"]);
  assert.equal(Object.keys(allPairs()).length, 2);
});

test("a pull returning nothing clears the pairings", () => {
  remember(MOBY, "uuid-1");
  keepOnly([]);
  assert.deepEqual(allPairs(), {});
});

test("blocked storage degrades to no pairings, never to a crash", () => {
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

  assert.doesNotThrow(() => remember(MOBY, "uuid-1"));
  assert.equal(remoteIdFor(MOBY), null, "a miss is the safe answer; the caller treats it as new");
  assert.doesNotThrow(() => keepOnly(["uuid-1"]));
  assert.doesNotThrow(() => forget(MOBY));
});
