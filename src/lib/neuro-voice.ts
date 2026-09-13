/**
 * Listening for the wake word.
 *
 * Two things are true at once here and both matter. A voice summon is genuinely
 * useful for someone whose hands are busy or whose motor control makes a small
 * target hard. And a microphone that listens continuously is the single most
 * invasive thing this app could do — every other byte it holds stays on the
 * device by design, and speech recognition in the browser does not: Chrome
 * streams audio to Google's servers to transcribe it.
 *
 * So this is off until asked for, states plainly what it does, and stops the
 * moment it is switched off. It is never enabled by default and never enabled
 * as a side effect of anything else.
 */

type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function recognitionCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function voiceSupported(): boolean {
  return recognitionCtor() !== null;
}

/** Heard as the wake word. Recognisers mangle short names, so near-misses count. */
const WAKE = /\b(neuro|nero|neural|nuro|niro|neuro lens|neurolens)\b/i;

export function isWakeWord(transcript: string): boolean {
  return WAKE.test(transcript);
}

/**
 * Listen for the wake word until stopped.
 *
 * `onend` restarts deliberately: browsers end a recognition session on their own
 * after a pause, and without a restart the feature would silently stop working
 * a minute after being switched on — which is worse than not offering it, since
 * the reader would keep believing the microphone was listening.
 */
export interface WakeHandlers {
  onWake: (transcript: string) => void;
  /**
   * Everything heard, matched or not.
   *
   * Without this the feature is undiagnosable: if recognition is working but
   * the wake word did not match, nothing happens at all, which is exactly what
   * a broken microphone also looks like. Showing what was heard turns "it does
   * not work" into "it heard *zero* when I said *Neuro*", which is a problem
   * someone can actually do something about.
   */
  onHeard?: (transcript: string) => void;
  onError?: (reason: string) => void;
}

export function listenForWake(handlers: WakeHandlers) {
  const { onWake, onHeard, onError } = handlers;
  const Ctor = recognitionCtor();
  if (!Ctor) {
    onError?.("unsupported");
    return () => {};
  }

  let stopped = false;
  const recognition = new Ctor();
  recognition.continuous = true;
  // Interim results, so a long utterance reports something before the pause
  // that would otherwise end the phrase — a wake word said mid-sentence used to
  // be swallowed entirely.
  recognition.interimResults = true;
  recognition.lang = typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US";

  let woke = false;
  recognition.onresult = (event) => {
    const last = event.results[event.results.length - 1];
    const said = (last?.[0]?.transcript ?? "").trim();
    if (!said) return;
    onHeard?.(said);
    // One wake per utterance, or an interim result and its final form would
    // both fire and the panel would open twice.
    if (isWakeWord(said)) {
      if (woke) return;
      woke = true;
      window.setTimeout(() => {
        woke = false;
      }, 1500);
      onWake(said);
    }
  };

  recognition.onerror = (event) => {
    // "no-speech" and "aborted" are the ordinary rhythm of a long session, not
    // failures worth telling anyone about.
    if (event.error === "no-speech" || event.error === "aborted") return;
    onError?.(event.error);
    if (event.error === "not-allowed" || event.error === "service-not-allowed") stopped = true;
  };

  recognition.onend = () => {
    if (stopped) return;
    try {
      recognition.start();
    } catch {
      /* already starting; the next onend will settle it */
    }
  };

  try {
    recognition.start();
  } catch {
    onError?.("start-failed");
  }

  return () => {
    stopped = true;
    try {
      recognition.abort();
    } catch {
      /* nothing to abort */
    }
  };
}

/**
 * Listen for one spoken request, then stop.
 *
 * Separate from the wake listener on purpose. That one runs continuously and
 * only ever looks for a name; this one is started by a deliberate press, takes
 * a single utterance, and shuts the microphone off the moment it has one.
 * Keeping them apart means dictation never becomes a reason for the microphone
 * to stay open, and the reader can use it without enabling the wake word at
 * all.
 */
export function dictateOnce(handlers: {
  onPartial?: (text: string) => void;
  onFinal: (text: string) => void;
  onError?: (reason: string) => void;
}) {
  const Ctor = recognitionCtor();
  if (!Ctor) {
    handlers.onError?.("unsupported");
    return () => {};
  }

  const recognition = new Ctor();
  recognition.continuous = false;
  // Interim results so the field fills as the sentence is spoken; watching the
  // words appear is most of what tells someone it is actually hearing them.
  recognition.interimResults = true;
  recognition.lang = typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US";

  let best = "";
  recognition.onresult = (event) => {
    const last = event.results[event.results.length - 1];
    const said = (last?.[0]?.transcript ?? "").trim();
    if (!said) return;
    best = said;
    handlers.onPartial?.(said);
  };

  recognition.onerror = (event) => {
    if (event.error === "aborted") return;
    handlers.onError?.(event.error);
  };

  // `onend` rather than a final result: a short utterance sometimes ends the
  // session before a result is ever marked final, and waiting for that flag
  // meant the shortest commands were the ones that got lost.
  recognition.onend = () => {
    if (best) handlers.onFinal(best);
  };

  try {
    recognition.start();
  } catch {
    handlers.onError?.("start-failed");
  }

  return () => {
    try {
      recognition.stop();
    } catch {
      /* nothing running */
    }
  };
}
