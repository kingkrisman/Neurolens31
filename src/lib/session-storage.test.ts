import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fitSessions } from "./session-storage.ts";
import type { Session } from "./types.ts";

/** A session of roughly `chars` characters, newest first as the store keeps them. */
const session = (title: string, chars: number): Session => ({
  title,
  content: "x".repeat(chars),
  openedAt: Date.now(),
  progress: 0,
});

/** A browser that accepts writes up to `limit` characters and refuses beyond. */
function browser(limit: number) {
  const calls: number[] = [];
  let stored = "";
  return {
    calls,
    get stored() {
      return stored;
    },
    write(payload: string) {
      calls.push(payload.length);
      if (payload.length > limit) return false;
      stored = payload;
      return true;
    },
  };
}

describe("fitSessions", () => {
  it("keeps everything when it all fits", () => {
    const sessions = [session("a", 100), session("b", 100)];
    const store = browser(1_000_000);
    assert.equal(fitSessions(sessions, store.write).length, 2);
  });

  it("sheds the oldest until the browser accepts the write", () => {
    // Newest first, so shedding from the end drops the oldest book.
    const sessions = [session("newest", 400), session("middle", 400), session("oldest", 400)];
    const store = browser(1000);
    const kept = fitSessions(sessions, store.write, 1_000_000);
    // Sheds only as much as it has to, from the far end.
    assert.ok(kept.length < sessions.length, "something was shed");
    assert.equal(kept[0]!.title, "newest", "the book just opened is the one kept");
    assert.ok(!kept.some((s) => s.title === "oldest"), "the oldest goes first");
  });

  it("believes the browser, not the budget", () => {
    // The bug this guards: the old code shed only until a guessed character
    // count was met, then wrote and swallowed the refusal — so it reported
    // success while nothing was saved. A budget far above the real quota must
    // still end with something written.
    const sessions = [session("newest", 900), session("older", 900)];
    const store = browser(1000);
    const kept = fitSessions(sessions, store.write, 10_000_000);
    assert.ok(store.stored.length > 0, "something was actually stored");
    assert.equal(JSON.parse(store.stored).length, kept.length);
  });

  it("reports exactly what it stored", () => {
    const sessions = [session("a", 900), session("b", 900), session("c", 900)];
    const store = browser(1000);
    const kept = fitSessions(sessions, store.write, 10_000_000);
    assert.deepEqual(
      JSON.parse(store.stored).map((s: Session) => s.title),
      kept.map((s) => s.title),
      "what is on disk must match what was reported kept",
    );
  });

  it("clears the key when even one session will not fit", () => {
    // Otherwise a previous, larger value stays behind and the next read offers
    // a book that cannot resume.
    const sessions = [session("huge", 50_000)];
    const store = browser(1000);
    const kept = fitSessions(sessions, store.write, 10_000_000);
    assert.deepEqual(kept, []);
    assert.equal(store.stored, "[]");
  });

  it("stops rather than looping forever on a browser that refuses everything", () => {
    const sessions = [session("a", 10), session("b", 10)];
    const store = browser(-1);
    assert.doesNotThrow(() => fitSessions(sessions, store.write, 10_000_000));
    assert.ok(store.calls.length <= sessions.length + 1);
  });

  it("handles an empty history", () => {
    const store = browser(1_000_000);
    assert.deepEqual(fitSessions([], store.write), []);
  });

  it("uses the budget as a fast path before troubling the browser", () => {
    // A payload already over budget should not be offered to localStorage at
    // its full size; on Safari a rejected multi-megabyte write is not free.
    const sessions = [session("big", 5000), session("small", 10)];
    const store = browser(1_000_000);
    fitSessions(sessions, store.write, 1000);
    assert.ok(
      store.calls.every((length) => length <= 1000),
      "no attempt should exceed the budget",
    );
  });
});
