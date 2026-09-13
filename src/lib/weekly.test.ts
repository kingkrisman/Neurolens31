import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { startOfWeek, weeklyReading, weekOverWeek } from "./insights.ts";

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;
// A Wednesday, so week-start maths has something to actually shift.
const NOW = new Date("2026-09-09T12:00:00").getTime();

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

describe("startOfWeek", () => {
  it("lands on Monday at midnight", () => {
    const start = new Date(startOfWeek(NOW));
    assert.equal(start.getDay(), 1, "Monday");
    assert.equal(start.getHours(), 0);
    assert.equal(start.getMinutes(), 0);
  });

  it("is stable across a whole week", () => {
    const monday = startOfWeek(NOW);
    assert.equal(startOfWeek(monday + 3 * DAY), monday);
    assert.equal(startOfWeek(monday + 6 * DAY), monday);
  });

  it("treats Sunday as the end of its week, not the start of the next", () => {
    const monday = startOfWeek(NOW);
    const sunday = monday + 6 * DAY;
    assert.equal(startOfWeek(sunday), monday);
  });
});

describe("weeklyReading", () => {
  it("keeps empty weeks instead of closing the gap", () => {
    const series = weeklyReading([{ openedAt: NOW, content: words(10) }], 4, NOW);
    assert.equal(series.length, 4);
    assert.deepEqual(series.map((w) => w.words), [0, 0, 0, 10]);
  });

  it("puts the most recent week last", () => {
    const series = weeklyReading([], 3, NOW);
    assert.ok(series[2]!.weekStart > series[0]!.weekStart);
    assert.equal(series[2]!.weekStart, startOfWeek(NOW));
  });

  it("sums words and counts sittings in the right bucket", () => {
    const series = weeklyReading(
      [
        { openedAt: NOW, content: words(10) },
        { openedAt: NOW - 60_000, content: words(5) },
        { openedAt: NOW - WEEK, content: words(7) },
      ],
      3,
      NOW,
    );
    assert.deepEqual(series.map((w) => w.words), [0, 7, 15]);
    assert.deepEqual(series.map((w) => w.sessions), [0, 1, 2]);
  });

  it("ignores sittings older than the window", () => {
    const series = weeklyReading([{ openedAt: NOW - 20 * WEEK, content: words(99) }], 4, NOW);
    assert.equal(series.reduce((sum, w) => sum + w.words, 0), 0);
  });
});

describe("weekOverWeek", () => {
  it("reports growth as a signed fraction", () => {
    const series = weeklyReading(
      [
        { openedAt: NOW, content: words(150) },
        { openedAt: NOW - WEEK, content: words(100) },
      ],
      2,
      NOW,
    );
    assert.equal(weekOverWeek(series), 0.5);
  });

  it("reports a fall as negative", () => {
    const series = weeklyReading(
      [
        { openedAt: NOW, content: words(50) },
        { openedAt: NOW - WEEK, content: words(100) },
      ],
      2,
      NOW,
    );
    assert.equal(weekOverWeek(series), -0.5);
  });

  it("does not divide by a week with no reading in it", () => {
    const series = weeklyReading([{ openedAt: NOW, content: words(10) }], 2, NOW);
    assert.equal(weekOverWeek(series), 1);
  });

  it("says nothing when there is nothing to compare", () => {
    assert.equal(weekOverWeek([]), null);
    assert.equal(weekOverWeek(weeklyReading([], 2, NOW)), null);
  });
});
