export type NeuralKind = "fixation" | "saccade" | "regression" | "skip" | "disengage";

export interface NeuralEvent {
  kind: NeuralKind;
  at: number;
  line: number;
  fromLine?: number;
  ms: number;
}

export type PassiveState = "gathering" | "engaged" | "parked" | "skimming" | "wandering";

export interface PassiveReading {
  state: PassiveState;
  label: string;
  live: string;
  body: string;
  confidence: number;
}

export interface ScanPoint {
  x: number;
  y: number;
  r: number;
  kind: NeuralKind;
}

export interface NeuralSummary {
  fixations: number;
  saccades: number;
  regressions: number;
  skips: number;
  disengages: number;
  fixationMs: number;
  longFixations: number;
  meanFixationMs: number;
}

export const NEURAL_THRESHOLDS = {
  minFixationMs: 400,
  longFixationMs: 1_500,
  parkedMs: 10_000,
  windowMs: 24_000,
  skipLines: 3,
  fastFixationMs: 280,
} as const;

export const PASSIVE_META: Record<
  PassiveState,
  { label: string; live: string; body: string }
> = {
  gathering: {
    label: "Watching",
    live: "Watching how you read.",
    body: "A few more lines in the reading band and the sitting will have a shape.",
  },
  engaged: {
    label: "Reading",
    live: "Holding the line.",
    body: "Successive lines are being held, then a small forward move. That is the usual reading rhythm.",
  },
  parked: {
    label: "Waiting",
    live: "The page is waiting.",
    body: "The page is open, but the line is not being taken. That is not a score.",
  },
  skimming: {
    label: "Skimming",
    live: "Jumping ahead.",
    body: "The eyes are moving in jumps. Little time is landing on the line.",
  },
  wandering: {
    label: "Drifting",
    live: "The rhythm broke.",
    body: "The eyes still moved, but the holds and jumps no longer match a fluent pass.",
  },
};

export function classifyMove(fromLine: number, toLine: number, fromDwellMs: number): NeuralKind {
  const delta = toLine - fromLine;
  if (delta === 0) return "saccade";
  if (delta < 0) return "regression";
  if (delta >= NEURAL_THRESHOLDS.skipLines) return "skip";
  if (fromDwellMs > 0 && fromDwellMs < NEURAL_THRESHOLDS.fastFixationMs) return "skip";
  return "saccade";
}

export function summarizeNeural(events: NeuralEvent[]): NeuralSummary {
  const summary: NeuralSummary = {
    fixations: 0,
    saccades: 0,
    regressions: 0,
    skips: 0,
    disengages: 0,
    fixationMs: 0,
    longFixations: 0,
    meanFixationMs: 0,
  };
  for (const event of events) {
    if (event.kind === "fixation") {
      summary.fixations += 1;
      summary.fixationMs += Math.max(0, event.ms);
      if (event.ms >= NEURAL_THRESHOLDS.longFixationMs) summary.longFixations += 1;
    } else if (event.kind === "saccade") summary.saccades += 1;
    else if (event.kind === "regression") summary.regressions += 1;
    else if (event.kind === "skip") summary.skips += 1;
    else if (event.kind === "disengage") summary.disengages += 1;
  }
  summary.meanFixationMs = summary.fixations > 0 ? summary.fixationMs / summary.fixations : 0;
  return summary;
}

export function detectPassiveState(events: NeuralEvent[], now: number): PassiveReading {
  const recent = events.filter((event) => now - event.at <= NEURAL_THRESHOLDS.windowMs);
  const summary = summarizeNeural(recent);
  const last = events[events.length - 1];
  const since = last ? Math.max(0, now - last.at) : Number.POSITIVE_INFINITY;
  const signal = summary.fixations + summary.saccades + summary.skips + summary.regressions;

  if (events.length < 2 || signal < 2) {
    const parkedEarly = since >= NEURAL_THRESHOLDS.parkedMs && events.length > 0;
    const state: PassiveState = parkedEarly ? "parked" : "gathering";
    return readingFor(state, state === "parked" ? 0.55 : 0);
  }

  if (
    (since >= NEURAL_THRESHOLDS.parkedMs && summary.saccades === 0 && summary.skips === 0) ||
    (last?.kind === "disengage" && since >= 4_000)
  ) {
    return readingFor("parked", Math.min(1, since / 16_000));
  }

  const skim =
    summary.skips >= 2 &&
    summary.skips >= summary.saccades &&
    summary.meanFixationMs < 900;
  if (skim) {
    return readingFor("skimming", Math.min(1, 0.4 + summary.skips * 0.12));
  }

  const wander =
    summary.longFixations >= 2 &&
    (summary.skips >= 1 || summary.regressions >= 2) &&
    summary.saccades <= summary.longFixations;
  if (wander) {
    return readingFor("wandering", Math.min(1, 0.45 + summary.longFixations * 0.1));
  }

  if (summary.saccades >= 2 || summary.fixations >= 3) {
    return readingFor("engaged", Math.min(1, 0.4 + summary.saccades * 0.12));
  }

  if (since >= 8_000) return readingFor("parked", 0.4);
  return readingFor("gathering", 0.15);
}

