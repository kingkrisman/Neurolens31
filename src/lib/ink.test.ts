import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  INK_COLORS,
  INK_TOOLS,
  MAX_STROKES_PER_BOOK,
  type InkStroke,
  inkColorById,
  pathFrom,
  simplify,
  strokeHit,
  strokeId,
  toLineSpace,
  toScreenSpace,
  toolById,
  trimStrokes,
} from "./ink.ts";

const rect = { left: 100, top: 200, width: 400 };

describe("anchor-line coordinates", () => {
  it("round-trips a point", () => {
    const [nx, ny] = toLineSpace(300, 260, rect);
    const [x, y] = toScreenSpace(nx, ny, rect);
    assert.ok(Math.abs(x - 300) < 1e-9);
    assert.ok(Math.abs(y - 260) < 1e-9);
  });

  it("scales both axes by the same number, so a circle stays a circle", () => {
    // The bug this guards: dividing y by line height instead of width turns
    // every drawing into an ellipse the moment line-height changes.
    const [ax, ay] = toLineSpace(rect.left + 40, rect.top + 40, rect);
    assert.equal(ax, ay);
  });

  it("re-renders a drawing smaller in a narrower column", () => {
    const [nx, ny] = toLineSpace(300, 260, rect);
    const narrow = { left: 0, top: 0, width: 200 };
    const [x, y] = toScreenSpace(nx, ny, narrow);
    assert.ok(Math.abs(x - 100) < 1e-9, "half the column, half the offset");
    assert.ok(Math.abs(y - 30) < 1e-9);
  });

  it("follows its line down the page", () => {
    // Same normalised point, line moved: the ink moves with it.
    const [nx, ny] = toLineSpace(300, 260, rect);
    const moved = { ...rect, top: 500 };
    const [, y] = toScreenSpace(nx, ny, moved);
    assert.equal(y, 560);
  });

  it("survives a zero-width rect rather than dividing by zero", () => {
    const [nx, ny] = toLineSpace(10, 10, { left: 0, top: 0, width: 0 });
    assert.ok(Number.isFinite(nx) && Number.isFinite(ny));
  });
});

describe("simplify", () => {
  it("collapses a straight run to its endpoints", () => {
    const straight = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4];
    assert.deepEqual(simplify(straight, 0.01), [0, 0, 4, 4]);
  });

  it("keeps the corner of a shape", () => {
    const corner = [0, 0, 1, 0, 2, 0, 2, 1, 2, 2];
    const out = simplify(corner, 0.01);
    assert.ok(out.length / 2 >= 3, "the turn must survive");
    // The corner point itself is what makes it a corner.
    let hasCorner = false;
    for (let i = 0; i < out.length; i += 2) {
      if (out[i] === 2 && out[i + 1] === 0) hasCorner = true;
    }
    assert.ok(hasCorner);
  });

  it("leaves a stroke of one or two points alone", () => {
    assert.deepEqual(simplify([1, 2], 0.01), [1, 2]);
    assert.deepEqual(simplify([1, 2, 3, 4], 0.01), [1, 2, 3, 4]);
  });

  it("always keeps both ends", () => {
    const noisy = Array.from({ length: 200 }, (_, i) => (i % 2 ? Math.sin(i) * 0.001 : i * 0.01));
    const out = simplify(noisy, 0.005);
    assert.equal(out[0], noisy[0]);
    assert.equal(out[out.length - 1], noisy[noisy.length - 1]);
  });

  it("throws nothing at a stroke that returns to its start", () => {
    // Zero-length chord: the distance maths must not divide by it.
    const loop = [0, 0, 1, 1, 0, 0];
    assert.doesNotThrow(() => simplify(loop, 0.01));
  });

  it("actually reduces a dense capture", () => {
    const dense: number[] = [];
    for (let i = 0; i < 400; i += 1) dense.push(i * 0.001, Math.sin(i * 0.02) * 0.1);
    assert.ok(simplify(dense, 0.002).length < dense.length / 3);
  });
});

