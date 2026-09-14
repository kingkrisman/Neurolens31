/**
 * Freehand ink over a page that reflows.
 *
 * Drawing on a fixed page is easy: keep the pixels. This page is not fixed —
 * font, size, spacing and column width all change under the reader, which is
 * the point of the app — so screen coordinates are worthless the moment
 * anything moves. A circle drawn around a paragraph has to still be around that
 * paragraph at a larger font size.
 *
 * So a stroke is stored the way a highlight is: anchored to a line, in that
 * line's own coordinates. Both are divided by the line's *width*, never its
 * height. One divisor for both axes keeps the scale uniform, so a circle
 * re-rendered in a narrower column is a smaller circle rather than an ellipse.
 * Line height is deliberately not used: it changes with line-height settings
 * independently of width, and dividing y by it would squash every drawing.
 *
 * What this cannot do is follow individual words — ink is not glued to letters,
 * it is glued to the line it started on and scales with the column. Circling a
 * word and then tripling the font size leaves the circle near that word, not on
 * it. That is the honest limit of drawing on reflowing text.
 */

import { HIGHLIGHT_COLORS } from "./highlight-colors.ts";

export type InkToolId = "pen" | "marker" | "pencil" | "eraser";

export interface InkTool {
  id: InkToolId;
  label: string;
  /** Stroke width in line-width units, so the nib scales with the column. */
  width: number;
  opacity: number;
  cap: "round" | "butt";
  /** Marker ink sits under the text; pen and pencil sit over it. */
  under: boolean;
}

export const INK_TOOLS: InkTool[] = [
  { id: "pen", label: "Pen", width: 0.006, opacity: 1, cap: "round", under: false },
  { id: "marker", label: "Marker", width: 0.038, opacity: 0.35, cap: "butt", under: true },
  { id: "pencil", label: "Pencil", width: 0.0035, opacity: 0.72, cap: "round", under: false },
  { id: "eraser", label: "Eraser", width: 0.03, opacity: 1, cap: "round", under: false },
];

export function toolById(id: string | undefined): InkTool {
  return INK_TOOLS.find((tool) => tool.id === id) ?? INK_TOOLS[0]!;
}

/** Ink colours: the marker palette, plus a graphite for ordinary writing. */
export const INK_COLORS = [
  { id: "graphite", label: "Graphite", hex: "#2B2118" },
  ...HIGHLIGHT_COLORS.map((color) => ({ id: color.id, label: color.label, hex: color.hex })),
];

export function inkColorById(id: string | undefined) {
  return INK_COLORS.find((color) => color.id === id) ?? INK_COLORS[0]!;
}

export interface InkStroke {
  id: string;
  /** Chapter, Part or PDF page this was drawn on. */
  section: number;
  /** The line the stroke is pinned to — the same anchor a highlight uses. */
  lineIdx: number;
  tool: InkToolId;
  color: string;
  /**
   * Flat [x, y, x, y, …] in anchor-line units.
   *
   * Flat rather than an array of points because a stroke is hundreds of numbers
   * and this all goes through JSON into localStorage, where the braces and key
   * names of `{x, y}` objects would roughly triple it.
   */
  points: number[];
  at: number;
}

/** The anchor line's box on screen, in the drawing surface's coordinates. */
export interface AnchorRect {
  left: number;
  top: number;
  width: number;
}

/** Screen point → anchor-line units. */
export function toLineSpace(x: number, y: number, rect: AnchorRect): [number, number] {
  const scale = rect.width || 1;
  return [(x - rect.left) / scale, (y - rect.top) / scale];
}

/** Anchor-line units → screen point. */
export function toScreenSpace(nx: number, ny: number, rect: AnchorRect): [number, number] {
  const scale = rect.width || 1;
  return [rect.left + nx * scale, rect.top + ny * scale];
}

/**
 * Drop points that add nothing to the shape (Ramer–Douglas–Peucker).
 *
 * A pointer emits a sample every few milliseconds, so a single circle can be
 * eight hundred points, nearly all of them on a line between their neighbours.
 * Kept, they bloat storage and slow every repaint for no visible difference.
 */
