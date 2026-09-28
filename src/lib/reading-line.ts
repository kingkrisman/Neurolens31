/** Where the eye enters the page: under the chrome, not halfway down. */
export const READING_ANCHOR = 0.16;

export interface LineBox {
  top: number;
  height: number;
  bottom: number;
  /** Horizontal extent. Only matters in pages, where lines sit side by side. */
  left?: number;
  right?: number;
}

export interface FollowState {
  id: number;
  boxIndex: number;
}

export interface ReadingHit {
  el: HTMLElement;
  id: number;
  box: LineBox;
  boxIndex: number;
}

export function readingAnchorY(viewTop: number, viewHeight: number): number {
  const inset = Math.min(108, Math.max(72, viewHeight * READING_ANCHOR));
  return viewTop + inset;
}

/** Ignore line-boxes tucked under the floating header — initial pick only. */
export function readingFloorY(viewTop: number, viewHeight: number): number {
  return viewTop + Math.min(96, Math.max(52, viewHeight * 0.1));
}

export function lineBoxesOf(el: Element): LineBox[] {
  return Array.from(el.getClientRects())
    .filter((rect) => rect.width > 2 && rect.height > 2)
    .map((rect) => ({
      top: rect.top,
      height: rect.height,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
    }));
}

function visibleBoxes(boxes: LineBox[], floor: number, viewBottom: number): LineBox[] {
  return boxes.filter(
    (box) => box.height >= 2 && box.bottom > floor + 4 && box.top < viewBottom - 4,
  );
}

export function boxOnScreen(box: LineBox, floor: number, viewBottom: number): boolean {
  return box.height >= 2 && box.bottom > floor + 4 && box.top < viewBottom - 4;
}

/** Still inside the overlay, including under the header — used to ride a line. */
export function boxInPane(box: LineBox, viewTop: number, viewBottom: number): boolean {
  return box.height >= 2 && box.bottom > viewTop + 2 && box.top < viewBottom - 2;
}

/** Topmost visible line-box — the line you enter, not the middle of a wrap. */
export function firstVisibleBox(
  boxes: LineBox[],
  viewTop: number,
  viewBottom: number,
  floor?: number,
): LineBox | null {
  const visible = visibleBoxes(boxes, floor ?? viewTop, viewBottom);
  if (!visible.length) return null;
  let best = visible[0]!;
  for (const box of visible) {
    if (box.top < best.top) best = box;
  }
  return best;
}

/** Pick the line-box nearest the reading anchor, ignoring boxes outside the view. */
export function pickClosestBox(
  boxes: LineBox[],
  anchorY: number,
  viewTop: number,
  viewBottom: number,
): LineBox | null {
  const visible = visibleBoxes(boxes, viewTop, viewBottom);
  if (!visible.length) return null;
  const covering = visible.filter((box) => box.top <= anchorY && box.bottom >= anchorY);
  const pool = covering.length ? covering : visible;
  let best = pool[0]!;
  let bestDist = Infinity;
  for (const box of pool) {
    const dist = Math.abs(box.top + box.height / 2 - anchorY);
    if (dist < bestDist) {
      bestDist = dist;
      best = box;
    }
  }
  return best;
}

export function visibleBoxForLine(el: Element, view: DOMRect): LineBox | null {
  const boxes = lineBoxesOf(el);
  const floor = readingFloorY(view.top, view.height);
  return firstVisibleBox(boxes, view.top, view.bottom, floor);
}

/**
 * Ride a visual line as its box moves through the pane. The band stays glued
 * to that text — including in the middle of the page — until the box actually
 * leaves the overlay. Click/speech pin via preferId.
 */
