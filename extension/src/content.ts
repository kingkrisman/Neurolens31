import { FONTS, fontFiles } from "./fonts.ts";
import { PALETTES } from "./palettes.ts";
import {
  BLOCKS,
  CHROME,
  LOOSE,
  NO_BOLD,
  POSTS,
  PROSE,
  bionicSegments,
  buildCss,
  isDarkColor,
  tintFor,
  type Tint,
} from "./restyle.ts";
import { readOptions, type Look, type Options, type Stored, type Tones } from "./settings.ts";

/**
 * Puts the reader's look on a site they switched it on for.
 *
 * Injected two ways — registered for the site (every visit) and straight into
 * the open tab when they first switch it on — so it can arrive twice. The
 * second copy finds the first and leaves.
 *
 * Everything it adds is tagged and can be taken back off without a reload:
 * switching a site off, or any option, restores the page as it was — down to
 * the site's own text nodes, which are kept rather than copied (see `bold`).
 */

declare global {
  interface Window {
    __nlExt?: boolean;
  }
}

const STYLE_ID = "nl-ext-style";
const TINT_TAG = "nl-tint";
const MASK_TAG = "nl-mask";
const TEXT_TAG = "nl-text";
const ORIG_TAG = "nl-orig";
const BOLD_TAG = "nl-fx";
const OURS = new Set([TINT_TAG, MASK_TAG, TEXT_TAG, ORIG_TAG, BOLD_TAG]);

let applied: { look: Look; options: Options } | null = null;
let tones: Tones = {};
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
    stored = (await chrome.storage.local.get(["look", "sites", "options", "tones"])) as Stored;
  } catch {
    // The extension was updated or removed underneath this page.
    return undo();
  }
  tones = stored.tones ?? {};
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

  // Colours from the last visit, straight away: this runs before the page is
  // first drawn, so it never shows its own colours and then changes.
  const remembered = tones[location.origin];
  if (!options.colours) paint(null, false);
  else if (remembered !== undefined) paint(look, remembered);

  whenReady(() => {
    if (applied?.look !== look) return;
    if (options.colours) judge(look);
    mask.set(options.mask && look.readingMask ? look : null);
  });
  // Bold word starts edit text, so they wait until the page has finished
  // loading: app-like sites first draw their page from the server and then
  // take it over in the browser, and text changed in between makes them
  // throw it away and draw it again.
  whenLoaded(() => {
    if (applied?.look !== look) return;
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
  mask.set(null);
  paint(null, false);
  document.getElementById(STYLE_ID)?.remove();
  document.documentElement.removeAttribute("data-nl-ext");
}

/** Once the page has loaded, or two seconds after it appears, whichever is first. */
function whenLoaded(run: () => void): void {
  let ran = false;
  const settled = () => {
    if (ran) return;
    ran = true;
    requestIdleCallback(run, { timeout: 1000 });
  };
  if (document.readyState === "complete") return settled();
  window.addEventListener("load", settled, { once: true });
  whenReady(() => setTimeout(settled, 2000));
}

function whenReady(run: () => void): void {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else run();
}

/* ----------------------------------------------------------------- watch */

/**
 * One observer for everything that reacts to the page changing.
 *
 * Our own edits are taken back out of its queue as soon as they are made
 * (`quiet`), so nothing here ever reacts to itself.
 */
const watch = (() => {
  const listeners = new Set<(records: MutationRecord[]) => void>();
  let observer: MutationObserver | null = null;
  return {
    add(listener: (records: MutationRecord[]) => void): void {
      listeners.add(listener);
      if (observer) return;
      observer = new MutationObserver((records) => {
        for (const run of listeners) run(records);
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["class", "style"],
      });
    },
    remove(listener: (records: MutationRecord[]) => void): void {
      listeners.delete(listener);
      if (listeners.size || !observer) return;
      observer.disconnect();
      observer = null;
    },
    /** Make edits without hearing about them. */
    quiet(edit: () => void): void {
      edit();
      observer?.takeRecords();
    },
  };
})();

const isOurs = (node: Node): boolean => OURS.has(node.nodeName.toLowerCase());

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
  for (const [x, y] of [
    [0.25, 0.5],
    [0.5, 0.5],
    [0.75, 0.5],
    [0.5, 0.85],
    [0.1, 0.2],
  ]) {
    let el = document.elementFromPoint(innerWidth * x!, innerHeight * y!);
    let verdict: boolean | null = null;
    while (el && verdict === null) {
      const style = getComputedStyle(el);
      // A see-through layer — a pop-up's dimmed backdrop — is not the page's colour.
      if (Number.parseFloat(style.opacity || "1") >= 0.96) verdict = isDarkColor(style.backgroundColor);
      el = el.parentElement;
    }
    if (verdict === true) dark += 1;
    if (verdict === false) light += 1;
  }
  if (dark !== light) return dark > light;
  // Nothing painted anywhere: the canvas is white unless the text says otherwise.
  const text = document.querySelector("p, [dir='auto']");
  return text ? isDarkColor(getComputedStyle(text).color) === false : false;
}

