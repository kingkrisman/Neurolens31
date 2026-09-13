import type { IconifyIcon } from "@iconify/react";
import type { TabId } from "@/lib/types";
import {
  binoculars,
  binocularsFill,
  bookOpen,
  bookOpenFill,
  books,
  booksFill,
  eye,
  eyeFill,
  slidersHorizontal,
  slidersHorizontalFill,
} from "@/lib/ph-icons";

/**
 * Phosphor ships a regular and a filled cut of the same glyph. Swapping between
 * them is the set's own idiom for selection: the shape stays put and only its
 * weight changes, which reads as "this one" without moving anything.
 */
export const NAV_ICON: Record<TabId, { rest: IconifyIcon; active: IconifyIcon }> = {
  // Binoculars, not a sparkle: a sparkle is the generic "AI magic" glyph and
  // says nothing about what the tab holds. Compass would be the classic
  // explore metaphor, but the reader toolbar already spends one on "Where was
  // I" — and one glyph must not carry two meanings.
  explore: { rest: binoculars, active: binocularsFill },
  read: { rest: bookOpen, active: bookOpenFill },
  library: { rest: books, active: booksFill },
  insights: { rest: eye, active: eyeFill },
  settings: { rest: slidersHorizontal, active: slidersHorizontalFill },
};
