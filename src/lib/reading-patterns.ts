import type { PauseEvent, RereadEvent } from "./adaptive/engine.ts";
import type { SkipEvent } from "./reconnect.ts";
import {
  detectPassiveState,
  summarizeNeural,
  type NeuralEvent,
  type PassiveState,
} from "./neural.ts";

export type ReadingPatternId = "flow" | "decode" | "scan" | "regress" | "wander" | "drift";

export interface PatternSample {
  progress: number;
  elapsedActiveMs: number;
  currentWpm: number | null;
  targetWpm: number;
  pauses: PauseEvent[];
  rereads: RereadEvent[];
  skips: SkipEvent[];
  dwellCount: number;
  dwellMs: number;
  longDwellCount: number;
  forwardSteps: number;
  idleMs: number;
  speaking?: boolean;
  neuralEvents?: NeuralEvent[];
}

export interface PatternShare {
  id: ReadingPatternId;
  label: string;
  share: number;
  weight: number;
}

export interface PatternReading {
  id: ReadingPatternId;
  label: string;
  science: string;
  body: string;
  live: string;
  confidence: number;
  gathering: boolean;
  mix: PatternShare[];
  passive: PassiveState;
}

export const PATTERN_META: Record<
  ReadingPatternId,
  { label: string; science: string; body: string; live: string; bar: number; detector: string; help: string }
> = {
  flow: {
    label: "On the line",
    science: "Fixation + forward saccade",
    body: "Time on successive lines, then a small forward move. That is the usual reading rhythm.",
    live: "Holding the line.",
    bar: 0.88,
    detector: "A line held in the reading band, then the next line. No click required.",
    help: "This is the sitting to keep. Leave the page as it is.",
  },
  decode: {
    label: "Slow decoding",
    science: "Longer fixations",
    body: "Each line is held longer than a fluent pass. Extra space or plain words can cheapen the next one.",
    live: "Taking more time on each line.",
    bar: 0.62,
    detector: "Holds over about a second and a half, with few jumps.",
    help: "Plain words, more spacing, or a quieter typeface make the next fixation cheaper.",
  },
  scan: {
    label: "Skimming",
    science: "Long saccades, short fixations",
    body: "The page moved in jumps. Little time landed on the line.",
    live: "Jumping ahead.",
    bar: 0.42,
    detector: "Three or more lines skipped, or a jump with almost no time to land.",
    help: "Word highlight keeps the next pass from skipping.",
  },
  regress: {
    label: "Rereading",
    science: "Regressive saccades",
    body: "You moved back through a stretch you had already passed. That is how a miss gets repaired.",
    live: "Going back over a stretch.",
    bar: 0.28,
    detector: "The foveal line stepped backward, or the page dropped past a stretch already read.",
    help: "A little more line spacing can make it easier to keep your place.",
  },
  wander: {
    label: "Mind wandering",
    science: "Decoupled eye movements",
    body: "The eyes still moved, but the rhythm was uneven — long holds mixed with jumps. That is a common signature of mindless reading.",
    live: "The rhythm broke.",
    bar: 0.2,
    detector: "Long holds and skips in the same window, without a clean forward run.",
    help: "A recap, or word highlight, can catch the last stretch you drifted through.",
  },
  drift: {
    label: "Away",
    science: "Disengagement",
    body: "The page stayed open, but the line was not held. That is not a score.",
    live: "The page is waiting.",
    bar: 0.12,
    detector: "No new fixation or saccade for about ten seconds. The page is parked.",
    help: "When you come back, Insights will still have the last pattern. Nothing is lost.",
  },
};

export const PATTERN_ORDER: ReadingPatternId[] = ["flow", "decode", "scan", "regress", "wander", "drift"];

const GATHER_MS = 8_000;

export function isForwardStep(from: number, to: number, durationMs: number): boolean {
  const delta = to - from;
  if (delta < 0.008 || delta >= 0.14) return false;
  if (durationMs < 350 || durationMs > 10_000) return false;
  return true;
}

function clampShare(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value);
}

