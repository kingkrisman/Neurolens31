import { Readability } from "@mozilla/readability";

/**
 * Takes the words worth reading off the open page.
 *
 * Injected only when the reader asks, into the tab they asked from. A
 * selection wins — they chose it. Otherwise Mozilla's Readability (the engine
 * behind Firefox's Reader View) finds the article and leaves the menus,
 * adverts and comments behind. The result is plain text, a paragraph per
 * block, which is what the app's reader takes.
 */

declare global {
  interface Window {
    __nlExtract?: () => Extracted | null;
  }
}

export interface Extracted {
  title: string;
  text: string;
  url: string;
}

/** A book is a few hundred thousand characters; anything past this is not an article. */
const MAX_CHARS = 1_500_000;
const BLOCKS = "p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, figcaption, dt, dd, td, th";

window.__nlExtract = () => {
  const title = document.title.trim().slice(0, 200);
  const selected = window.getSelection()?.toString().trim() ?? "";
  if (selected.split(/\s+/).length >= 12) {
    return { title, text: tidy(selected), url: location.href };
  }

  const clone = document.cloneNode(true) as Document;
  const article = new Readability<Node>(clone, { serializer: (node) => node }).parse();
  const root = article?.content;
  if (!article || !(root instanceof Element)) return null;
  const text = tidy(blocksOf(root).join("\n\n"));
  if (text.split(/\s+/).length < 40) return null;
  return { title: (article.title ?? title).trim().slice(0, 200) || title, text, url: location.href };
};

/** Each innermost block as a paragraph; lists keep their bullets. */
function blocksOf(root: Element): string[] {
  const blocks = [...root.querySelectorAll(BLOCKS)].filter((el) => !el.querySelector(BLOCKS));
  if (!blocks.length) return [root.textContent ?? ""];
  return blocks
    .map((el) => {
      const raw = el.textContent ?? "";
      const text = el.localName === "pre" ? raw.trim() : raw.replace(/\s+/g, " ").trim();
      if (!text) return "";
      return el.localName === "li" ? `• ${text}` : text;
    })
    .filter(Boolean);
}

function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_CHARS);
}
