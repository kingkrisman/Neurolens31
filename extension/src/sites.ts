import { patternFor, type Stored } from "./settings.ts";

/**
 * Switching a site on and off, shared by the popup and the background.
 *
 * Both may finish the same switch (see background.ts), so each step is safe
 * to repeat.
 */

/** Switch a site on and paint the tab it was switched on from. */
export async function enableSite(site: string, tabId: number | undefined): Promise<void> {
  const { sites = [] } = (await chrome.storage.local.get("sites")) as Stored;
  if (!sites.includes(site)) await chrome.storage.local.set({ sites: [...sites, site] });
  if (tabId === undefined) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["guard.js"], world: "MAIN" });
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  } catch {
    // The tab moved on or closed; the registered script covers its next visit.
  }
}

/**
 * Switch a site off and give back the access it needed.
 *
 * The page is restored by the script already on it, which hears the list
 * change. The permission goes too: the extension holds access to a site only
 * while the reader wants it used there.
 */
export async function disableSite(site: string): Promise<void> {
  const { sites = [] } = (await chrome.storage.local.get("sites")) as Stored;
  const kept = sites.filter((entry) => entry !== site);
  await chrome.storage.local.set({ sites: kept });
  const pattern = patternFor(site);
  // Two sites can share a pattern (the same host on another port).
  if (kept.some((entry) => patternFor(entry) === pattern)) return;
  try {
    await chrome.permissions.remove({ origins: [pattern] });
  } catch {
    // Already gone.
  }
}
