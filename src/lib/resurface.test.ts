import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_RETURNS,
  INTERVALS_DAYS,
  PER_DAY,
  duePassages,
  markedAgo,
  normalizeReturns,
  passageId,
  withRetired,
  withSeen,
} from "./resurface.ts";
import type { Highlight } from "./types.ts";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 1, 12);

function mark(at: number, text = "The sea was calm that morning, and grey.", start = 0): Highlight {
  return { lineIdx: 3, section: 1, start, end: start + text.length, text, at };
}

test("a passage comes back three days after it was marked, not before", () => {
  const book = { "A book": [mark(T0)] };
  assert.equal(duePassages(book, EMPTY_RETURNS, T0 + 2 * DAY).length, 0);
  assert.equal(duePassages(book, EMPTY_RETURNS, T0 + 3 * DAY).length, 1);
});

test("each return pushes the next one further out, then it retires", () => {
  const book = { "A book": [mark(T0)] };
  let returns = EMPTY_RETURNS;
  let now = T0;
  for (const days of INTERVALS_DAYS) {
    now += days * DAY;
    const [due] = duePassages(book, returns, now);
    assert.ok(due, `due after ${days} more days`);
    assert.equal(duePassages(book, returns, now - DAY).length, 0, "not a day early");
    returns = withSeen(returns, due.id, now);
  }
  assert.equal(duePassages(book, returns, now + 400 * DAY).length, 0, "retired after the last");
});

test("'Not this one' retires a passage for good", () => {
  const book = { "A book": [mark(T0)] };
  const [due] = duePassages(book, EMPTY_RETURNS, T0 + 3 * DAY);
  const returns = withRetired(EMPTY_RETURNS, due!.id, T0 + 3 * DAY);
  assert.equal(duePassages(book, returns, T0 + 900 * DAY).length, 0);
});

test("a few a day at most, and the count starts again tomorrow", () => {
  const marks = Array.from({ length: 8 }, (_, i) => mark(T0 + i * 1000, `Passage number ${i} worth keeping`));
  const book = { "A book": marks };
  const now = T0 + 10 * DAY;
  let returns = EMPTY_RETURNS;
  const first = duePassages(book, returns, now);
  assert.equal(first.length, PER_DAY);
  for (const due of first) returns = withSeen(returns, due.id, now);
  assert.equal(duePassages(book, returns, now + 60_000).length, 0, "done for today");
  assert.equal(duePassages(book, returns, now + DAY).length, PER_DAY, "more tomorrow");
});

test("the same visit twice shows the same passages, oldest waiting first", () => {
  const book = {
    One: [mark(T0 + 5 * DAY, "A later passage that was marked")],
    Two: [mark(T0, "An earlier passage that was marked")],
  };
  const now = T0 + 30 * DAY;
  const a = duePassages(book, EMPTY_RETURNS, now).map((d) => d.mark.text);
  const b = duePassages(book, EMPTY_RETURNS, now).map((d) => d.mark.text);
  assert.deepEqual(a, b);
  assert.equal(a[0], "An earlier passage that was marked");
});

test("a mark of a word or two is not brought back", () => {
  assert.equal(duePassages({ Book: [mark(T0, "Grey.")] }, EMPTY_RETURNS, T0 + 9 * DAY).length, 0);
});

test("an id does not carry the book's text", () => {
  const id = passageId("It was a bright cold day in April, and the clocks", mark(T0));
  assert.ok(!id.includes("April"));
  assert.notEqual(id, passageId("Another book entirely", mark(T0)));
});

test("stored state that makes no sense becomes a clean start", () => {
  assert.deepEqual(normalizeReturns(null), EMPTY_RETURNS);
  assert.deepEqual(normalizeReturns({ marks: { a: { step: -1, seenAt: 1 } }, shown: "x" }), EMPTY_RETURNS);
  assert.deepEqual(normalizeReturns({ marks: { a: { step: 1, seenAt: 5 } }, day: "2026-09-01", shown: 2 }), {
    marks: { a: { step: 1, seenAt: 5 } },
    day: "2026-09-01",
    shown: 2,
  });
});

test("how long ago is said the way a person would", () => {
  assert.equal(markedAgo(T0, T0 + 3 * DAY), "Marked 3 days ago");
  assert.equal(markedAgo(T0, T0 + 21 * DAY), "Marked 3 weeks ago");
  assert.equal(markedAgo(T0, T0 + 60 * DAY), "Marked 2 months ago");
});
