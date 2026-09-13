import { useEffect, type RefObject } from "react";
import { classifyMove, NEURAL_THRESHOLDS } from "@/lib/neural";
import { lineBoxesOf, readingAnchorY } from "@/lib/reading-line";

const PRESENCE_MAX_MS = 12_000;
const TICK_MS = 250;
const BAND_MARGIN = "-10% 0px -55% 0px";

function lineId(node: Element): number | null {
  const raw = node.id.match(/^line-(\d+)$/);
  if (!raw) return null;
  const id = Number(raw[1]);
  return Number.isFinite(id) ? id : null;
}

/**
 * Passive reading: the line at the reading band (or under the pointer) is the
 * fovea. Holds become fixations; line changes become saccades, skips, or
 * regressions. No camera.
 */
export function useLineDwell(scrollRef: RefObject<HTMLElement | null>, replayKey: string | number) {
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") return;
    const pane: HTMLElement = node;

    const inBand = new Set<Element>();
    const credited = new Set<number>();
    const longCredited = new Set<number>();
    let pointerEl: Element | null = null;
    let currentId: number | null = null;
    let enteredAt = 0;
    let lastPresence = 0;
    let lastDisengage = 0;

    function pingPresence(now: number) {
      if (now - lastPresence < 700) return;
      lastPresence = now;
      pane.dispatchEvent(new Event("nl-presence"));
    }

    function emitDwell(id: number, ms: number, long: boolean) {
      pane.dispatchEvent(new CustomEvent("nl-dwell", { detail: { id, ms: Math.round(ms), long } }));
    }

    function emitNeural(kind: string, detail: { line: number; fromLine?: number; ms: number; at: number }) {
      pane.dispatchEvent(new CustomEvent("nl-neural", { detail: { kind, ...detail } }));
    }

    function credit(id: number, ms: number) {
      if (ms >= NEURAL_THRESHOLDS.minFixationMs && !credited.has(id)) {
        credited.add(id);
        emitDwell(id, ms, false);
        emitNeural("fixation", { line: id, ms: Math.round(ms), at: Date.now() });
      }
      if (ms >= NEURAL_THRESHOLDS.longFixationMs && !longCredited.has(id)) {
        longCredited.add(id);
        emitDwell(id, ms, true);
      }
    }

    function pickFoveal(): { id: number; el: Element } | null {
      if (pointerEl && pane.contains(pointerEl)) {
        const id = lineId(pointerEl);
        if (id != null) return { id, el: pointerEl };
      }
      const view = pane.getBoundingClientRect();
      const anchor = readingAnchorY(view.top, view.height);
      let best: { id: number; el: Element; dist: number } | null = null;
      for (const el of inBand) {
        const id = lineId(el);
        if (id == null) continue;
        for (const box of lineBoxesOf(el)) {
          const dist = Math.abs(box.top + box.height / 2 - anchor);
          if (!best || dist < best.dist) best = { id, el, dist };
        }
      }
      return best ? { id: best.id, el: best.el } : null;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) inBand.add(entry.target);
          else inBand.delete(entry.target);
        }
      },
      { root: pane, rootMargin: BAND_MARGIN, threshold: 0 },
    );

    pane.querySelectorAll(".reading-line").forEach((el) => io.observe(el));

    const tick = window.setInterval(() => {
      if (document.hidden) return;
      const now = Date.now();
      const hit = pickFoveal();
      if (!hit) {
        if (currentId != null) {
          const ms = now - enteredAt;
          credit(currentId, ms);
          if (ms >= NEURAL_THRESHOLDS.minFixationMs && now - lastDisengage > 1_200) {
            lastDisengage = now;
            emitNeural("disengage", { line: currentId, fromLine: currentId, ms: Math.round(ms), at: now });
          }
          currentId = null;
        }
        return;
      }

      if (currentId == null) {
        currentId = hit.id;
        enteredAt = now;
        return;
      }

      if (hit.id === currentId) {
        const ms = now - enteredAt;
        credit(currentId, ms);
        if (ms <= PRESENCE_MAX_MS) pingPresence(now);
        return;
      }

      const ms = now - enteredAt;
      credit(currentId, ms);
      const kind = classifyMove(currentId, hit.id, ms);
      emitNeural(kind, { line: hit.id, fromLine: currentId, ms: Math.round(ms), at: now });
      currentId = hit.id;
      enteredAt = now;
    }, TICK_MS);

    const onPointer = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const hit = (event.target as Element | null)?.closest?.(".reading-line") ?? null;
      pointerEl = hit;
      if (hit) pingPresence(Date.now());
    };
    const onLeave = () => {
      pointerEl = null;
    };

    pane.addEventListener("pointermove", onPointer, { passive: true });
    pane.addEventListener("pointerleave", onLeave);
    return () => {
      io.disconnect();
      window.clearInterval(tick);
      pane.removeEventListener("pointermove", onPointer);
      pane.removeEventListener("pointerleave", onLeave);
    };
  }, [scrollRef, replayKey]);
}
