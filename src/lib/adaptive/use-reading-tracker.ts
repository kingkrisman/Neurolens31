import { useEffect, useRef, type RefObject } from "react";
import { ADAPTIVE_THRESHOLDS, isMeaningfulProgressChange, isReread, type PauseEvent, type RereadEvent } from "./engine";
import { isSkipJump, type SkipEvent } from "@/lib/reconnect";
import { isForwardStep } from "@/lib/reading-patterns";
import type { NeuralEvent, NeuralKind } from "@/lib/neural";
import { useAppStore } from "@/lib/store";

const NEURAL_KINDS: NeuralKind[] = ["fixation", "saccade", "regression", "skip", "disengage"];

function asNeuralKind(value: unknown): NeuralKind | null {
  return typeof value === "string" && (NEURAL_KINDS as string[]).includes(value) ? (value as NeuralKind) : null;
}

/** How long after a book opens its movement is the app's, not the reader's. */
const SETTLE_MS = 1_500;

export function useReadingTracker(
  scrollRef: RefObject<HTMLDivElement | null>,
  wordTotal: number,
) {
  const reportReading = useAppStore((s) => s.reportReading);
  const tab = useAppStore((s) => s.tab);
  const text = useAppStore((s) => s.text);

  const highWater = useRef(0);
  const lastProgress = useRef(0);
  const lastMeaningfulAt = useRef(Date.now());
  const lastProgressAt = useRef(Date.now());
  const paused = useRef(false);
  const pauseStartedAt = useRef<number | null>(null);
  const activeAccumulated = useRef(0);
  const runStartedAt = useRef(Date.now());
  const pauses = useRef<PauseEvent[]>([]);
  const rereads = useRef<RereadEvent[]>([]);
  const skips = useRef<SkipEvent[]>([]);
  const dwellCount = useRef(0);
  const dwellMs = useRef(0);
  const longDwellCount = useRef(0);
  const forwardSteps = useRef(0);
  const dwelledLines = useRef(new Set<number>());
  const longLines = useRef(new Set<number>());
  const neuralEvents = useRef<NeuralEvent[]>([]);
  const lastFlush = useRef(0);
  const lastText = useRef(text);
  /**
   * When this book opened. Movement before it settles is the app placing the
   * reader, not the reader reading.
   *
   * Resuming scrolls straight to where someone stopped, and that scroll is
   * indistinguishable, at this layer, from a reader hurling themselves a third
   * of the way into the book. Recorded as a skip it both says "Jumping ahead"
   * to someone who did nothing of the sort and teaches the adaptive engine from
   * a movement the app made on their behalf. A window rather than a one-shot
   * flag because laying the text out emits scroll events of its own before the
   * restore lands, and the first of those would otherwise spend the exemption.
   */
  const openedAt = useRef(Date.now());

  useEffect(() => {
    const stored = useAppStore.getState().reading;
    if (lastText.current !== text) {
      lastText.current = text;
      openedAt.current = Date.now();
      highWater.current = 0;
      lastProgress.current = 0;
      lastMeaningfulAt.current = Date.now();
      lastProgressAt.current = Date.now();
      paused.current = false;
      pauseStartedAt.current = null;
      activeAccumulated.current = 0;
      runStartedAt.current = Date.now();
      pauses.current = [];
      rereads.current = [];
      skips.current = [];
      dwellCount.current = 0;
      dwellMs.current = 0;
      longDwellCount.current = 0;
      forwardSteps.current = 0;
      dwelledLines.current = new Set();
      longLines.current = new Set();
      neuralEvents.current = [];
      return;
    }
    highWater.current = Math.max(highWater.current, stored.progress);
    lastProgress.current = stored.progress;
    activeAccumulated.current = stored.elapsedActiveMs;
    pauses.current = stored.pauses;
    rereads.current = stored.rereads;
    skips.current = stored.skips ?? [];
    dwellCount.current = stored.dwellCount ?? 0;
    dwellMs.current = stored.dwellMs ?? 0;
    longDwellCount.current = stored.longDwellCount ?? 0;
    forwardSteps.current = stored.forwardSteps ?? 0;
    neuralEvents.current = stored.neuralEvents ?? [];
    runStartedAt.current = Date.now();
    paused.current = false;
    pauseStartedAt.current = stored.pausedAt ?? null;
    lastMeaningfulAt.current = Date.now();
    lastProgressAt.current = Date.now();
  }, [text]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || tab !== "read") return;

    function elapsedMs() {
      if (paused.current) return activeAccumulated.current;
      return activeAccumulated.current + (Date.now() - runStartedAt.current);
    }

    function beginPause(at: number) {
      if (paused.current) return;
      activeAccumulated.current = elapsedMs();
      paused.current = true;
      pauseStartedAt.current = at;
    }

    function endPause() {
      if (!paused.current) return;
      const started = pauseStartedAt.current;
      const duration = started != null ? Date.now() - started : 0;
      paused.current = false;
      pauseStartedAt.current = null;
      runStartedAt.current = Date.now();
      if (started != null && duration >= ADAPTIVE_THRESHOLDS.pauseMinMs && highWater.current >= 0.05) {
        pauses.current = [
          ...pauses.current,
          { startedAt: started, durationMs: duration, progress: lastProgress.current },
        ].slice(-24);
        return true;
      }
      return false;
    }

    function snapshot(progress: number) {
      const wordsRead = Math.round(Math.min(1, Math.max(0, progress)) * Math.max(wordTotal, 0));
      return {
        progress,
        wordCount: wordTotal,
        wordsRead,
        elapsedActiveMs: elapsedMs(),
        pauses: pauses.current,
        rereads: rereads.current,
        skips: skips.current,
        pausedAt: pauseStartedAt.current,
        dwellCount: dwellCount.current,
        dwellMs: dwellMs.current,
        longDwellCount: longDwellCount.current,
        forwardSteps: forwardSteps.current,
        neuralEvents: neuralEvents.current,
      };
    }

    function flush(force = false) {
      const now = performance.now();
      if (!force && now - lastFlush.current < 250) return;
      lastFlush.current = now;
      reportReading(snapshot(lastProgress.current));
    }

    const onScroll = () => {
      const remaining = node.scrollHeight - node.clientHeight;
      const progress = remaining > 1 ? Math.min(1, Math.max(0, node.scrollTop / remaining)) : 1;
      const previous = lastProgress.current;
      if (!isMeaningfulProgressChange(previous, progress)) {
        return;
      }

      if (Date.now() - openedAt.current < SETTLE_MS) {
        // Where the book opened, whether that is the top or a restored
        // position. Adopt it as the baseline; the reader's own movement is
        // everything measured after this point.
        lastProgress.current = progress;
        if (progress > highWater.current) highWater.current = progress;
        lastProgressAt.current = Date.now();
        lastMeaningfulAt.current = Date.now();
        endPause();
        flush(true);
        return;
      }

      const durationMs = Date.now() - lastProgressAt.current;
      lastProgressAt.current = Date.now();
      const recordedPause = endPause();
      lastProgress.current = progress;
      lastMeaningfulAt.current = Date.now();

      const autoScrolling = useAppStore.getState().autoScrolling;
      if (!autoScrolling && isSkipJump(previous, progress, durationMs)) {
        skips.current = [
          ...skips.current,
          { at: Date.now(), from: previous, to: progress, durationMs },
        ].slice(-24);
      } else if (!autoScrolling && isForwardStep(previous, progress, durationMs)) {
        forwardSteps.current += 1;
      }

      if (isReread(highWater.current, progress)) {
        rereads.current = [
          ...rereads.current,
          { at: Date.now(), from: highWater.current, to: progress },
        ].slice(-24);
        highWater.current = progress;
        flush(true);
        return;
      }

      if (progress > highWater.current) highWater.current = progress;
      const skipGrew = skips.current.length !== (useAppStore.getState().reading.skips?.length ?? 0);
      flush(recordedPause || skipGrew);
    };

    const onHand = () => {
      lastMeaningfulAt.current = Date.now();
      if (endPause()) flush(true);
    };

    const onPresence = () => {
      lastMeaningfulAt.current = Date.now();
      if (endPause()) flush(true);
    };

    const onDwell = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: number; ms?: number; long?: boolean }>).detail;
      const id = detail?.id;
      const ms = detail?.ms ?? 0;
      if (id == null || ms < 400) return;
      lastMeaningfulAt.current = Date.now();
      const recordedPause = endPause();
      if (!dwelledLines.current.has(id)) {
        dwelledLines.current.add(id);
        dwellCount.current += 1;
        dwellMs.current += ms;
      }
      if (detail?.long && !longLines.current.has(id)) {
        longLines.current.add(id);
        longDwellCount.current += 1;
      }
      flush(recordedPause || true);
    };

    const onNeural = (event: Event) => {
      const detail = (event as CustomEvent<Partial<NeuralEvent> & { kind?: string }>).detail;
      const kind = asNeuralKind(detail?.kind);
      if (!kind) return;
      const at = typeof detail.at === "number" ? detail.at : Date.now();
      const line = typeof detail.line === "number" ? detail.line : 0;
      const ms = typeof detail.ms === "number" ? detail.ms : 0;
      neuralEvents.current = [
        ...neuralEvents.current,
        {
          kind,
          at,
          line,
          fromLine: typeof detail.fromLine === "number" ? detail.fromLine : undefined,
          ms,
        },
      ].slice(-80);
      if (kind !== "disengage") {
        lastMeaningfulAt.current = Date.now();
        endPause();
      }
      flush(true);
    };

    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      onHand();
    };

    const tick = window.setInterval(() => {
      if (document.hidden) {
        beginPause(Date.now() - ADAPTIVE_THRESHOLDS.pauseIdleMs);
        flush(true);
        return;
      }
      const idle = Date.now() - lastMeaningfulAt.current;
      if (!paused.current && idle >= ADAPTIVE_THRESHOLDS.pauseIdleMs) {
        beginPause(lastMeaningfulAt.current);
        flush(true);
        return;
      }
      if (paused.current) return;
      flush();
    }, 1000);

    const onVisibility = () => {
      if (document.hidden) {
        beginPause(Date.now());
        flush(true);
      } else {
        lastMeaningfulAt.current = Date.now();
        endPause();
        flush(true);
      }
    };

    node.addEventListener("scroll", onScroll, { passive: true });
    node.addEventListener("pointerdown", onHand, { passive: true });
    node.addEventListener("nl-presence", onPresence);
    node.addEventListener("nl-dwell", onDwell as EventListener);
    node.addEventListener("nl-neural", onNeural as EventListener);
    document.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onVisibility);
    onScroll();
    return () => {
      node.removeEventListener("scroll", onScroll);
      node.removeEventListener("pointerdown", onHand);
      node.removeEventListener("nl-presence", onPresence);
      node.removeEventListener("nl-dwell", onDwell as EventListener);
      node.removeEventListener("nl-neural", onNeural as EventListener);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(tick);
    };
  }, [scrollRef, wordTotal, tab, reportReading, text]);
}
