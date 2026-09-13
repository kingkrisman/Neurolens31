import { useEffect } from "react";
import { useAppStore } from "@/lib/store";
import type { FontId } from "@/lib/types";

const FONT_HREF: Partial<Record<FontId, string>> = {
  serif:
    "https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400;1,6..72,500&display=swap",
  atkinson: "https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap",
  lexend: "https://fonts.googleapis.com/css2?family=Lexend:wght@300;400;500;600;700&display=swap",
  inclusive: "https://fonts.googleapis.com/css2?family=Inclusive+Sans:ital,wght@0,400;0,500;0,700;1,400&display=swap",
  andika: "https://fonts.googleapis.com/css2?family=Andika:ital,wght@0,400;0,700;1,400&display=swap",
  literata: "https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,400;7..72,600&display=swap",
  comicneue: "https://fonts.googleapis.com/css2?family=Comic+Neue:wght@400;700&display=swap",
  sourcesans: "https://fonts.googleapis.com/css2?family=Source+Sans+3:ital,wght@0,400;0,600;1,400&display=swap",
};

const injected = new Set<string>();

function ensurePreconnect() {
  if (typeof document === "undefined") return;
  if (document.querySelector("link[data-nl-font-preconnect]")) return;
  for (const href of ["https://fonts.googleapis.com", "https://fonts.gstatic.com"]) {
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = href;
    link.crossOrigin = "anonymous";
    link.dataset.nlFontPreconnect = "1";
    document.head.appendChild(link);
  }
}

function inject(id: string, href: string) {
  if (typeof document === "undefined") return;
  if (injected.has(id) || document.querySelector(`link[data-nl-font="${id}"]`)) return;
  injected.add(id);
  ensurePreconnect();
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.nlFont = id;
  // print media until load so a blocked/hanging font CSS cannot freeze first paint
  link.media = "print";
  link.addEventListener("load", () => {
    link.media = "all";
  }, { once: true });
  link.addEventListener("error", () => {
    injected.delete(id);
    link.remove();
  }, { once: true });
  document.head.appendChild(link);
}

export function preloadReadingFonts() {
  if (typeof document === "undefined") return;
  for (const [id, href] of Object.entries(FONT_HREF)) {
    if (href) inject(id, href);
  }
}

/** Load the active face after first paint. System serifs show immediately if the request is slow. */
export function FontLoader() {
  const font = useAppStore((s) => s.profile.fontFamily);
  const tab = useAppStore((s) => s.tab);
  const controlsOpen = useAppStore((s) => s.controlsOpen);

  useEffect(() => {
    if (FONT_HREF.serif) inject("serif", FONT_HREF.serif);
    const extra = FONT_HREF[font];
    if (extra && font !== "serif") inject(font, extra);
  }, [font]);

  useEffect(() => {
    if (tab === "settings" || controlsOpen) preloadReadingFonts();
  }, [tab, controlsOpen]);

  return null;
}
