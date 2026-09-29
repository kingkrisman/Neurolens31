import { FONTS, fontFiles } from "./fonts.ts";
import { NO_BOLD, CHROME, PROSE, bionicSegments, buildCss, isDarkColor, tintFor } from "./restyle.ts";
import { readOptions, type Look, type Options, type Stored } from "./settings.ts";

/**
 * Puts the reader's look on a site they switched it on for.
 *
 * Injected two ways — registered for the site (every visit) and straight into
 * the open tab when they first switch it on — so it can arrive twice. The
 * second copy finds the first and leaves.
 *
 * Everything it adds is tagged and can be taken back off without a reload:
 * switching a site off, or any option, restores the page as it was.
 */

declare global {
  interface Window {
    __nlExt?: boolean;
  }
}

const STYLE_ID = "nl-ext-style";
const TINT_TAG = "nl-tint";
const TEXT_TAG = "nl-text";
const BOLD_TAG = "nl-fx";

let applied: { look: Look; options: Options } | null = null;
const loadedFonts = new Set<string>();

if (!window.__nlExt) {
  window.__nlExt = true;
  void refresh();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && ("look" in changes || "sites" in changes || "options" in changes)) void refresh();
  });
}

async function refresh(): Promise<void> {
  let stored: Stored;
  try {
    stored = (await chrome.storage.local.get(["look", "sites", "options"])) as Stored;
  } catch {
    // The extension was updated or removed underneath this page.
    return undo();
  }
  const on = Boolean(stored.look) && (stored.sites ?? []).includes(location.origin);
  if (!on || !stored.look) return undo();
  apply(stored.look, readOptions(stored.options));
}

function apply(look: Look, options: Options): void {
  applied = { look, options };
  const root = document.documentElement;
  root.setAttribute("data-nl-ext", "");

  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    root.append(style);
  }
  style.textContent = buildCss(look, options);

  if (options.typeface) void loadFonts(look);

  whenReady(() => {
    if (applied?.look !== look) return;
    paint(options.colours ? look : null);
    const strength = options.bold ? look.bionicStrength : 0;
    if (strength !== bold.strength) {
      bold.stop();
      if (strength > 0) bold.start(strength);
    }
  });
}

function undo(): void {
  if (!applied && !document.documentElement.hasAttribute("data-nl-ext")) return;
  applied = null;
  bold.stop();
  paint(null);
  document.getElementById(STYLE_ID)?.remove();
  document.documentElement.removeAttribute("data-nl-ext");
}

function whenReady(run: () => void): void {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else run();
}

/* ------------------------------------------------------------------ fonts */

/**
 * The typeface, handed to the page as bytes.
 *
 * Sites often forbid fonts from elsewhere, and the extension's own files are
 * not something a page may load. So the background reads the file and passes
 * it over, and it is registered from memory — which no page policy can block.
 */
async function loadFonts(look: Look): Promise<void> {
  const family = FONTS[look.fontFamily].family;
  if (!family) return;
  for (const { weight, file } of fontFiles(look.fontFamily)) {
    if (loadedFonts.has(file)) continue;
    loadedFonts.add(file);
    let data: string | null = null;
    try {
      data = (await chrome.runtime.sendMessage({ kind: "font", file })) as string | null;
      if (!data) throw new Error("no font");
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      const face = new FontFace(family, bytes, { weight: String(weight), style: "normal", display: "swap" });
      await face.load();
      document.fonts.add(face);
    } catch {
      if (data) {
        fontRule(family, weight, data);
      } else {
        // The fallback stack carries on; try again next time the look changes.
        loadedFonts.delete(file);
      }
    }
  }
}

/** The same font as a stylesheet rule, where a browser will not take a FontFace from us. */
function fontRule(family: string, weight: number, base64: string): void {
  let sheet = document.getElementById(`${STYLE_ID}-fonts`);
  if (!sheet) {
    sheet = document.createElement("style");
    sheet.id = `${STYLE_ID}-fonts`;
    document.documentElement.append(sheet);
  }
  sheet.append(
    `@font-face { font-family: "${family}"; font-weight: ${weight}; font-display: swap; ` +
      `src: url(data:font/woff2;base64,${base64}) format("woff2"); }\n`,
  );
}

/* ---------------------------------------------------------------- colours */

/**
 * Whether the site paints itself dark.
 *
 * Judged by what is on screen: many sites leave `body` transparent and paint
 * a wrapper instead, so a few points across the page are followed up to the
 * first thing with a background of its own. Computed colours are the site's,
 * untouched by our filter, so this reads the page as it was made.
 */
function pageIsDark(): boolean {
  let dark = 0;
  let light = 0;
  for (const x of [0.25, 0.5, 0.75]) {
    let el = document.elementFromPoint(innerWidth * x, innerHeight * 0.5);
    let verdict: boolean | null = null;
    while (el && verdict === null) {
      verdict = isDarkColor(getComputedStyle(el).backgroundColor);
      el = el.parentElement;
    }
    if (verdict === true) dark += 1;
    if (verdict === false) light += 1;
  }
  if (dark !== light) return dark > light;
  // Nothing painted anywhere: the canvas is white unless the text says otherwise.
  const text = document.querySelector("p");
  return text ? isDarkColor(getComputedStyle(text).color) === false : false;
}

