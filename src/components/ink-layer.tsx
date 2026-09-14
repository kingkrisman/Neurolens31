import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type AnchorRect,
  type InkStroke,
  inkColorById,
  pathFrom,
  simplify,
  strokeHit,
  toLineSpace,
  toolById,
  toScreenSpace,
} from "@/lib/ink";
import { cn } from "@/lib/utils";

/**
 * The drawing surface over the page.
 *
 * Two SVGs, not one, because ink has to sit on both sides of the text: a marker
 * wash belongs *behind* the words, the way a real highlighter does, and pen and
 * pencil belong in front. One layer could only ever be on one side.
 *
 * The surface spans the whole scrolling column rather than the viewport, so a
 * stroke drawn at the bottom of a long page stays where it was drawn instead of
 * riding the scroll.
 *
 * Who may draw:
 *
 *  - a stylus, always. A pen touching the page means drawing, the way it does
 *    on paper, and requiring a mode toggle first is the thing that makes tablet
 *    annotation feel like software rather than like a page.
 *  - a mouse or finger, only while ink mode is on. The same drag otherwise
 *    means selecting text, and both readings are reasonable, so only an
 *    explicit mode can settle it. This is also what keeps one-finger scrolling
 *    working on a phone while the toolbar is open.
 */
export function InkLayer({
  strokes,
  section,
  tool,
  color,
  inkMode,
  containerRef,
  layoutKey,
  onCommit,
  onErase,
}: {
  strokes: InkStroke[];
  section: number;
  tool: string;
  color: string;
  inkMode: boolean;
  /** The scrolling element the ink is drawn over and measured against. */
  containerRef: React.RefObject<HTMLElement | null>;
  /**
   * Everything that changes where the words sit.
   *
   * Ink is positioned from live line boxes, so it has to re-measure whenever
   * the type does. A ResizeObserver alone cannot carry this: the anchors are
   * `<span>`s, and ResizeObserver does not report size changes for inline
   * boxes — which is why the drawing sat still while the text moved out from
   * under it. The reader passes the same inputs the highlight painter watches.
   */
  layoutKey: string;
  onCommit: (stroke: { lineIdx: number; points: number[] }) => void;
  onErase: (ids: string[]) => void;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState<number[] | null>(null);
  const liveAnchor = useRef<{ lineIdx: number; rect: AnchorRect } | null>(null);
  const erased = useRef<Set<string>>(new Set());
  /** Bumped whenever the layout moves, to re-measure every anchor. */
  const [layout, setLayout] = useState(0);

  const active = toolById(tool);
  const erasing = active.id === "eraser";

  /**
   * Re-measure on anything that moves the text.
   *
   * Ink is positioned from live line boxes, so a font change, a resize, or a
   * re-render has to repaint it — otherwise the drawing stays where the words
   * used to be.
   */
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const bump = () => setLayout((n) => n + 1);
    const observer = new ResizeObserver(bump);
    observer.observe(node);
    // The article, not the lines: a reflow changes this block's height, and
    // unlike the inline lines it is a box ResizeObserver actually reports on.
    const article = surfaceRef.current?.parentElement;
    if (article) observer.observe(article);
    window.addEventListener("resize", bump);
    // One pass after mount, once fonts have settled and the lines have boxes.
    const raf = requestAnimationFrame(bump);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", bump);
      cancelAnimationFrame(raf);
    };
  }, [containerRef, strokes.length]);

  /**
   * Re-measure when the type changes.
   *
   * Two frames, not one: the first lands before the browser has re-laid the
   * text out, and measuring then reads the boxes the words are leaving.
   */
  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setLayout((n) => n + 1));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [layoutKey]);

  /** A line's box in the surface's coordinate space. */
  const rectFor = useCallback(
    (lineIdx: number): AnchorRect | null => {
      const surface = surfaceRef.current;
      const node = containerRef.current;
      if (!surface || !node) return null;
      const line = node.querySelector(`#line-${lineIdx}`);
      if (!line) return null;
      const box = line.getBoundingClientRect();
      const origin = surface.getBoundingClientRect();
      if (!box.width) return null;
      return { left: box.left - origin.left, top: box.top - origin.top, width: box.width };
    },
    [containerRef],
  );

  /** The line nearest a point, which the stroke will be pinned to. */
  const anchorAt = useCallback(
    (x: number, y: number): { lineIdx: number; rect: AnchorRect } | null => {
      const surface = surfaceRef.current;
      const node = containerRef.current;
      if (!surface || !node) return null;
      const origin = surface.getBoundingClientRect();
      let best: { lineIdx: number; rect: AnchorRect; distance: number } | null = null;

      for (const line of node.querySelectorAll(".reading-line")) {
        const id = Number(line.id.replace("line-", ""));
        if (!Number.isFinite(id)) continue;
        const box = line.getBoundingClientRect();
        if (!box.width) continue;
        const rect = { left: box.left - origin.left, top: box.top - origin.top, width: box.width };
        // Vertical distance to the line's band: a stroke belongs to the line it
        // is level with, not to whichever line's centre happens to be closest.
        const above = rect.top - y;
        const below = y - (rect.top + box.height);
        const distance = Math.max(0, above, below);
        if (!best || distance < best.distance) best = { lineIdx: id, rect, distance };
        if (distance === 0) break;
      }
      return best ? { lineIdx: best.lineIdx, rect: best.rect } : null;
    },
    [containerRef],
  );

  /** Stored strokes for this section, resolved to screen coordinates. */
  const painted = useMemo(() => {
    void layout;
    const out: Array<{ stroke: InkStroke; d: string; rect: AnchorRect }> = [];
    for (const stroke of strokes) {
      if (stroke.section !== section) continue;
      const rect = rectFor(stroke.lineIdx);
      if (!rect) continue;
      const screen: number[] = [];
      for (let i = 0; i < stroke.points.length; i += 2) {
        const [x, y] = toScreenSpace(stroke.points[i]!, stroke.points[i + 1]!, rect);
        screen.push(x, y);
      }
      out.push({ stroke, d: pathFrom(screen), rect });
    }
    return out;
  }, [strokes, section, rectFor, layout]);

  const mayDraw = useCallback(
    (event: React.PointerEvent) => event.pointerType === "pen" || inkMode,
    [inkMode],
  );

  const pointIn = (event: React.PointerEvent): [number, number] | null => {
    const surface = surfaceRef.current;
    if (!surface) return null;
    const box = surface.getBoundingClientRect();
    return [event.clientX - box.left, event.clientY - box.top];
  };

  function onPointerDown(event: React.PointerEvent) {
    if (!mayDraw(event)) return;
    const point = pointIn(event);
    if (!point) return;
    event.preventDefault();
    (event.target as Element).setPointerCapture?.(event.pointerId);

    if (erasing) {
      erased.current = new Set();
      eraseAt(point[0], point[1]);
      return;
    }
    const anchor = anchorAt(point[0], point[1]);
    if (!anchor) return;
    liveAnchor.current = anchor;
    setLive(point);
  }

  function eraseAt(x: number, y: number) {
    const surface = surfaceRef.current;
    if (!surface) return;
    const radius = active.width * (surface.clientWidth || 1) * 0.5 + 6;
    const hits: string[] = [];
    for (const item of painted) {
      if (erased.current.has(item.stroke.id)) continue;
      const screen: number[] = [];
      for (let i = 0; i < item.stroke.points.length; i += 2) {
        const [px, py] = toScreenSpace(item.stroke.points[i]!, item.stroke.points[i + 1]!, item.rect);
        screen.push(px, py);
      }
      if (strokeHit(screen, x, y, radius)) {
        erased.current.add(item.stroke.id);
        hits.push(item.stroke.id);
      }
    }
    if (hits.length) onErase(hits);
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!mayDraw(event)) return;
    const point = pointIn(event);
    if (!point) return;

    if (erasing) {
      if (event.buttons === 0) return;
      event.preventDefault();
      eraseAt(point[0], point[1]);
      return;
    }
    if (!live) return;
    event.preventDefault();
    // Coalesced events give every sample the device captured between frames,
    // which is what makes a fast stroke smooth rather than faceted.
    const events = event.nativeEvent.getCoalescedEvents?.() ?? [];
    const surface = surfaceRef.current!;
    const box = surface.getBoundingClientRect();
    const next = [...live];
    if (events.length) {
      for (const sample of events) next.push(sample.clientX - box.left, sample.clientY - box.top);
    } else {
      next.push(point[0], point[1]);
    }
    setLive(next);
  }

  function onPointerUp(event: React.PointerEvent) {
    if (erasing) {
      erased.current = new Set();
      return;
    }
    const anchor = liveAnchor.current;
    if (!live || !anchor) return;
    event.preventDefault();

    const normalised: number[] = [];
    for (let i = 0; i < live.length; i += 2) {
      const [nx, ny] = toLineSpace(live[i]!, live[i + 1]!, anchor.rect);
      normalised.push(nx, ny);
    }
    const points = simplify(normalised);
    // Two samples from a stray tap are not a drawing; committing them leaves
    // invisible specks the reader then has to hunt down with the eraser.
    if (points.length >= 4 || (points.length === 2 && live.length > 2)) {
      onCommit({ lineIdx: anchor.lineIdx, points });
    }
    setLive(null);
    liveAnchor.current = null;
  }

  const liveTool = active;
  const liveColor = inkColorById(color).hex;
  const surfaceWidth = surfaceRef.current?.clientWidth ?? 1;

  const renderStroke = (item: { stroke: InkStroke; d: string; rect: AnchorRect }) => {
    const strokeTool = toolById(item.stroke.tool);
    return (
      <path
        key={item.stroke.id}
        d={item.d}
        fill="none"
        stroke={inkColorById(item.stroke.color).hex}
        strokeWidth={Math.max(1, strokeTool.width * item.rect.width)}
        strokeOpacity={strokeTool.opacity}
        strokeLinecap={strokeTool.cap}
        strokeLinejoin="round"
      />
    );
  };

  const under = painted.filter((item) => toolById(item.stroke.tool).under);
  const over = painted.filter((item) => !toolById(item.stroke.tool).under);

  return (
    <>
      {/* Marker ink, behind the words. */}
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full overflow-visible"
        style={{ zIndex: 0 }}
      >
        {under.map(renderStroke)}
      </svg>

      {/* Pen and pencil, in front — and the surface that takes the pointer. */}
      <div
        ref={surfaceRef}
        className={cn(
          "absolute inset-0",
          // Only swallows input when someone is actually drawing; otherwise the
          // text underneath stays selectable, clickable and scrollable.
          inkMode || erasing ? "pointer-events-auto" : "pointer-events-none",
          inkMode && !erasing && "cursor-crosshair",
          erasing && inkMode && "cursor-cell",
        )}
        style={{ zIndex: 3, touchAction: inkMode ? "none" : "auto" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <svg aria-hidden className="pointer-events-none absolute inset-0 size-full overflow-visible">
          {over.map(renderStroke)}
          {live && !erasing ? (
            <path
              d={pathFrom(live)}
              fill="none"
              stroke={liveColor}
              strokeWidth={Math.max(1, liveTool.width * surfaceWidth)}
              strokeOpacity={liveTool.opacity}
              strokeLinecap={liveTool.cap}
              strokeLinejoin="round"
            />
          ) : null}
        </svg>
      </div>
    </>
  );
}