let tint: Tint | null = null;

/**
 * Judge the page once it is there, and again once it has finished loading:
 * app-like sites draw a loading screen first, and that is not their colour.
 * The answer is remembered for the next visit.
 */
function judge(look: Look): void {
  const settle = () => {
    if (applied?.look !== look || !applied.options.colours) return;
    const dark = pageIsDark();
    if (tones[location.origin] !== dark) {
      tones = { ...tones, [location.origin]: dark };
      void chrome.storage.local.set({ tones }).catch(() => {});
    }
    paint(look, dark);
  };
  settle();
  const later = () => setTimeout(settle, 1200);
  if (document.readyState === "complete") later();
  else window.addEventListener("load", later, { once: true });
}

function paint(look: Look | null, pageDark: boolean): void {
  const root = document.documentElement;
  let layer = root.querySelector<HTMLElement>(`:scope > ${TINT_TAG}`);
  if (!look) {
    tint = null;
    layer?.remove();
    root.removeAttribute("data-nl-flip");
    unflip.stop();
    mask.recolour();
    return;
  }
  tint = tintFor(look.theme, pageDark);
  if (!tint) {
    // A dark site under a light palette keeps its own colours; see tintFor.
    layer?.remove();
    root.removeAttribute("data-nl-flip");
    unflip.stop();
    mask.recolour();
    return;
  }
  root.toggleAttribute("data-nl-flip", tint.flip);
  if (tint.flip) unflip.start();
  else unflip.stop();
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
  mask.recolour();
}

/**
 * Layers that must not be turned with the page.
 *
 * Turning a page light-for-dark turns everything, and a site's see-through dark
 * layers — the dimmed backdrop behind a pop-up, the dark fade that keeps a
 * headline readable over a photo — come out as white haze. Pictures set as CSS
 * backgrounds come out as negatives. Those are marked here and turned back
 * (the rule is in restyle.ts). It takes computed styles to see them, so it is
 * done in idle moments, and again for whatever the site adds or changes.
 */
const unflip = (() => {
  const MARK = "data-nl-unflip";
  const pending = new Set<Element>();
  let on = false;
  let scheduled = false;

  /** How opaque a computed colour is: the fourth value if there is one, else fully. */
  function alpha(colour: string): number {
    const values = colour.match(/[\d.]+%?/g);
    if (!colour.startsWith("rgb") || !values) return 0;
    const value = values[3];
    if (value === undefined) return 1;
    return Number.parseFloat(value) / (value.endsWith("%") ? 100 : 1);
  }

  function check(el: Element): void {
    if (!el.isConnected || isOurs(el) || el.hasAttribute(MARK) || el.closest(`[${MARK}]`)) return;
    const style = getComputedStyle(el);
    if (style.backgroundImage.includes("url(")) {
      el.setAttribute(MARK, "");
      return;
    }
    if (style.position !== "fixed" && style.position !== "absolute") return;
    // See-through by its colour, by its own opacity (YouTube dims that way), or a fade.
    const see = alpha(style.backgroundColor) * Number.parseFloat(style.opacity || "1");
    const layered = (see > 0.04 && see < 0.96) || style.backgroundImage.includes("gradient");
    if (!layered) return;
    const box = el.getBoundingClientRect();
    const backdrop = box.width * box.height >= 0.5 * innerWidth * innerHeight;
    const picture = el.parentElement?.querySelector("img, picture, video, canvas");
    const overPicture = Boolean(picture && !el.contains(picture));
    if (backdrop || overPicture) el.setAttribute(MARK, "");
  }

  function schedule(): void {
    if (scheduled || !on) return;
    scheduled = true;
    requestIdleCallback(
      (deadline) => {
        scheduled = false;
        for (const el of pending) {
          if (deadline.timeRemaining() < 2) break;
          pending.delete(el);
          check(el);
        }
        if (pending.size) schedule();
      },
      { timeout: 500 },
    );
  }

  function queue(root: Element): void {
    pending.add(root);
    for (const el of root.querySelectorAll("*")) pending.add(el);
    schedule();
  }

  const listen = (records: MutationRecord[]) => {
    for (const record of records) {
      if (record.type === "attributes") {
        if (record.target instanceof Element && !isOurs(record.target)) pending.add(record.target);
        continue;
      }
      for (const node of record.addedNodes) {
        if (node instanceof Element && !isOurs(node)) queue(node);
      }
    }
    if (pending.size) schedule();
  };

  return {
    start(): void {
      if (on) return;
      on = true;
      if (document.body) queue(document.body);
      watch.add(listen);
    },
    stop(): void {
      if (!on) return;
      on = false;
      pending.clear();
      watch.remove(listen);
      for (const el of document.querySelectorAll(`[${MARK}]`)) el.removeAttribute(MARK);
    },
  };
})();

