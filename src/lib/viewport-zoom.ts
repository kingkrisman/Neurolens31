/**
 * Whether the reader has pinched in.
 *
 * The reader moves the page on its own in two places — auto-scroll, and
 * following the line being read aloud — and neither knew about pinch-zoom.
 * Zoomed in on a phone, the visible part of the page is a small window onto
 * the layout, so every automatic scroll slid the text out from under the
 * reader's finger. A tester in Deep Focus on an iPhone described exactly that:
 * zooming that fought her scrolling and broke her pace.
 *
 * So while the page is zoomed, the reader keeps its hands off it. The
 * threshold is a little above 1 because browsers report fractional scales at
 * rest (1.0000001 after a rotation, for instance).
 */
const ZOOMED = 1.05;

export function pageZoom(): number {
  if (typeof window === "undefined") return 1;
  return window.visualViewport?.scale ?? 1;
}

export function isPinchZoomed(): boolean {
  return pageZoom() > ZOOMED;
}