export function simplify(points: number[], tolerance = 0.002): number[] {
  const count = points.length / 2;
  if (count < 3) return [...points];

  const keep = new Uint8Array(count);
  keep[0] = 1;
  keep[count - 1] = 1;

  const stack: Array<[number, number]> = [[0, count - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    if (last <= first + 1) continue;

    const ax = points[first * 2]!;
    const ay = points[first * 2 + 1]!;
    const bx = points[last * 2]!;
    const by = points[last * 2 + 1]!;
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;

    let worst = -1;
    let worstIndex = -1;
    for (let i = first + 1; i < last; i += 1) {
      const px = points[i * 2]!;
      const py = points[i * 2 + 1]!;
      // Perpendicular distance to the chord, or to the endpoint when the chord
      // has no length (a stroke that came back to where it started).
      let distance: number;
      if (lengthSq === 0) {
        distance = Math.hypot(px - ax, py - ay);
      } else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
        distance = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      }
      if (distance > worst) {
        worst = distance;
        worstIndex = i;
      }
    }

    if (worst > tolerance && worstIndex > 0) {
      keep[worstIndex] = 1;
      stack.push([first, worstIndex], [worstIndex, last]);
    }
  }

  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    if (keep[i]) out.push(points[i * 2]!, points[i * 2 + 1]!);
  }
  return out;
}

/**
 * An SVG path through the points, rounded off.
 *
 * Straight segments between samples make a hand-drawn line look like a polygon
 * wherever the hand moved quickly. A Catmull-Rom spline converted to cubic
 * béziers passes through every sample while curving between them, which is what
 * ink does.
 */
export function pathFrom(points: number[]): string {
  const count = points.length / 2;
  if (count === 0) return "";
  const at = (i: number): [number, number] => {
    const j = Math.max(0, Math.min(count - 1, i));
    return [points[j * 2]!, points[j * 2 + 1]!];
  };

  // A single sample is a dot: a tiny closed arc, so a tap still leaves a mark.
  if (count === 1) {
    const [x, y] = at(0);
    return `M ${x} ${y} l 0.0001 0`;
  }

  let d = `M ${at(0)[0]} ${at(0)[1]}`;
  for (let i = 0; i < count - 1; i += 1) {
    const [x0, y0] = at(i - 1);
    const [x1, y1] = at(i);
    const [x2, y2] = at(i + 1);
    const [x3, y3] = at(i + 2);
    // Catmull-Rom to Bézier: the sixth is the standard tension for a curve that
    // passes through its points without overshooting between them.
    const c1x = x1 + (x2 - x0) / 6;
    const c1y = y1 + (y2 - y0) / 6;
    const c2x = x2 - (x3 - x1) / 6;
    const c2y = y2 - (y3 - y1) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
  }
  return d;
}

/**
 * Whether an eraser at this point catches this stroke.
 *
 * Erasing works on whole strokes rather than on pixels: a reader who wants a
 * circle gone wants the circle gone, not a gap chewed out of one side of it.
 */
export function strokeHit(points: number[], x: number, y: number, radius: number): boolean {
  const count = points.length / 2;
  if (count === 0) return false;
  if (count === 1) return Math.hypot(points[0]! - x, points[1]! - y) <= radius;

  for (let i = 0; i < count - 1; i += 1) {
    const ax = points[i * 2]!;
    const ay = points[i * 2 + 1]!;
    const bx = points[(i + 1) * 2]!;
    const by = points[(i + 1) * 2 + 1]!;
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSq));
    if (Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) <= radius) return true;
  }
  return false;
}

/** A stroke id that does not need a crypto dependency to be unique enough. */
export function strokeId(): string {
  return `ink-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Cap what one book may hold.
 *
 * Ink is the heaviest thing this app stores, and localStorage is a few
 * megabytes for everything. Oldest strokes go first, because a drawing someone
 * is working on now matters more than one from a chapter they have left.
 */
export const MAX_STROKES_PER_BOOK = 600;

export function trimStrokes(strokes: InkStroke[]): InkStroke[] {
  if (strokes.length <= MAX_STROKES_PER_BOOK) return strokes;
  return [...strokes].sort((a, b) => a.at - b.at).slice(strokes.length - MAX_STROKES_PER_BOOK);
}