/* ------------------------------------------------------------------- bold */

/**
 * Bold word starts, written into the page's text.
 *
 * Each run of text becomes `<nl-text>` holding the bold copy and, hidden
 * inside `<nl-orig>`, the site's own text node — moved, not copied. The site
 * keeps the very node it made: when it changes the words, the copy is redrawn
 * from them; when it takes them away, the copy goes too; and switching off
 * puts the same node back where it was. guard.ts covers the one thing that
 * cannot be seen from here, a site asking the old parent for its node.
 *
 * Only reading text, and only as it comes near the screen: a long page is
 * done a screenful at a time in idle moments, so scrolling never waits on it.
 * Text the site adds later — feeds, replies, "load more" — is picked up too.
 */
const bold = (() => {
  const done = new WeakSet<Element>();
  const queue: Element[] = [];
  let strength = 0;
  let scheduled = false;
  let near: IntersectionObserver | null = null;

  const blockSelector = `:is(${BLOCKS}):not(:is(${CHROME}) *)`;

  function isBlock(el: Element): boolean {
    if (!el.matches(blockSelector) || el.closest(NO_BOLD)) return false;
    // A loose span is often a name or a label; only sentences are worth it.
    if (el.matches(LOOSE) && !el.matches(`${PROSE}, ${POSTS}`)) {
      return (el.textContent ?? "").trim().split(/\s+/).length >= 4;
    }
    return true;
  }

  const blockOf = (node: Node): Element | null => node.parentElement?.closest(BLOCKS) ?? null;

  function schedule(): void {
    if (scheduled) return;
    scheduled = true;
    requestIdleCallback(
      (deadline) => {
        scheduled = false;
        watch.quiet(() => {
          while (queue.length && deadline.timeRemaining() > 2) {
            const el = queue.shift()!;
            if (el.isConnected) rewrite(el);
          }
        });
        if (queue.length) schedule();
      },
      // Near the screen, so it cannot wait on a page that is never idle.
      { timeout: 300 },
    );
  }

  /** The bold copy of a text, as nodes. */
  function copyOf(text: string): Node[] | null {
    const segments = bionicSegments(text, strength);
    if (!segments) return null;
    return segments.map((segment) => {
      if (!segment.bold) return document.createTextNode(segment.text);
      const b = document.createElement(BOLD_TAG);
      b.textContent = segment.text;
      return b;
    });
  }

  function rewrite(el: Element): void {
    if (done.has(el)) return;
    done.add(el);
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const texts: Text[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || parent.closest(NO_BOLD) || parent.closest(ORIG_TAG)) continue;
      // A button or tab inside a post (a "Show more", a link card) keeps its text.
      const furniture = parent.closest(CHROME);
      if (furniture && el.contains(furniture)) continue;
      // Nested reading text is rewritten as part of its own block.
      if (blockOf(node) !== el) continue;
      texts.push(node as Text);
    }
    for (const text of texts) {
      const copy = copyOf(text.data);
      if (!copy) continue;
      const wrap = document.createElement(TEXT_TAG);
      const orig = document.createElement(ORIG_TAG);
      orig.hidden = true;
      orig.style.setProperty("display", "none", "important");
      text.replaceWith(wrap);
      orig.append(text);
      wrap.append(...copy, orig);
    }
  }

  /** The site changed or removed its own text inside a wrapper. */
  function redraw(orig: Element): void {
    const wrap = orig.parentElement;
    if (!wrap || wrap.localName !== TEXT_TAG) return;
    const text = orig.textContent ?? "";
    watch.quiet(() => {
      if (!text) {
        wrap.remove();
        return;
      }
      const copy = copyOf(text) ?? [document.createTextNode(text)];
      for (const child of [...wrap.childNodes]) if (child !== orig) child.remove();
      wrap.prepend(...copy);
    });
  }

  function track(el: Element): void {
    if (done.has(el) || !isBlock(el)) return;
    near?.observe(el);
  }

  /** Text changed inside something already done: do it again. */
  function retrack(el: Element): void {
    done.delete(el);
    track(el);
  }

  const listen = (records: MutationRecord[]) => {
    for (const record of records) {
      if (record.type === "attributes") continue;
      const target = record.target;
      const element = target.nodeType === Node.TEXT_NODE ? target.parentElement : target instanceof Element ? target : null;
      const orig = element?.closest(ORIG_TAG);
      if (orig) {
        redraw(orig);
        continue;
      }
      if (record.type === "characterData") {
        const host = blockOf(target);
        if (host) retrack(host);
        continue;
      }
      for (const node of record.addedNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          const host = blockOf(node);
          if (host) retrack(host);
        } else if (node instanceof Element && !isOurs(node)) {
          track(node);
          for (const el of node.querySelectorAll(BLOCKS)) track(el);
          const host = node.parentElement?.closest(BLOCKS);
          if (host) retrack(host);
        }
      }
    }
  };

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
      for (const el of document.querySelectorAll(BLOCKS)) track(el);
      watch.add(listen);
    },
    stop(): void {
      near?.disconnect();
      near = null;
      watch.remove(listen);
      queue.length = 0;
      watch.quiet(() => {
        for (const wrap of document.querySelectorAll(TEXT_TAG)) {
          const orig = wrap.querySelector(`:scope > ${ORIG_TAG}`);
          // The site's own nodes go back, so its code finds what it left.
          if (orig) wrap.replaceWith(...orig.childNodes);
          else wrap.replaceWith(document.createTextNode(wrap.textContent ?? ""));
        }
      });
      // Forget what was done, so switching back on does it all again.
      for (const el of document.querySelectorAll(BLOCKS)) done.delete(el);
    },
  };
})();