function paint(look: Look | null): void {
  const root = document.documentElement;
  let layer = root.querySelector<HTMLElement>(`:scope > ${TINT_TAG}`);
  if (!look) {
    layer?.remove();
    root.removeAttribute("data-nl-flip");
    return;
  }
  const tint = tintFor(look.theme, pageIsDark());
  root.toggleAttribute("data-nl-flip", tint.flip);
  if (!layer) {
    layer = document.createElement(TINT_TAG);
    layer.setAttribute("aria-hidden", "true");
    root.append(layer);
  }
  const set = (property: string, value: string) => layer!.style.setProperty(property, value, "important");
  set("position", "fixed");
  set("inset", "0");
  set("display", "block");
  set("pointer-events", "none");
  set("z-index", "2147483646");
  set("background", tint.color);
  set("mix-blend-mode", tint.blend);
}

/* ------------------------------------------------------------------- bold */

/**
 * Bold word starts, written into the page's own text.
 *
 * Only reading text, and only as it comes near the screen: a long page is
 * done a screenful at a time in idle moments, so scrolling never waits on it.
 * Text the site adds later — infinite feeds, "load more" — is picked up too.
 */
const bold = (() => {
  const done = new WeakSet<Element>();
  const queue: Element[] = [];
  let strength = 0;
  let scheduled = false;
  let near: IntersectionObserver | null = null;
  let watcher: MutationObserver | null = null;

  const proseSelector = `:is(${PROSE}):not(:is(${CHROME}) *)`;

  function isProse(el: Element): boolean {
    return el.matches(proseSelector) && !el.closest(NO_BOLD);
  }

  function schedule(): void {
    if (scheduled) return;
    scheduled = true;
    requestIdleCallback(
      (deadline) => {
        scheduled = false;
        while (queue.length && deadline.timeRemaining() > 2) {
          const el = queue.shift()!;
          if (el.isConnected) rewrite(el);
        }
        if (queue.length) schedule();
      },
      // Near the screen, so it cannot wait on a page that is never idle.
      { timeout: 300 },
    );
  }

  function rewrite(el: Element): void {
    if (done.has(el)) return;
    done.add(el);
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const texts: Text[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || parent.closest(NO_BOLD) || parent.closest(BOLD_TAG)) continue;
      // Nested reading text is rewritten as part of its own element.
      if (parent !== el && parent.closest(PROSE) !== el) continue;
      texts.push(node as Text);
    }
    for (const text of texts) {
      const segments = bionicSegments(text.data, strength);
      if (!segments) continue;
      const wrap = document.createElement(TEXT_TAG);
      for (const segment of segments) {
        if (segment.bold) {
          const b = document.createElement(BOLD_TAG);
          b.textContent = segment.text;
          wrap.append(b);
        } else wrap.append(segment.text);
      }
      text.replaceWith(wrap);
    }
  }

  function track(el: Element): void {
    if (done.has(el) || !isProse(el)) return;
    near?.observe(el);
  }

  function trackWithin(node: Node): void {
    if (!(node instanceof Element)) return;
    if (node.localName === TEXT_TAG || node.localName === BOLD_TAG || node.localName === TINT_TAG) return;
    if (node.matches(PROSE)) track(node);
    for (const el of node.querySelectorAll(PROSE)) track(el);
    const host = node.parentElement?.closest(PROSE);
    if (host) retrack(host);
  }

  /** Text changed inside something already done: do it again. */
  function retrack(el: Element): void {
    if (!done.has(el)) return track(el);
    done.delete(el);
    track(el);
  }

  return {
    /** The strength being applied; 0 when stopped. */
    get strength() {
      return near ? strength : 0;
    },
    start(value: number): void {
      strength = value;
      near = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            near?.unobserve(entry.target);
            queue.push(entry.target);
          }
          if (queue.length) schedule();
        },
        { rootMargin: "800px 0px" },
      );
      for (const el of document.querySelectorAll(PROSE)) track(el);
      watcher = new MutationObserver((records) => {
        for (const record of records) {
          if (record.type === "characterData") {
            const host = record.target.parentElement?.closest(PROSE);
            if (host && !record.target.parentElement?.closest(TEXT_TAG)) retrack(host);
            continue;
          }
          for (const node of record.addedNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
              const host = node.parentElement?.closest(PROSE);
              if (host) retrack(host);
            } else trackWithin(node);
          }
        }
      });
      watcher.observe(document.body ?? document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    },
    stop(): void {
      near?.disconnect();
      near = null;
      watcher?.disconnect();
      watcher = null;
      queue.length = 0;
      for (const wrap of document.querySelectorAll(TEXT_TAG)) {
        wrap.replaceWith(document.createTextNode(wrap.textContent ?? ""));
      }
      // Forget what was done, so switching back on does it all again.
      for (const el of document.querySelectorAll(PROSE)) done.delete(el);
    },
  };
})();