describe("pathFrom", () => {
  it("returns nothing for no points", () => {
    assert.equal(pathFrom([]), "");
  });

  it("leaves a dot for a tap", () => {
    assert.match(pathFrom([5, 6]), /^M 5 6/);
  });

  it("starts at the first point and curves through the rest", () => {
    const d = pathFrom([0, 0, 1, 1, 2, 0]);
    assert.match(d, /^M 0 0/);
    assert.ok(d.includes("C"), "a hand-drawn line is curved, not a polygon");
  });

  it("emits one curve per gap between samples", () => {
    const d = pathFrom([0, 0, 1, 1, 2, 0, 3, 1]);
    assert.equal((d.match(/C/g) ?? []).length, 3);
  });

  it("produces only finite numbers", () => {
    const d = pathFrom([0, 0, 1, 1, 2, 2]);
    for (const n of d.match(/-?\d+\.?\d*/g) ?? []) assert.ok(Number.isFinite(Number(n)));
  });
});

describe("strokeHit", () => {
  const line = [0, 0, 10, 0];

  it("catches a stroke the eraser passes over", () => {
    assert.equal(strokeHit(line, 5, 0.2, 1), true);
  });

  it("misses one it does not", () => {
    assert.equal(strokeHit(line, 5, 8, 1), false);
  });

  it("catches a stroke between two samples, not only at them", () => {
    // Erasing must work on the drawn line, not on the points that defined it.
    assert.equal(strokeHit([0, 0, 100, 0], 50, 0, 0.5), true);
  });

  it("catches a single-point dot", () => {
    assert.equal(strokeHit([3, 3], 3.2, 3, 1), true);
  });

  it("misses an empty stroke", () => {
    assert.equal(strokeHit([], 0, 0, 5), false);
  });
});

describe("tools", () => {
  it("gives the marker a wider, softer nib than the pen", () => {
    const pen = toolById("pen");
    const marker = toolById("marker");
    assert.ok(marker.width > pen.width);
    assert.ok(marker.opacity < pen.opacity);
  });

  it("puts marker ink under the text and pen ink over it", () => {
    // A translucent wash belongs behind the words; a pen line belongs in front.
    assert.equal(toolById("marker").under, true);
    assert.equal(toolById("pen").under, false);
  });

  it("falls back to the pen for an unknown tool", () => {
    assert.equal(toolById("quill").id, "pen");
    assert.equal(toolById(undefined).id, "pen");
  });

  it("offers an eraser", () => {
    assert.ok(INK_TOOLS.some((t) => t.id === "eraser"));
  });
});

describe("ink colours", () => {
  it("leads with a dark ink, since most writing is not coloured", () => {
    assert.equal(INK_COLORS[0]!.id, "graphite");
  });

  it("falls back rather than returning undefined", () => {
    assert.equal(inkColorById("chartreuse").id, "graphite");
    assert.equal(inkColorById(undefined).id, "graphite");
  });

  it("keeps ids unique", () => {
    const ids = INK_COLORS.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe("strokeId", () => {
  it("does not collide across a burst of strokes", () => {
    const ids = new Set(Array.from({ length: 500 }, () => strokeId()));
    assert.equal(ids.size, 500);
  });
});

describe("trimStrokes", () => {
  const stroke = (at: number): InkStroke => ({
    id: `s${at}`, section: 1, lineIdx: 0, tool: "pen", color: "graphite", points: [0, 0], at,
  });

  it("leaves a book under the cap alone", () => {
    const few = [stroke(1), stroke(2)];
    assert.equal(trimStrokes(few).length, 2);
  });

  it("drops the oldest when the cap is passed", () => {
    const many = Array.from({ length: MAX_STROKES_PER_BOOK + 10 }, (_, i) => stroke(i));
    const kept = trimStrokes(many);
    assert.equal(kept.length, MAX_STROKES_PER_BOOK);
    // The ten oldest are the ones gone.
    assert.equal(kept[0]!.at, 10);
    assert.equal(kept.at(-1)!.at, MAX_STROKES_PER_BOOK + 9);
  });
});