export function classifyReading(sample: PatternSample): PatternReading {
  const elapsed = Math.max(0, sample.elapsedActiveMs);
  const events = sample.neuralEvents ?? [];
  const neural = summarizeNeural(events);
  const now = Date.now();
  const passive = detectPassiveState(events, now);
  const gathering =
    elapsed < GATHER_MS &&
    sample.dwellCount < 2 &&
    sample.skips.length < 1 &&
    sample.rereads.length < 1 &&
    events.length < 2;

  const slow =
    sample.currentWpm != null && sample.currentWpm < sample.targetWpm * 0.72 && sample.currentWpm > 40;
  const skipN = Math.max(sample.skips.length, neural.skips);
  const rereadN = Math.max(sample.rereads.length, neural.regressions);
  const dwellN = Math.max(sample.dwellCount, neural.fixations);
  const longN = Math.max(sample.longDwellCount, neural.longFixations);
  const forwardN = Math.max(sample.forwardSteps, neural.saccades);
  const idleRatio = elapsed > 0 ? Math.min(1, sample.idleMs / elapsed) : sample.idleMs > 8_000 ? 1 : 0;
  const meanDwell = dwellN > 0 ? Math.max(sample.dwellMs, neural.fixationMs) / dwellN : neural.meanFixationMs;

  const raw: Record<ReadingPatternId, number> = {
    flow: forwardN * 2 + Math.max(0, dwellN - longN) * 2 + (sample.speaking ? 1 : 0) + (passive.state === "engaged" ? 4 : 0),
    decode: longN * 3 + (slow ? 4 : 0) + (meanDwell >= 1_600 ? 2 : 0),
    scan: skipN * 5 + (dwellN === 0 && sample.progress >= 0.2 ? 3 : 0) + (passive.state === "skimming" ? 4 : 0),
    regress: rereadN * 5 + (rereadN >= 2 && skipN === 0 ? 2 : 0),
    wander:
      (passive.state === "wandering" ? 8 : 0) +
      (longN >= 2 && skipN >= 1 ? 5 : 0) +
      (longN >= 2 && rereadN >= 2 && forwardN <= longN ? 3 : 0),
    drift:
      (idleRatio >= 0.35 ? 6 : 0) +
      (sample.idleMs >= 10_000 ? 4 : 0) +
      (passive.state === "parked" ? 5 : 0) +
      (dwellN === 0 && skipN === 0 && forwardN === 0 && sample.progress < 0.12 && elapsed >= GATHER_MS ? 3 : 0),
  };

  const total = PATTERN_ORDER.reduce((sum, id) => sum + raw[id], 0);
  const fallback: ReadingPatternId =
    sample.progress >= 0.08 || dwellN > 0 || forwardN > 0 ? "flow" : "drift";
  const id =
    (PATTERN_ORDER.reduce<ReadingPatternId | null>((best, next) => {
      if (!best || raw[next] > raw[best]) return next;
      return best;
    }, null) ?? fallback) || fallback;
  const chosen = total > 0 && raw[id] > 0 ? id : fallback;

  const mix: PatternShare[] = PATTERN_ORDER.map((key) => {
    const share = total > 0 ? clampShare((raw[key] / total) * 100) : key === chosen ? 100 : 0;
    return {
      id: key,
      label: PATTERN_META[key].label,
      share,
      weight: PATTERN_META[key].bar,
    };
  }).filter((item) => item.share > 0);

  const mixTotal = mix.reduce((sum, item) => sum + item.share, 0);
  if (mix.length && mixTotal !== 100) {
    const head = mix[0];
    if (head) head.share += 100 - mixTotal;
  }

  const meta = PATTERN_META[chosen];
  const peak = total > 0 ? raw[chosen] / total : 0;
  const passiveState = gathering ? "gathering" : passive.state;

  return {
    id: chosen,
    label: gathering ? "Gathering" : meta.label,
    science: meta.science,
    body: gathering ? "Still watching how this sitting moves through the page." : meta.body,
    live: gathering ? "Watching how you read." : meta.live,
    confidence: gathering ? 0 : Math.max(0.2, Math.min(1, peak)),
    gathering,
    mix: gathering ? [] : mix,
    passive: passiveState,
  };
}
