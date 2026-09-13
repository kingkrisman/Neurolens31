import { bestContrastTheme, evaluateScheme } from "../contrast.ts";
import type { ReadingFeel, ThemeId } from "../types.ts";
import { leverOf, type AdaptiveMemory } from "./memory.ts";
import {
  intensity,
  measureStrain,
  quantizeStep,
  STRAIN_SCALE,
  type StrainReport,
} from "./strain.ts";

export const ADAPTIVE_THRESHOLDS = {
  pauseIdleMs: 8_000,
  pauseMinMs: 4_000,
  progressNoise: 0.008,
  rereadDrop: 0.12,
  rereadMinHighWater: 0.25,
  wpmMinElapsedMs: 8_000,
  wpmMinWords: 8,
  frequentRereadCount: 2,
  frequentPauseCount: 2,
  frequentPauseMinMs: 8_000,
  slowVsTargetRatio: 0.72,
  lineHeightStep: 0.1,
  /** Most spacing a single recommendation may add, at full strain. */
  lineHeightMaxStep: 0.3,
  lineHeightMax: 2.2,
  fontSizeStep: 1,
  /** Most type growth a single recommendation may add, at full strain. */
  fontSizeMaxStep: 3,
  fontSizeMax: 28,
  wpmStepDown: 20,
  wpmStepUp: 15,
  targetWpmMin: 120,
  targetWpmMax: 480,
} as const;

export type AdaptiveSetting = "targetWpm" | "lineHeight" | "focusHighlight" | "theme" | "fontSize";
export type AdaptiveRule =
  | "pace-strain"
  | "contrast-low"
  | "rereading"
  | "pauses"
  | "strong-performance"
  | "type-size";

export interface PauseEvent {
  startedAt: number;
  durationMs: number;
  progress: number;
}

export interface RereadEvent {
  at: number;
  from: number;
  to: number;
}

export interface ReadingMetrics {
  wordCount: number;
  wordsRead: number;
  progress: number;
  elapsedActiveMs: number;
  currentWpm: number | null;
  targetWpm: number;
  pauseCount: number;
  pauses: PauseEvent[];
  rereadCount: number;
  rereads: RereadEvent[];
  /** How the last stretch felt, or null until the reader marks it. */
  feel: ReadingFeel | null;
}

export interface AdaptiveSettings {
  targetWpm: number;
  lineHeight: number;
  focusHighlight: boolean;
  theme: ThemeId;
  fontSize: number;
}

export interface AdaptiveRecommendation {
  id: string;
  rule: AdaptiveRule;
  setting: AdaptiveSetting;
  recommendedValue: number | boolean | ThemeId;
  reason: string;
  why: string;
}

export function calcCurrentWpm(wordsRead: number, elapsedActiveMs: number): number | null {
  if (wordsRead < ADAPTIVE_THRESHOLDS.wpmMinWords) return null;
  if (elapsedActiveMs < ADAPTIVE_THRESHOLDS.wpmMinElapsedMs) return null;
  const minutes = elapsedActiveMs / 60_000;
  if (minutes <= 0) return null;
  const wpm = Math.max(1, Math.round(wordsRead / minutes));
  if (wpm > ADAPTIVE_THRESHOLDS.targetWpmMax) return null;
  return wpm;
}

export function isMeaningfulProgressChange(from: number, to: number): boolean {
  return Math.abs(to - from) >= ADAPTIVE_THRESHOLDS.progressNoise;
}

export function isReread(highWater: number, next: number): boolean {
  if (highWater < ADAPTIVE_THRESHOLDS.rereadMinHighWater) return false;
  return highWater - next >= ADAPTIVE_THRESHOLDS.rereadDrop;
}

export function clampTargetWpm(value: number): number {
  return Math.min(
    ADAPTIVE_THRESHOLDS.targetWpmMax,
    Math.max(ADAPTIVE_THRESHOLDS.targetWpmMin, Math.round(value / 10) * 10),
  );
}

function clampLineHeight(value: number): number {
  return Math.min(ADAPTIVE_THRESHOLDS.lineHeightMax, Math.max(1.4, Math.round(value * 10) / 10));
}

function clampFontSize(value: number): number {
  return Math.min(ADAPTIVE_THRESHOLDS.fontSizeMax, Math.max(14, Math.round(value)));
}

