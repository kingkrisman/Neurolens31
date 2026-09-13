/** Web Speech synthesis helpers. Voices load asynchronously on some engines. */

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function preferredVoices(lang = "en"): SpeechSynthesisVoice[] {
  if (!speechSupported()) return [];
  const all = window.speechSynthesis.getVoices();
  const matched = all.filter((voice) => voice.lang.toLowerCase().startsWith(lang));
  const pool = matched.length ? matched : all;
  return [...pool].sort((a, b) => Number(b.localService) - Number(a.localService) || a.name.localeCompare(b.name));
}

export function pickVoice(lang = "en"): SpeechSynthesisVoice | null {
  return preferredVoices(lang)[0] ?? null;
}

/** Map a reading WPM target onto SpeechSynthesis rate (0.5–1.6). 220 WPM ≈ 1. */
export function rateFromWpm(wpm: number): number {
  return Math.min(1.6, Math.max(0.55, wpm / 220));
}

export function stopSpeech() {
  if (!speechSupported()) return;
  window.speechSynthesis.cancel();
}

export function pauseSpeech() {
  if (!speechSupported()) return;
  window.speechSynthesis.pause();
}

export function resumeSpeech() {
  if (!speechSupported()) return;
  window.speechSynthesis.resume();
}

export function isSpeechPaused(): boolean {
  return speechSupported() && window.speechSynthesis.paused;
}

export function speakText(
  text: string,
  {
    rate = 0.95,
    voice,
    onBoundary,
    onEnd,
    onError,
  }: {
    rate?: number;
    voice?: SpeechSynthesisVoice | null;
    onBoundary?: (charIndex: number) => void;
    onEnd?: () => void;
    onError?: () => void;
  } = {},
): SpeechSynthesisUtterance | null {
  if (!speechSupported() || !text.trim()) return null;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = rate;
  if (voice) utterance.voice = voice;
  utterance.onboundary = (event) => {
    if (event.charIndex == null) return;
    onBoundary?.(event.charIndex);
  };
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onError?.();
  window.speechSynthesis.speak(utterance);
  return utterance;
}