/* ------------------------------------------------------------------- mask */

/**
 * The reader's mask, on a website: everything but a band of lines goes quiet.
 *
 * Two panels in the palette's background colour, above and below the band,
 * at the strength the reader chose in the app (the same three levels). The
 * band follows the pointer — or a finger — and sits two fifths down the screen
 * until either moves, so scrolling carries the text through it like a ruler.
 */
const mask = (() => {
  const DIM = { soft: 0.38, medium: 0.55, strong: 0.74 } as const;
  let host: HTMLElement | null = null;
  let above: HTMLElement | null = null;
  let below: HTMLElement | null = null;
  let look: Look | null = null;
  let y = innerHeight * 0.4;
  let frame = 0;

  function bandHeight(): number {
    if (!look) return 0;
    return Math.max(look.fontSize, 16) * look.lineHeight * look.focusBand + 8;
  }

  function place(): void {
    frame = 0;
    if (!above || !below) return;
    const half = bandHeight() / 2;
    above.style.setProperty("transform", `translateY(${y - half - innerHeight}px)`, "important");
    below.style.setProperty("transform", `translateY(${y + half}px)`, "important");
  }

  const follow = (event: PointerEvent) => {
    y = event.clientY;
    if (!frame) frame = requestAnimationFrame(place);
  };

  function colour(): string {
    if (!look) return "transparent";
    if (tint) return tint.flip ? tint.color : PALETTES[look.theme].bg;
    return pageIsDark() ? "#000000" : "#ffffff";
  }

  function panel(): HTMLElement {
    const el = document.createElement("div");
    for (const [property, value] of [
      ["position", "fixed"],
      ["left", "0"],
      ["top", "0"],
      ["width", "100vw"],
      ["height", "100vh"],
      ["pointer-events", "none"],
      ["will-change", "transform"],
    ]) {
      el.style.setProperty(property!, value!, "important");
    }
    return el;
  }

  return {
    set(next: Look | null): void {
      look = next;
      if (!next) {
        host?.remove();
        host = above = below = null;
        removeEventListener("pointermove", follow);
        removeEventListener("pointerdown", follow);
        return;
      }
      if (!host) {
        host = document.createElement(MASK_TAG);
        host.setAttribute("aria-hidden", "true");
        host.style.setProperty("position", "fixed", "important");
        host.style.setProperty("inset", "0", "important");
        host.style.setProperty("pointer-events", "none", "important");
        host.style.setProperty("z-index", "2147483647", "important");
        host.style.setProperty("display", "block", "important");
        above = panel();
        below = panel();
        host.append(above, below);
        document.documentElement.append(host);
        addEventListener("pointermove", follow, { passive: true });
        addEventListener("pointerdown", follow, { passive: true });
      }
      const contrast = matchMedia("(prefers-contrast: more)").matches;
      const dim = contrast ? DIM.soft : DIM[next.maskStrength];
      for (const el of [above!, below!]) el.style.setProperty("opacity", String(dim), "important");
      this.recolour();
      place();
    },
    recolour(): void {
      if (!above || !below) return;
      const fill = colour();
      for (const el of [above, below]) el.style.setProperty("background", fill, "important");
    },
  };
})();
