export const SOUND_KEY = "neurolens-opening-sound";

export function openingSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(SOUND_KEY) !== "off";
}

export function setOpeningSoundEnabled(on: boolean) {
  window.localStorage.setItem(SOUND_KEY, on ? "on" : "off");
}

function tone(
  ctx: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  type: OscillatorType,
  peak: number,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1400, start);
  filter.frequency.exponentialRampToValueAtTime(420, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0001), start + 0.07);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

/** Warm fifth. Call only after a user gesture so the browser allows audio. */
export async function playOpeningSting(): Promise<void> {
  if (!openingSoundEnabled()) return;
  const Ctor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  const ctx = new Ctor();
  try {
    if (ctx.state === "suspended") {
      await Promise.race([ctx.resume(), new Promise((resolve) => window.setTimeout(resolve, 80))]);
    }
    if (ctx.state === "suspended") {
      void ctx.close();
      return;
    }
    const now = ctx.currentTime;
    tone(ctx, 98, now, 1.4, "sine", 0.14);
    tone(ctx, 147, now + 0.08, 1.3, "sine", 0.1);
    tone(ctx, 196, now + 0.22, 1.05, "triangle", 0.06);
    tone(ctx, 392, now + 0.42, 0.8, "sine", 0.04);
    window.setTimeout(() => void ctx.close(), 1600);
  } catch {
    void ctx.close();
  }
}
