import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { armSync, bookmarksChanged, highlightsChanged, inkChanged, progressChanged, settingsChanged } from "./notify.ts";
import { clearQueue, queueSize, readQueue } from "./queue.ts";

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  } as unknown as Storage;
}

beforeEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = fakeStorage();
  clearQueue();
  armSync(false);
});

test("nothing is queued for a reader who is not signed in", () => {
  // The store calls these on every edit, signed in or not. For a signed-out
  // reader they must cost nothing and leave nothing behind.
  highlightsChanged("book-1");
  settingsChanged();
  bookmarksChanged();
  assert.equal(queueSize(), 0);
});

test("once armed, edits are queued", () => {
  armSync(true);
  highlightsChanged("book-1");
  assert.equal(queueSize(), 1);
});

test("disarming stops queueing again", () => {
  armSync(true);
  highlightsChanged("book-1");
  armSync(false);
  highlightsChanged("book-2");
  assert.equal(queueSize(), 1, "the second edit belonged to nobody");
});

test("progress is a different intent from the book itself", () => {
  armSync(true);
  progressChanged("book-1");
  const queued = readQueue()[0]?.write;
  // Sending a novel's full text every time somebody scrolls would be absurd;
  // progress writes three columns instead.
  assert.equal(queued?.kind, "progress");
});

test("ink carries the section, because each section is its own row", () => {
  armSync(true);
  inkChanged("book-1", 4);
  const queued = readQueue()[0]?.write as { kind: string; section: number };
  assert.equal(queued.kind, "ink");
  assert.equal(queued.section, 4);
});

test("repeated edits to one thing stay one write", () => {
  armSync(true);
  for (let i = 0; i < 20; i += 1) highlightsChanged("book-1");
  assert.equal(queueSize(), 1);
});
