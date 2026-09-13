import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { describePart, describeTimeLeft, positionOf, resumeTarget, sectionsOf } from "./reading-position.ts";
import type { Session } from "./types.ts";

/**
 * Long enough that the reader would paginate it into Parts.
 *
 * Pagination starts at twelve thousand words, so a fixture has to clear that —
 * a shorter one stays a single section and the test silently checks nothing.
 */
const LONG = Array.from(
  { length: 1400 },
  (_, i) => `Paragraph ${i} with a reasonable number of words in it to count toward the total.`,
).join("\n\n");

const session = (over: Partial<Session> = {}): Session => ({
  title: "Book",
  content: LONG,
  openedAt: Date.now(),
  progress: 0,
  ...over,
});

describe("sectionsOf", () => {
  it("divides a long book the way the reader does", () => {
    assert.ok(sectionsOf(LONG).length > 1);
  });

  it("leaves a short passage undivided", () => {
    assert.equal(sectionsOf("One short paragraph.").length, 1);
  });
});

describe("positionOf", () => {
  it("reports the part the session recorded, not one inferred from a fraction", () => {
    // The bug this guards: `progress` is a scroll fraction of the open section,
    // so treating it as book-wide put a reader 31% into Part 1 at "Part 2 of 6"
    // — and tapping Continue then opened Part 1, contradicting the label.
    const pos = positionOf(session({ progress: 0.31, section: 1 }));
    assert.equal(pos.part, 1);
    assert.ok(pos.totalParts > 1);
  });

  it("follows the reader into a later part", () => {
    assert.equal(positionOf(session({ progress: 0.2, section: 3 })).part, 3);
  });

  it("starts at part one when a session predates part tracking", () => {
    assert.equal(positionOf(session({ progress: 0.4 })).part, 1);
  });

  it("will not name a part the book does not have", () => {
    const pos = positionOf(session({ progress: 0.5, section: 999 }));
    assert.equal(pos.part, pos.totalParts);
  });

  it("counts words to the end of the part, not the book", () => {
    const pos = positionOf(session({ progress: 0.5, section: 2 }));
    const sections = sectionsOf(LONG);
    const perSection = LONG.trim().split(/\s+/).length / sections.length;
    assert.ok(pos.wordsLeft <= Math.ceil(perSection), "never more than one part's worth");
  });

  it("shrinks the estimate as the reader moves through a part", () => {
    const early = positionOf(session({ progress: 0.1, section: 2 }));
    const late = positionOf(session({ progress: 0.9, section: 2 }));
    assert.ok(late.wordsLeft < early.wordsLeft);
  });

  it("uses the reader's own pace when there is one", () => {
    const slow = positionOf(session({ progress: 0.2, section: 2, currentWpm: 100 }));
    const fast = positionOf(session({ progress: 0.2, section: 2, currentWpm: 400 }));
    assert.ok(slow.minutesLeft! > fast.minutesLeft!);
  });

  it("will not let a stalled session claim an absurd estimate", () => {
    // A pace of 1 wpm would project days; the floor keeps it sane.
    const stalled = positionOf(session({ progress: 0.2, section: 2, currentWpm: 1 }));
    const normal = positionOf(session({ progress: 0.2, section: 2, currentWpm: 220 }));
    assert.ok(stalled.minutesLeft! < normal.minutesLeft! * 4);
  });

  it("counts the book done only at the end of the last part", () => {
    const total = sectionsOf(LONG).length;
    assert.equal(positionOf(session({ progress: 1, section: total })).finished, true);
    // The end of any earlier part is a part finished, not a book finished.
    assert.equal(positionOf(session({ progress: 1, section: 1 })).finished, false);
    assert.equal(positionOf(session({ progress: 0.4, section: total })).finished, false);
  });

  it("handles an undivided passage without pretending it has parts", () => {
    const pos = positionOf(session({ content: "A short thing to read.", progress: 0 }));
    assert.equal(pos.totalParts, 1);
    assert.equal(pos.part, 0);
  });

  it("reports the within-part offset the reader restores scroll from", () => {
    assert.equal(positionOf(session({ progress: 0.42, section: 2 })).within, 0.42);
  });
});

describe("describeTimeLeft", () => {
  it("answers in minutes, which is the unit a decision is made in", () => {
    assert.match(describeTimeLeft(positionOf(session({ progress: 0.1, section: 1 })))!, /about \d+ (min|hr) left/);
  });

  it("stops pretending to precision past an hour", () => {
    const long = { part: 1, totalParts: 2, wordsLeft: 40_000, minutesLeft: 180, finished: false, within: 0.2 };
    assert.equal(describeTimeLeft(long), "about 3 hr left");
  });

  it("says finished rather than zero minutes", () => {
    const total = sectionsOf(LONG).length;
    assert.equal(describeTimeLeft(positionOf(session({ progress: 1, section: total }))), "finished");
  });
});

describe("describePart", () => {
  it("names the part and the total", () => {
    assert.match(describePart(positionOf(session({ progress: 0.3, section: 2 })))!, /Part 2 of \d+/);
  });

  it("says nothing about an undivided passage", () => {
    assert.equal(describePart(positionOf(session({ content: "Short.", progress: 0 }))), null);
  });
});

describe("resumeTarget", () => {
  it("returns the reader to exactly where they stopped", () => {
    const target = resumeTarget(positionOf(session({ progress: 0.4, section: 3 })));
    assert.deepEqual(target, { part: 3, within: 0.4 });
  });

  it("moves on rather than replaying a part the reader finished", () => {
    // Scrolled to the bottom of Part 3 and closed the app. Reopening at the top
    // of Part 3 would be fifteen minutes of re-reading.
    const target = resumeTarget(positionOf(session({ progress: 1, section: 3 })));
    assert.deepEqual(target, { part: 4, within: 0 });
  });

  it("has nowhere to send a reader who finished the last part", () => {
    const total = sectionsOf(LONG).length;
    const target = resumeTarget(positionOf(session({ progress: 1, section: total })));
    assert.equal(target.part, total);
    assert.equal(target.within, 0);
  });
});
