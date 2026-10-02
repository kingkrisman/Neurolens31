import { toast } from "sonner";
import { useAppStore } from "./store.ts";
import type { ReadingProfile } from "./types.ts";

/**
 * The app's end of the conversation with the NeuroLens browser extension.
 *
 * The extension has no account and no server of its own. When it is
 * installed, a small script of its runs on this site, and the two pass notes
 * through `window.postMessage`:
 *
 *   app → "ready"      once the shell is up
 *   ext → "hello"      the extension is here
 *   app → "profile"    the reading settings, now and whenever they change
 *   ext → "article"    a page the reader chose to read here
 *
 * Nothing is posted until the extension says hello, so without it installed
 * this does nothing at all. Only the settings that mean something on a website
 * are sent — typeface, sizes, spacing, alignment, bold strength, palette and
 * the reading mask.
 */

const FROM_APP = "neurolens-app";
const FROM_EXTENSION = "neurolens-extension";
const MAX_ARTICLE_CHARS = 2_000_000;

type SharedSettings = Pick<
  ReadingProfile,
  | "fontFamily"
  | "fontSize"
  | "lineHeight"
  | "letterSpacing"
  | "wordSpacing"
  | "bionicStrength"
  | "theme"
  | "align"
  | "readingMask"
  | "maskStrength"
  | "focusBand"
>;

export function sharedSettings(profile: ReadingProfile): SharedSettings {
  const { fontFamily, fontSize, lineHeight, letterSpacing, wordSpacing, bionicStrength, theme } = profile;
  const { align, readingMask, maskStrength, focusBand } = profile;
  return {
    fontFamily,
    fontSize,
    lineHeight,
    letterSpacing,
    wordSpacing,
    bionicStrength,
    theme,
    align,
    readingMask,
    maskStrength,
    focusBand,
  };
}

export function startExtensionBridge(): () => void {
  let connected = false;
  let waiting: { title: string; text: string } | null = null;

  const post = (message: Record<string, unknown>) =>
    window.postMessage({ source: FROM_APP, ...message }, location.origin);

  const sendSettings = () => {
    const { profile, hydrated } = useAppStore.getState();
    // Before hydration the profile is the default, not the reader's.
    if (!connected || !hydrated) return;
    post({ kind: "profile", profile: sharedSettings(profile), modeName: profile.name });
  };

  const openWaiting = () => {
    const state = useAppStore.getState();
    if (!waiting || !state.hydrated) return;
    const { title, text } = waiting;
    waiting = null;
    state.startReading(text, { title: title || undefined });
    toast("Opened from the extension", { description: title || undefined });
  };

  const onMessage = (event: MessageEvent) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data as { source?: unknown; kind?: unknown; title?: unknown; text?: unknown } | null;
    if (!data || typeof data !== "object" || data.source !== FROM_EXTENSION) return;
    if (data.kind === "hello") {
      connected = true;
      sendSettings();
    }
    if (data.kind === "article" && typeof data.text === "string" && data.text.trim()) {
      waiting = {
        title: typeof data.title === "string" ? data.title.trim().slice(0, 200) : "",
        text: data.text.slice(0, MAX_ARTICLE_CHARS),
      };
      openWaiting();
    }
  };

  window.addEventListener("message", onMessage);
  const unsubscribe = useAppStore.subscribe((state, previous) => {
    if (state.profile !== previous.profile || state.hydrated !== previous.hydrated) sendSettings();
    if (state.hydrated && !previous.hydrated) openWaiting();
  });
  post({ kind: "ready" });

  return () => {
    window.removeEventListener("message", onMessage);
    unsubscribe();
  };
}
