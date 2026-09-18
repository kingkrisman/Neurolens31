import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  clearQueue,
  dequeue,
  enqueue,
  markFailed,
  queueSize,
  readQueue,
  retryDelay,
  writeKey,
} from "./queue.ts";

/** localStorage, as much of it as this module touches. */
function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
}

beforeEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = fakeStorage();
  clearQueue();
});

test("a write survives being recorded and read back", () => {
  enqueue({ kind: "highlights", localId: "book-1" });
  const queue = readQueue();
  assert.equal(queue.length, 1);
  assert.deepEqual(queue[0].write, { kind: "highlights", localId: "book-1" });
  assert.equal(queue[0].tries, 0);
});

test("edits to the same thing collapse into one write", () => {
  // The whole point: a book edited five times offline is one write when the
  // connection returns, not five versions nobody will ever see.
  for (let i = 0; i < 5; i += 1) enqueue({ kind: "highlights", localId: "book-1" });
  assert.equal(queueSize(), 1);
});

test("different books do not collapse into each other", () => {
  enqueue({ kind: "highlights", localId: "book-1" });
  enqueue({ kind: "highlights", localId: "book-2" });
  assert.equal(queueSize(), 2);
});

test("different kinds of write on one book stay separate", () => {
  enqueue({ kind: "book", localId: "book-1" });
  enqueue({ kind: "highlights", localId: "book-1" });
  enqueue({ kind: "progress", localId: "book-1" });
  assert.equal(queueSize(), 3);
});

test("ink is tracked per section, since each is its own row", () => {
  enqueue({ kind: "ink", localId: "book-1", section: 1 });
  enqueue({ kind: "ink", localId: "book-1", section: 2 });
  enqueue({ kind: "ink", localId: "book-1", section: 1 });
  assert.equal(queueSize(), 2, "two sections, and the repeat collapsed");
});

test("bookmarks and settings are one apiece, not one per change", () => {
  enqueue({ kind: "bookmarks" });
  enqueue({ kind: "bookmarks" });
  enqueue({ kind: "settings" });
  enqueue({ kind: "settings" });
  assert.equal(queueSize(), 2);
});

test("collapsing keeps when the item was first queued", () => {
  enqueue({ kind: "settings" });
  const first = readQueue()[0].at;
  enqueue({ kind: "settings" });
  // Something stuck since Tuesday should still look stuck since Tuesday.
  assert.equal(readQueue()[0].at, first);
});

test("a delivered write is removed", () => {
  enqueue({ kind: "highlights", localId: "book-1" });
  enqueue({ kind: "highlights", localId: "book-2" });
  dequeue({ kind: "highlights", localId: "book-1" });
  assert.equal(queueSize(), 1);
  assert.equal(readQueue()[0].write.kind, "highlights");
  assert.equal((readQueue()[0].write as { localId: string }).localId, "book-2");
});

test("dequeuing something that is not queued is harmless", () => {
  enqueue({ kind: "settings" });
  dequeue({ kind: "bookmarks" });
  assert.equal(queueSize(), 1);
});

test("failures are counted, and counted per item", () => {
  enqueue({ kind: "settings" });
  enqueue({ kind: "bookmarks" });
  markFailed({ kind: "settings" });
  markFailed({ kind: "settings" });
  const queue = readQueue();
  assert.equal(queue.find((i) => i.write.kind === "settings")?.tries, 2);
  assert.equal(queue.find((i) => i.write.kind === "bookmarks")?.tries, 0);
});

test("collapsing does not reset the failure count", () => {
  enqueue({ kind: "settings" });
  markFailed({ kind: "settings" });
  enqueue({ kind: "settings" });
  assert.equal(readQueue()[0].tries, 1, "a rewrite must not make a stuck item look fresh");
});

test("the queue is capped, so a long journey cannot fill storage", () => {
  for (let i = 0; i < 260; i += 1) enqueue({ kind: "book", localId: `book-${i}` });
  assert.ok(queueSize() <= 200, `expected a cap, got ${queueSize()}`);
});

test("the cap keeps the newest, which is the state worth sending", () => {
  for (let i = 0; i < 260; i += 1) enqueue({ kind: "book", localId: `book-${i}` });
  const ids = readQueue().map((item) => (item.write as { localId: string }).localId);
  assert.ok(ids.includes("book-259"));
  assert.ok(!ids.includes("book-0"));
});

test("backoff climbs and then stops climbing", () => {
  assert.ok(retryDelay(0) < retryDelay(3));
  assert.equal(retryDelay(20), 60_000);
  // An hour offline must not mean an hour of waiting once back.
  assert.ok(retryDelay(99) <= 60_000);
});

test("keys identify the target, not the moment", () => {
  assert.equal(
    writeKey({ kind: "ink", localId: "b", section: 2 }),
    writeKey({ kind: "ink", localId: "b", section: 2 }),
  );
  assert.notEqual(
    writeKey({ kind: "ink", localId: "b", section: 2 }),
    writeKey({ kind: "ink", localId: "b", section: 3 }),
  );
});

test("a blocked storage does not throw — the reader's edit still stands", () => {
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

  // Private browsing, or storage full. Failing to record the intent must never
  // fail the edit that prompted it.
  assert.doesNotThrow(() => enqueue({ kind: "settings" }));
  assert.doesNotThrow(() => dequeue({ kind: "settings" }));
  assert.doesNotThrow(() => markFailed({ kind: "settings" }));
  assert.doesNotThrow(() => clearQueue());
  assert.deepEqual(readQueue(), []);
});
