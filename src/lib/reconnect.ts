import { splitSentences } from "./sentences.ts";
import type { PauseEvent, RereadEvent } from "./adaptive/engine.ts";

export type ReconnectLevel = 0 | 1 | 2 | 3;
export type ReconnectReason = "pause" | "skip" | "reread" | "switch" | "dwell";

export interface SkipEvent {
  at: number;
  from: number;
  to: number;
  durationMs: number;
}

export interface ReconnectSignal {
  progress: number;
  elapsedActiveMs: number;
  pauses: PauseEvent[];
  rereads: RereadEvent[];
  skips?: SkipEvent[];
  now: number;
  startedAt: number | null;
  autoScrolling?: boolean;
  idleMs?: number;
}

export interface ReconnectNudge {
  level: ReconnectLevel;
  reason: ReconnectReason;
  prompt: string;
}

export interface ReconnectRecap {
  recap: string;
  idea: string;
  next: string;
  resumeAt: number;
}

export const RECONNECT_COPY: Record<Exclude<ReconnectLevel, 0>, string> = {
  1: "Still with this page?",
  2: "Here’s what you just covered.",
  3: "This stretch may not have registered. A short recap can catch you up.",
};

export const RECONNECT_DISMISS_KEY = "neurolens-reconnect-dismiss";
export const RECONNECT_COOLDOWN_MS = 150_000;

const WINDOW_MS = 90_000;
const SKIP_WINDOW_MS = 45_000;

export function detectDisengagement(signal: ReconnectSignal): ReconnectNudge | null {
  if (signal.autoScrolling) return null;
  const sitting = signal.startedAt != null ? signal.now - signal.startedAt : signal.elapsedActiveMs;
  if (signal.progress < 0.14 || sitting < 14_000) return null;

  const pauses = signal.pauses.filter((pause) => signal.now - pause.startedAt <= WINDOW_MS);
  const rereads = signal.rereads.filter((item) => signal.now - item.at <= WINDOW_MS);
  const skips = (signal.skips ?? []).filter(
    (item) => signal.now - item.at <= SKIP_WINDOW_MS && item.to - item.from >= 0.16,
  );
  const livePause = (signal.idleMs ?? 0) >= 10_000;
  const longPauses = pauses.filter((pause) => pause.durationMs >= 10_000).length + (livePause ? 1 : 0);
  const clustered = rereads.filter((item) => Math.abs(item.from - item.to) <= 0.22);
  const switching = rereads.length >= 2 && skips.length >= 1;

  let level: ReconnectLevel = 0;
  let reason: ReconnectReason = "pause";

  if (switching || (skips.length >= 1 && longPauses >= 1) || clustered.length >= 3) {
    level = 3;
    reason = switching ? "switch" : skips.length ? "skip" : "reread";
  } else if (skips.length >= 1 || rereads.length >= 2 || longPauses >= 2) {
    level = 2;
    reason = skips.length ? "skip" : rereads.length >= 2 ? "reread" : "dwell";
  } else if (longPauses >= 1 || rereads.length >= 1) {
    level = 1;
    reason = rereads.length ? "reread" : "pause";
  }

  if (!level) return null;
  return { level, reason, prompt: RECONNECT_COPY[level] };
}

export function isSkipJump(from: number, to: number, durationMs: number): boolean {
  const delta = to - from;
  if (delta < 0.16 || durationMs < 0) return false;
  if (delta >= 0.28) return durationMs <= 4_000;
  return durationMs <= 1_600;
}

export function reconnectDismissed(now = Date.now()): boolean {
  try {
    return Number(sessionStorage.getItem(RECONNECT_DISMISS_KEY) || 0) > now;
  } catch {
    return false;
  }
}

export function dismissReconnect(now = Date.now()) {
  try {
    sessionStorage.setItem(RECONNECT_DISMISS_KEY, String(now + RECONNECT_COOLDOWN_MS));
  } catch {
    /* private mode */
  }
}

export function recapCacheKey(text: string, progress: number): string {
  return `${text.trim().slice(0, 48)}:${Math.round(progress * 20) / 20}`;
}

function clip(sentence: string, max = 180): string {
  const trimmed = sentence.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trim()}…`;
}

function pickIdea(sentences: string[]): string {
  const ranked = [...sentences].sort((a, b) => a.length - b.length);
  return clip(ranked.find((item) => item.length >= 36) ?? ranked[0] ?? "The last stretch of the page.");
}

export function buildLocalRecap(text: string, progress: number): ReconnectRecap {
  const sentences = splitSentences(text).filter((sentence) => sentence.split(/\s+/).length >= 5);
  if (!sentences.length) {
    return {
      recap: "You’re still at the start of this page.",
      idea: "Nothing solid to recap yet.",
      next: "Read a little further, then reconnect.",
      resumeAt: 0,
    };
  }

  const at = Math.min(1, Math.max(0, progress));
  const idx = Math.min(sentences.length - 1, Math.max(0, Math.round(at * (sentences.length - 1))));
  const from = Math.max(0, idx - 3);
  const covered = sentences.slice(from, idx + 1);
  const upcoming = sentences.slice(idx + 1, idx + 3);
  const recapSource = covered.slice(-2);
  return {
    recap: recapSource.map((item) => clip(item, 160)).join(" "),
    idea: pickIdea(covered),
    next: upcoming[0] ? clip(upcoming[0], 160) : "You’re at the end of this page.",
    resumeAt: sentences.length <= 1 ? 0 : from / (sentences.length - 1),
  };
}

export function windowForModel(text: string, progress: number): { covered: string; next: string } {
  const recap = buildLocalRecap(text, progress);
  const sentences = splitSentences(text);
  const at = Math.min(1, Math.max(0, progress));
  const idx = Math.min(sentences.length - 1, Math.max(0, Math.round(at * Math.max(sentences.length - 1, 1))));
  const covered = sentences.slice(Math.max(0, idx - 6), idx + 1).join(" ").slice(-1200);
  const next = sentences.slice(idx + 1, idx + 4).join(" ").slice(0, 500);
  return { covered: covered || recap.recap, next: next || recap.next };
}
