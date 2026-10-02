import { useSyncExternalStore } from "react";

/**
 * The browser extension, as the app talks about it: where to get it, whether
 * this browser can have it, and whether it is already here.
 */

export type BrowserId = "chrome" | "edge" | "firefox";

/**
 * Where each store lists the extension. Empty until it is published there:
 * the extension page then says it is on its way, and the app does not
 * suggest it, because there would be nothing to click through to.
 *
 * Fill these in from each store's dashboard once the listing is live.
 */
export const STORE_LINKS: Record<BrowserId, string | null> = {
  chrome: null,
  edge: null,
  firefox: null,
};

export const BROWSER_NAMES: Record<BrowserId, string> = {
  chrome: "Chrome",
  edge: "Edge",
  firefox: "Firefox",
};

export const STORE_NAMES: Record<BrowserId, string> = {
  chrome: "Chrome Web Store",
  edge: "Edge Add-ons",
  firefox: "Firefox Add-ons",
};

export interface BrowserGuess {
  /** A browser the extension is made for, or null for anything else. */
  browser: BrowserId | null;
  /** Phones and tablets: their browsers do not take extensions like these. */
  mobile: boolean;
}

/**
 * Which browser this is, from its user agent.
 *
 * Only to pick the right button. Brave, Vivaldi and other Chromium browsers
 * install from the Chrome Web Store, so they count as Chrome; Edge says
 * "Edg/" and Opera "OPR/", both on top of "Chrome/".
 */
export function guessBrowser(userAgent: string): BrowserGuess {
  const mobile = /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent);
  let browser: BrowserId | null = null;
  if (/Edg\//.test(userAgent)) browser = "edge";
  else if (/Firefox\//.test(userAgent)) browser = "firefox";
  else if (/Chrome\//.test(userAgent) && !/OPR\/|SamsungBrowser\//.test(userAgent)) browser = "chrome";
  return { browser, mobile };
}

/** The store link for this browser, if it is one we make it for and it is published there. */
export function storeLinkFor(guess: BrowserGuess): string | null {
  if (guess.mobile || !guess.browser) return null;
  return STORE_LINKS[guess.browser];
}

/* ------------------------------------------------------------- installed */

let installed = false;
let listening = false;
const listeners = new Set<() => void>();

/**
 * Listens for the extension's hello, and asks for one.
 *
 * The extension runs a small script on this site (extension/src/bridge.ts)
 * that answers a "ping" with "hello". Asking
 * rather than waiting matters on pages that open after it has already said
 * hello once. Nothing is posted anywhere but this window.
 */
function listen(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data as { source?: unknown; kind?: unknown } | null;
    if (!data || data.source !== "neurolens-extension" || data.kind !== "hello" || installed) return;
    installed = true;
    for (const notify of listeners) notify();
  });
  window.postMessage({ source: "neurolens-app", kind: "ping" }, location.origin);
}

/** Whether the extension is installed in this browser. False until it says so. */
export function useExtensionInstalled(): boolean {
  return useSyncExternalStore(
    (notify) => {
      listen();
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    () => installed,
    () => false,
  );
}