function readingFor(state: PassiveState, confidence: number): PassiveReading {
  const meta = PASSIVE_META[state];
  return { state, confidence, ...meta };
}

function radiusFromMs(ms: number): number {
  const t = Math.min(1, Math.max(0, (ms - 250) / 2_200));
  return 3.4 + t * 7.2;
}

export function scanpathFromEvents(events: NeuralEvent[], lineCount = 6): ScanPoint[] {
  const points: ScanPoint[] = [];
  let y = 0;
  let x = 0.2;
  for (const event of events.slice(-18)) {
    if (event.kind === "fixation") {
      x = Math.min(0.86, Math.max(0.12, x + 0.16));
      points.push({ x, y, r: radiusFromMs(event.ms), kind: "fixation" });
      continue;
    }
    if (event.kind === "saccade") {
      y = Math.min(lineCount - 1, y + 1);
      x = 0.16 + ((y * 13) % 5) * 0.07;
      points.push({ x, y, r: 4.2, kind: "saccade" });
      continue;
    }
    if (event.kind === "skip") {
      y = Math.min(lineCount - 1, y + 2);
      x = 0.28 + (y % 3) * 0.16;
      points.push({ x, y, r: 3.6, kind: "skip" });
      continue;
    }
    if (event.kind === "regression") {
      y = Math.max(0, y - 1);
      x = Math.min(0.84, x + 0.14);
      points.push({ x, y, r: 5, kind: "regression" });
      continue;
    }
    points.push({ x, y, r: 6, kind: "disengage" });
  }
  return points;
}

export function demoScanpath(id: "flow" | "decode" | "scan" | "regress" | "wander" | "drift"): ScanPoint[] {
  if (id === "decode") {
    return [
      { x: 0.2, y: 0, r: 8.5, kind: "fixation" },
      { x: 0.52, y: 0, r: 9.4, kind: "fixation" },
      { x: 0.28, y: 1, r: 8.8, kind: "saccade" },
      { x: 0.7, y: 1, r: 10, kind: "fixation" },
      { x: 0.34, y: 2, r: 9.2, kind: "saccade" },
    ];
  }
  if (id === "scan") {
    return [
      { x: 0.16, y: 0, r: 3.6, kind: "fixation" },
      { x: 0.62, y: 1, r: 3.4, kind: "skip" },
      { x: 0.28, y: 3, r: 3.5, kind: "skip" },
      { x: 0.74, y: 4, r: 3.3, kind: "skip" },
    ];
  }
  if (id === "regress") {
    return [
      { x: 0.18, y: 0, r: 5, kind: "fixation" },
      { x: 0.48, y: 1, r: 5.2, kind: "saccade" },
      { x: 0.72, y: 2, r: 5.4, kind: "saccade" },
      { x: 0.4, y: 1, r: 6.4, kind: "regression" },
      { x: 0.22, y: 0, r: 7, kind: "regression" },
      { x: 0.58, y: 2, r: 5.2, kind: "saccade" },
    ];
  }
  if (id === "wander") {
    return [
      { x: 0.22, y: 0, r: 9, kind: "fixation" },
      { x: 0.7, y: 2, r: 3.5, kind: "skip" },
      { x: 0.3, y: 1, r: 8.6, kind: "regression" },
      { x: 0.78, y: 4, r: 3.4, kind: "skip" },
      { x: 0.42, y: 3, r: 9.5, kind: "fixation" },
    ];
  }
  if (id === "drift") {
    return [
      { x: 0.36, y: 1, r: 9, kind: "fixation" },
      { x: 0.5, y: 1, r: 6.5, kind: "disengage" },
    ];
  }
  return [
    { x: 0.16, y: 0, r: 4.8, kind: "fixation" },
    { x: 0.4, y: 0, r: 4.4, kind: "fixation" },
    { x: 0.68, y: 0, r: 5, kind: "fixation" },
    { x: 0.2, y: 1, r: 4.6, kind: "saccade" },
    { x: 0.46, y: 1, r: 4.8, kind: "fixation" },
    { x: 0.74, y: 1, r: 4.5, kind: "fixation" },
    { x: 0.22, y: 2, r: 5, kind: "saccade" },
    { x: 0.5, y: 2, r: 4.6, kind: "fixation" },
    { x: 0.78, y: 2, r: 4.8, kind: "fixation" },
    { x: 0.24, y: 3, r: 4.7, kind: "saccade" },
    { x: 0.52, y: 3, r: 4.5, kind: "fixation" },
  ];
}