function prolongedPauses(metrics: ReadingMetrics): number {
  return metrics.pauses.filter((pause) => pause.durationMs >= ADAPTIVE_THRESHOLDS.frequentPauseMinMs).length;
}

/**
 * Relative standing of the levers when several could fire at once.
 *
 * Contrast leads because it is the cheapest change to undo and the one most
 * likely to be the actual cause — a page that fails to separate ink from paper
 * makes every other setting look inadequate. Type size trails spacing because
 * it reflows more of the page for the same benefit.
 */
const LEVER_PRIORITY: Record<AdaptiveRule, number> = {
  "contrast-low": 1.3,
  rereading: 1,
  pauses: 1,
  "type-size": 0.9,
  "pace-strain": 1,
  "strong-performance": 1,
};

interface Candidate {
  score: number;
  recommendation: AdaptiveRecommendation;
}

/** Build a scored candidate, or nothing if the lever cannot move. */
function candidate(
  rule: AdaptiveRule,
  strain: number,
  memory: AdaptiveMemory | undefined,
  recommendation: AdaptiveRecommendation | null,
): Candidate | null {
  if (!recommendation) return null;
  const trust = leverOf(memory, rule).trust;
  return { score: strain * trust * LEVER_PRIORITY[rule], recommendation };
}

export function measureReadingStrain(metrics: ReadingMetrics): StrainReport {
  return measureStrain({
    rereadCount: metrics.rereadCount,
    longPauseCount: prolongedPauses(metrics),
    wordsRead: metrics.wordsRead,
    activeMs: metrics.elapsedActiveMs,
    currentWpm: metrics.currentWpm,
    targetWpm: metrics.targetWpm,
  });
}

/**
 * Pure adaptive engine. Never mutates settings.
 *
 * Two kinds of signal drive it, and they are treated differently on purpose.
 * An explicit "this felt too fast" is an instruction, so it is honoured
 * directly and at full step. Everything else is inference from behaviour, so it
 * is scored: strain (how strong the evidence is, normalised by how much reading
 * produced it) times trust (whether this lever has helped *this* reader before)
 * times a fixed priority. The strongest candidate wins rather than whichever
 * rule happened to sit earliest in the function.
 */
