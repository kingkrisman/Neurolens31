import { fontFiles, FONTS, type FontKey } from "./fonts.ts";
import { patternFor, type Stored } from "./settings.ts";
import { enableSite } from "./sites.ts";

/**
 * Keeps the extension's reach exactly as wide as the reader made it.
 *
 * A site gets the restyle script only while it is both switched on and
 * permitted. The browser lets people take a permission back from its own
 * settings, without opening the popup; when that happens the site is switched
 * off here too, so the list never claims a site the extension cannot touch.
 *
 * It also reads font files for content scripts (see content.ts), which cannot
 * load them from a page themselves.
 */

const SCRIPT_ID = "nl-restyle";
/** guard.ts, in the page's own world; see that file for why. */
const GUARD_ID = "nl-guard";

const FONT_FILES = new Set(
  (Object.keys(FONTS) as FontKey[]).flatMap((key) => fontFiles(key).map((font) => font.file)),
);
const fontCache = new Map<string, Promise<string>>();

chrome.runtime.onInstalled.addListener(() => void sync());
chrome.runtime.onStartup.addListener(() => void sync());

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && "sites" in changes) void sync();
});

chrome.permissions.onRemoved.addListener(async ({ origins = [] }) => {
  if (!origins.length) return;
  const { sites = [] } = (await chrome.storage.local.get("sites")) as Stored;
  const kept = sites.filter((site) => !origins.includes(patternFor(site)));
  if (kept.length !== sites.length) await chrome.storage.local.set({ sites: kept });
});

/**
 * Finishes switching a site on when the permission prompt took the popup
 * with it (Firefox closes the popup while it asks). The popup leaves a note
 * saying which site and tab it was for before it asks.
 */
chrome.permissions.onAdded.addListener(async ({ origins = [] }) => {
  const { enabling } = (await chrome.storage.local.get("enabling")) as { enabling?: { site: string; tabId: number; at: number } };
  if (!enabling || Date.now() - enabling.at > 5 * 60_000) return;
  if (!origins.includes(patternFor(enabling.site))) return;
  await chrome.storage.local.remove("enabling");
  await enableSite(enabling.site, enabling.tabId);
});

chrome.runtime.onMessage.addListener((message: { kind?: string; file?: string }, _sender, reply) => {
  if (message?.kind !== "font" || !message.file || !FONT_FILES.has(message.file)) return false;
  readFont(message.file).then(reply, () => reply(null));
  return true;
});

async function sync(): Promise<void> {
  const { sites = [] } = (await chrome.storage.local.get("sites")) as Stored;
  const patterns: string[] = [];
  for (const site of sites) {
    // The app itself is never restyled (see content.ts).
    if (__APP_ORIGINS__.includes(site)) continue;
    const pattern = patternFor(site);
    if (!patterns.includes(pattern) && (await chrome.permissions.contains({ origins: [pattern] }))) {
      patterns.push(pattern);
    }
  }
  const existing = new Set(
    (await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID, GUARD_ID] })).map((script) => script.id),
  );
  if (!patterns.length) {
    if (existing.size) await chrome.scripting.unregisterContentScripts({ ids: [...existing] });
    return;
  }
  const scripts: chrome.scripting.RegisteredContentScript[] = [
    { id: GUARD_ID, js: ["guard.js"], matches: patterns, runAt: "document_start", world: "MAIN" },
    { id: SCRIPT_ID, js: ["content.js"], matches: patterns, runAt: "document_start" },
  ];
  const known = scripts.filter((script) => existing.has(script.id));
  const fresh = scripts.filter((script) => !existing.has(script.id));
  if (known.length) await chrome.scripting.updateContentScripts(known);
  if (fresh.length) await chrome.scripting.registerContentScripts(fresh);
}

function readFont(file: string): Promise<string> {
  let pending = fontCache.get(file);
  if (!pending) {
    pending = fetch(chrome.runtime.getURL(file))
      .then((response) => response.arrayBuffer())
      .then((buffer) => {
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        }
        return btoa(binary);
      });
    pending.catch(() => fontCache.delete(file));
    fontCache.set(file, pending);
  }
  return pending;
}