export function chooseFollowHit<T extends { id: number; boxIndex: number; box: LineBox }>(
  hits: T[],
  viewTop: number,
  viewBottom: number,
  prev: FollowState | null,
  preferId?: number | null,
): T | null {
  if (!hits.length) return null;
  const inPane = (hit: T) => boxInPane(hit.box, viewTop, viewBottom);
  const indexOf = (id: number, boxIndex: number) =>
    hits.findIndex((hit) => hit.id === id && hit.boxIndex === boxIndex);

  const firstInPaneAfter = (from: number) => {
    for (let j = from + 1; j < hits.length; j += 1) {
      if (inPane(hits[j]!)) return hits[j]!;
    }
    return null;
  };
  const lastInPaneBefore = (from: number) => {
    for (let j = from - 1; j >= 0; j -= 1) {
      if (inPane(hits[j]!)) return hits[j]!;
    }
    return null;
  };

  if (preferId != null) {
    const ofPin = hits.filter((hit) => hit.id === preferId);
    if (ofPin.length) {
      if (prev?.id === preferId) {
        const same = ofPin.find((hit) => hit.boxIndex === prev.boxIndex && inPane(hit));
        if (same) return same;
      }
      const visible = ofPin.filter(inPane);
      if (visible.length) return visible[0]!;
      const last = ofPin[ofPin.length - 1]!;
      const first = ofPin[0]!;
      if (last.box.bottom <= viewTop + 2) {
        const i = indexOf(last.id, last.boxIndex);
        return firstInPaneAfter(i) ?? last;
      }
      if (first.box.top >= viewBottom - 2) {
        const i = indexOf(first.id, first.boxIndex);
        return lastInPaneBefore(i) ?? first;
      }
      return last;
    }
  }

  if (prev) {
    const i = indexOf(prev.id, prev.boxIndex);
    const current = i >= 0 ? hits[i]! : null;
    if (current && inPane(current)) return current;
    if (current && current.box.bottom <= viewTop + 2) {
      return firstInPaneAfter(i) ?? current;
    }
    if (current && current.box.top >= viewBottom - 2) {
      return lastInPaneBefore(i) ?? current;
    }
    if (current) return current;
  }

  const floor = readingFloorY(viewTop, Math.max(1, viewBottom - viewTop));
  return (
    hits.find((hit) => boxOnScreen(hit.box, floor, viewBottom)) ??
    hits.find(inPane) ??
    hits[0] ??
    null
  );
}

/**
 * Whether a line-box is across from the view rather than in it.
 *
 * Every rule below reasons about top and bottom, because the reader used to
 * scroll only one way. In pages the next page's lines sit at the same heights,
 * one screen to the right — so without this the band could settle on a line
 * nobody can see. In scrolling every line is horizontally in view, and this
 * never excludes anything.
 */
export function beside(box: LineBox, viewLeft: number, viewRight: number): boolean {
  if (box.left == null || box.right == null) return false;
  return box.right <= viewLeft + 2 || box.left >= viewRight - 2;
}

export function collectReadingHits(scrollNode: HTMLElement, view?: DOMRect | null): ReadingHit[] {
  const lines = Array.from(scrollNode.querySelectorAll<HTMLElement>(".reading-line"));
  const hits: ReadingHit[] = [];
  // In pages, text runs through the columns in document order, so the lines
  // on screen are one contiguous run. Find where it starts by halving, and
  // stop at the first line on the next page — instead of measuring every line
  // of a long chapter on every turn, which was most of the cost of a turn
  // once rendering was fixed. Scrolling measures every line, as before.
  const paged = view != null && scrollNode.dataset.layout === "pages";
  let from = 0;
  if (paged) {
    let lo = 0;
    let hi = lines.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (lines[mid]!.getBoundingClientRect().right <= view.left + 2) lo = mid + 1;
      else hi = mid;
    }
    from = lo;
  }
  for (let i = from; i < lines.length; i += 1) {
    const el = lines[i]!;
    if (paged) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.left >= view.right - 2) break;
    }
    const raw = el.id.startsWith("line-") ? Number(el.id.slice(5)) : Number.NaN;
    if (!Number.isFinite(raw)) continue;
    const boxes = lineBoxesOf(el);
    boxes.forEach((box, boxIndex) => {
      if (view && beside(box, view.left, view.right)) return;
      hits.push({ el, id: raw, box, boxIndex });
    });
  }
  return hits;
}

export function followReadingLine(
  scrollNode: HTMLElement,
  view?: DOMRect | null,
  prev?: FollowState | null,
  preferId?: number | null,
): ReadingHit | null {
  const viewRect = view ?? scrollNode.getBoundingClientRect();
  return chooseFollowHit(
    collectReadingHits(scrollNode, viewRect),
    viewRect.top,
    viewRect.bottom,
    prev ?? null,
    preferId,
  );
}

export function pickReadingLine(
  scrollNode: HTMLElement,
  view?: DOMRect | null,
): { el: HTMLElement; id: number; box: LineBox } | null {
  return followReadingLine(scrollNode, view, null);
}