export function recommendAdaptations(
  metrics: ReadingMetrics,
  settings: AdaptiveSettings,
  dismissedRules: Iterable<AdaptiveRule> = [],
  lockedSettings: Iterable<string> = [],
  memory?: AdaptiveMemory,
): AdaptiveRecommendation | null {
  const dismissed = new Set(dismissedRules);
  const locked = new Set(lockedSettings);
  const strain = measureReadingStrain(metrics);

  if (metrics.feel === "slow" && !dismissed.has("pace-strain") && !locked.has("targetWpm")) {
    const next = clampTargetWpm(settings.targetWpm - ADAPTIVE_THRESHOLDS.wpmStepDown);
    if (next < settings.targetWpm) {
      return {
        id: "pace-strain:targetWpm",
        rule: "pace-strain",
        setting: "targetWpm",
        recommendedValue: next,
        reason: "NeuroLens recommends slowing your target pace so this passage is easier to follow.",
        why: "You marked this stretch as too fast. A slightly slower target gives the words more room to land.",
      };
    }
  }

  // Behavioural levers. Each is offered with the weight of its own evidence and
  // the engine takes the strongest, so ordering here carries no meaning.
  const candidates: Candidate[] = [];
  const rereadLevel = intensity(strain.reread, STRAIN_SCALE.actionFloor);
  const pauseLevel = intensity(strain.pause, STRAIN_SCALE.actionFloor);

  if (!dismissed.has("contrast-low") && !locked.has("theme")) {
    const report = evaluateScheme(settings.theme, settings.fontSize);
    const better = bestContrastTheme(settings.theme);
    const failsAa = report.bodyLevel === "fail";
    const canStepUp = better !== settings.theme;
    // A WCAG failure is a fact about the page, not an inference about the
    // reader, so it enters at full weight however little evidence there is.
    const weight = failsAa ? 1 : Math.max(strain.reread, strain.pause, strain.pace);
    if (canStepUp && (failsAa || weight > STRAIN_SCALE.actionFloor)) {
      const label = better === "ink" ? "Ink" : "Contrast";
      candidates.push(
        candidate("contrast-low", weight, memory, {
          id: `contrast-low:${better}`,
          rule: "contrast-low",
          setting: "theme",
          recommendedValue: better,
          reason: `NeuroLens recommends the ${label} scheme so the line is easier to hold.`,
          why: failsAa
            ? `This page is under the WCAG AA contrast bar at ${settings.fontSize}px. ${label} keeps your light or dark room and raises the ink-to-paper ratio.`
            : `Rereads, pauses, or a rushed feel often mean the page is working too hard. ${label} raises contrast without leaving the palette you already chose.`,
        })!,
      );
    }
  }

  if (rereadLevel > 0 && !dismissed.has("rereading") && !locked.has("lineHeight")) {
    const step = quantizeStep(ADAPTIVE_THRESHOLDS.lineHeightMaxStep, rereadLevel, ADAPTIVE_THRESHOLDS.lineHeightStep);
    const next = clampLineHeight(settings.lineHeight + step);
    if (next > settings.lineHeight) {
      const found = candidate("rereading", strain.reread, memory, {
        id: "rereading:lineHeight",
        rule: "rereading",
        setting: "lineHeight",
        recommendedValue: next,
        reason: "Your reading pattern suggests slightly more spacing may improve visual clarity.",
        why: "You moved back through the page several times. Extra line spacing can make it easier to keep your place.",
      });
      if (found) candidates.push(found);
    }
  }

  if (rereadLevel > 0 && !dismissed.has("type-size") && !locked.has("fontSize")) {
    const step = quantizeStep(ADAPTIVE_THRESHOLDS.fontSizeMaxStep, rereadLevel, ADAPTIVE_THRESHOLDS.fontSizeStep);
    const next = clampFontSize(settings.fontSize + step);
    // Only worth raising size once spacing has run out; otherwise spacing is
    // the gentler fix for the same complaint.
    const spacingExhausted =
      settings.lineHeight >= ADAPTIVE_THRESHOLDS.lineHeightMax - 0.05 || locked.has("lineHeight");
    if (next > settings.fontSize && spacingExhausted) {
      const found = candidate("type-size", strain.reread, memory, {
        id: "type-size:fontSize",
        rule: "type-size",
        setting: "fontSize",
        recommendedValue: next,
        reason: "NeuroLens recommends a slightly larger type size after repeated rereads.",
        why: "Line spacing is already open. A little more size can reduce crowding on the next pass.",
      });
      if (found) candidates.push(found);
    }
  }

  if (pauseLevel > 0 && !dismissed.has("pauses") && !locked.has("fontSize")) {
    const step = quantizeStep(ADAPTIVE_THRESHOLDS.fontSizeMaxStep, pauseLevel, ADAPTIVE_THRESHOLDS.fontSizeStep);
    const next = clampFontSize(settings.fontSize + step);
    if (next > settings.fontSize) {
      const found = candidate("pauses", strain.pause, memory, {
        id: "pauses:fontSize",
        rule: "pauses",
        setting: "fontSize",
        recommendedValue: next,
        reason: "NeuroLens recommends a slightly larger type after long pauses.",
        why: "Reading stopped for longer stretches. A little more size makes the next word easier to pick up.",
      });
      if (found) candidates.push(found);
    }
  }

  if (candidates.length) {
    return candidates.reduce((best, item) => (item.score > best.score ? item : best)).recommendation;
  }

  const comfortable =
    metrics.feel === "fast" ||
    (metrics.feel === "right" &&
      metrics.currentWpm != null &&
      metrics.currentWpm < settings.targetWpm * ADAPTIVE_THRESHOLDS.slowVsTargetRatio);
  if (
    comfortable &&
    metrics.rereadCount < ADAPTIVE_THRESHOLDS.frequentRereadCount &&
    !dismissed.has("strong-performance") &&
    !locked.has("targetWpm")
  ) {
    const next = clampTargetWpm(settings.targetWpm + ADAPTIVE_THRESHOLDS.wpmStepUp);
    if (next > settings.targetWpm) {
      return {
        id: "strong-performance:targetWpm",
        rule: "strong-performance",
        setting: "targetWpm",
        recommendedValue: next,
        reason: "You’re reading comfortably, so NeuroLens recommends a small speed increase.",
        why:
          metrics.feel === "fast"
            ? "You marked this page as too slow. A slightly higher target matches the pace you already hold."
            : "Your actual pace is well below the target you set, and the page still felt right.",
      };
    }
  }

  return null;
}
