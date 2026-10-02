import { FONTS, fontFiles, fontStack } from "./fonts.ts";
import { PALETTES, PALETTE_NAMES } from "./palettes.ts";
import { bionicSegments } from "./restyle.ts";
import {
  describeLook,
  patternFor,
  readOptions,
  siteOf,
  type Look,
  type Options,
  type Stored,
} from "./settings.ts";
import { disableSite, enableSite } from "./sites.ts";

/**
 * The popup: a sample of the reader's look, a switch for the site in front of
 * them, and a way to take the page into the app.
 */

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const els = {
  look: $("look"),
  sample: $("sample"),
  lookLine: $("look-line"),
  noLook: $("no-look"),
  site: $("site"),
  siteName: $("site-name"),
  toggle: $<HTMLInputElement>("site-toggle"),
  options: $<HTMLFieldSetElement>("options"),
  restricted: $("restricted"),
  read: $<HTMLButtonElement>("read"),
  status: $("status"),
};

/**
 * The tab the popup is about. Normally the one it was opened over; the
 * browser tests open the popup as a page of its own and name the tab instead.
 */
async function currentTab(): Promise<chrome.tabs.Tab | undefined> {
  const named = Number(new URLSearchParams(location.search).get("tab"));
  if (named) return chrome.tabs.get(named).catch(() => undefined);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

let tab: chrome.tabs.Tab | undefined;
let site: string | null = null;

async function render(): Promise<void> {
  const stored = (await chrome.storage.local.get(["look", "sites", "options"])) as Stored;
  const look = stored.look;
  const options = readOptions(stored.options);

  els.look.hidden = !look;
  els.noLook.hidden = Boolean(look);
  if (look) showLook(look);

  const onApp = Boolean(site && __APP_ORIGINS__.includes(site));
  $("on-app").hidden = !onApp;
  els.restricted.hidden = Boolean(site);
  els.site.hidden = !site || onApp;
  els.read.disabled = !site || onApp;
  if (!site || onApp) return;

  els.siteName.textContent = new URL(site).host;
  const permitted = await chrome.permissions.contains({ origins: [patternFor(site)] });
  els.toggle.checked = Boolean(look) && permitted && (stored.sites ?? []).includes(site);
  els.toggle.disabled = !look;
  els.options.disabled = !look;
  for (const input of els.options.querySelectorAll<HTMLInputElement>("input")) {
    input.checked = options[input.name as keyof Options];
  }
  // Only offered when the mask is on in the app; there is nothing to switch otherwise.
  $("mask-option").hidden = !look?.readingMask;
}

let shownFont = "";

function showLook(look: Look): void {
  const palette = PALETTES[look.theme];
  const sample = els.sample;
  sample.style.background = palette.bg;
  sample.style.color = palette.fg;
  sample.style.fontFamily = fontStack(look.fontFamily);
  // The popup is small; the sample keeps the reader's proportions, not their size.
  sample.style.fontSize = `${Math.min(look.fontSize, 21)}px`;
  sample.style.lineHeight = String(look.lineHeight);
  sample.style.letterSpacing = `${look.letterSpacing}em`;
  sample.style.wordSpacing = `${look.wordSpacing}em`;

  const text = "Reading should feel this easy on every page you open.";
  const segments = bionicSegments(text, look.bionicStrength) ?? [{ text, bold: false }];
  sample.replaceChildren(
    ...segments.map((segment) => {
      if (!segment.bold) return document.createTextNode(segment.text);
      const b = document.createElement("b");
      b.textContent = segment.text;
      return b;
    }),
  );

  els.lookLine.textContent = describeLook(look, FONTS[look.fontFamily].label, PALETTE_NAMES[look.theme]);

  if (shownFont !== look.fontFamily) {
    shownFont = look.fontFamily;
    const family = FONTS[look.fontFamily].family;
    for (const { weight, file } of fontFiles(look.fontFamily)) {
      const face = new FontFace(family!, `url("${chrome.runtime.getURL(file)}")`, { weight: String(weight) });
      face.load().then((loaded) => document.fonts.add(loaded), () => {});
    }
  }
}

function say(message: string): void {
  els.status.textContent = message;
}

els.toggle.addEventListener("change", () => {
  const here = site;
  if (!here) return;
  say("");
  if (!els.toggle.checked) {
    void disableSite(here).then(render);
    return;
  }
  // Asked for before anything else happens: the browser only shows the
  // question straight after a click. The note lets the background finish the
  // job if the question closes the popup (Firefox does).
  void chrome.storage.local.set({ enabling: { site: here, tabId: tab?.id, at: Date.now() } });
  chrome.permissions.request({ origins: [patternFor(here)] }).then(
    async (granted) => {
      if (!granted) {
        els.toggle.checked = false;
        say("NeuroLens needs your permission to change this site. Nothing was changed.");
        await chrome.storage.local.remove("enabling");
        return;
      }
      await chrome.storage.local.remove("enabling");
      await enableSite(here, tab?.id);
      await render();
    },
    () => {
      els.toggle.checked = false;
      say("The browser would not ask for access to this site.");
    },
  );
});

els.options.addEventListener("change", async (event) => {
  const input = event.target as HTMLInputElement;
  const stored = (await chrome.storage.local.get("options")) as Stored;
  await chrome.storage.local.set({ options: { ...readOptions(stored.options), [input.name]: input.checked } });
});

els.read.addEventListener("click", async () => {
  if (!tab?.id) return;
  els.read.disabled = true;
  say("Finding the words on this page…");
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["extract.js"] });
    const [first] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => (window as unknown as { __nlExtract?: () => unknown }).__nlExtract?.() ?? null,
    });
    const article = first?.result as { title: string; text: string; url: string } | null | undefined;
    if (!article?.text) {
      say("There is no article here that NeuroLens can find. Select the part you want to read and try again.");
      els.read.disabled = false;
      return;
    }
    await chrome.storage.local.set({ pendingArticle: { ...article, at: Date.now() } });
    await chrome.tabs.create({ url: `${__APP_URL__}/?from=extension` });
    window.close();
  } catch {
    say("This page does not let extensions read it.");
    els.read.disabled = false;
  }
});

$("open-app").addEventListener("click", () => void openApp("/"));
$("connect").addEventListener("click", () => void openApp("/"));
$("privacy").addEventListener("click", () => void openApp("/privacy#extension"));

async function openApp(path: string): Promise<void> {
  await chrome.tabs.create({ url: `${__APP_URL__}${path}` });
  window.close();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && ("look" in changes || "sites" in changes || "options" in changes)) void render();
});

void (async () => {
  tab = await currentTab();
  site = siteOf(tab?.url);
  await render();
})();
