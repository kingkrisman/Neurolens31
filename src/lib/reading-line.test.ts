import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  boxInPane,
  chooseFollowHit,
  firstVisibleBox,
  pickClosestBox,
  readingAnchorY,
  readingFloorY,
} from "./reading-line.ts";

describe("reading line", () => {
  it("anchors near the top of the view, not the middle", () => {
    const y = readingAnchorY(0, 800);
    assert.ok(y <= 120);
    assert.ok(y >= 64);
  });

  it("keeps the floor under the chrome, not halfway down", () => {
    const floor = readingFloorY(0, 800);
    assert.ok(floor <= 96);
    assert.ok(floor >= 52);
  });

  it("picks the line-box at the top of the view, not a wrapped block’s middle", () => {
    const viewTop = 0;
    const viewBottom = 600;
    const anchor = readingAnchorY(viewTop, 600);
    const boxes = [
      { top: 80, height: 32, bottom: 112 },
      { top: 120, height: 32, bottom: 152 },
      { top: 280, height: 32, bottom: 312 },
    ];
    const hit = pickClosestBox(boxes, anchor, viewTop, viewBottom);
    assert.ok(hit);
    assert.equal(hit.top, 80);
  });

  it("uses the first visible line of a wrapped sentence, not its middle", () => {
    const boxes = [
      { top: 90, height: 28, bottom: 118 },
      { top: 122, height: 28, bottom: 150 },
      { top: 154, height: 28, bottom: 182 },
      { top: 250, height: 28, bottom: 278 },
      { top: 400, height: 28, bottom: 428 },
    ];
    const hit = firstVisibleBox(boxes, 0, 700, 72);
    assert.ok(hit);
    assert.equal(hit.top, 90);
  });

  it("skips line-boxes still under the header", () => {
    const boxes = [
      { top: 20, height: 28, bottom: 48 },
      { top: 88, height: 28, bottom: 116 },
      { top: 200, height: 28, bottom: 228 },
    ];
    const hit = firstVisibleBox(boxes, 0, 700, 72);
    assert.ok(hit);
    assert.equal(hit.top, 88);
  });

  it("ignores line-boxes that have scrolled out of view", () => {
    const boxes = [
      { top: -80, height: 32, bottom: -48 },
      { top: 200, height: 32, bottom: 232 },
    ];
    const hit = firstVisibleBox(boxes, 0, 600, 0);
    assert.ok(hit);
    assert.equal(hit.top, 200);
  });

  it("rides a line as it moves instead of snapping back to the top", () => {
    const hits = [
      { id: 0, boxIndex: 0, box: { top: 140, height: 28, bottom: 168 } },
      { id: 0, boxIndex: 1, box: { top: 172, height: 28, bottom: 200 } },
      { id: 1, boxIndex: 0, box: { top: 220, height: 28, bottom: 248 } },
    ];
    const stay = chooseFollowHit(hits, 0, 700, { id: 0, boxIndex: 1 });
    assert.ok(stay);
    assert.equal(stay.boxIndex, 1);
    assert.equal(stay.box.top, 172);
  });

  it("keeps a mid-page line as it rides up, instead of locking to the first visible", () => {
    const hits = [
      { id: 0, boxIndex: 0, box: { top: 88, height: 28, bottom: 116 } },
      { id: 4, boxIndex: 0, box: { top: 260, height: 28, bottom: 288 } },
    ];
    const stay = chooseFollowHit(hits, 0, 700, { id: 4, boxIndex: 0 });
    assert.ok(stay);
    assert.equal(stay.id, 4);
    assert.equal(stay.box.top, 260);
  });

  it("rides a line under the chrome instead of hopping to the next one", () => {
    const hits = [
      { id: 0, boxIndex: 0, box: { top: 20, height: 28, bottom: 48 } },
      { id: 0, boxIndex: 1, box: { top: 90, height: 28, bottom: 118 } },
      { id: 1, boxIndex: 0, box: { top: 130, height: 28, bottom: 158 } },
    ];
    const stay = chooseFollowHit(hits, 0, 700, { id: 0, boxIndex: 0 });
    assert.ok(stay);
    assert.equal(stay.id, 0);
    assert.equal(stay.boxIndex, 0);
    assert.equal(stay.box.top, 20);
  });

  it("advances to the next line only after the current one has left the pane", () => {
    const hits = [
      { id: 0, boxIndex: 0, box: { top: -40, height: 28, bottom: -12 } },
      { id: 0, boxIndex: 1, box: { top: 20, height: 28, bottom: 48 } },
      { id: 1, boxIndex: 0, box: { top: 60, height: 28, bottom: 88 } },
    ];
    const next = chooseFollowHit(hits, 0, 700, { id: 0, boxIndex: 0 });
    assert.ok(next);
    assert.equal(next.id, 0);
    assert.equal(next.boxIndex, 1);
  });

  it("pins to a clicked sentence even when another line is higher", () => {
    const hits = [
      { id: 0, boxIndex: 0, box: { top: 90, height: 28, bottom: 118 } },
      { id: 4, boxIndex: 0, box: { top: 240, height: 28, bottom: 268 } },
    ];
    const pinned = chooseFollowHit(hits, 0, 700, { id: 0, boxIndex: 0 }, 4);
    assert.ok(pinned);
    assert.equal(pinned.id, 4);
  });

  it("treats a box overlapping the pane edge as still in the pane", () => {
    assert.equal(boxInPane({ top: -10, height: 28, bottom: 18 }, 0, 600), true);
    assert.equal(boxInPane({ top: -40, height: 28, bottom: -12 }, 0, 600), false);
  });
});
