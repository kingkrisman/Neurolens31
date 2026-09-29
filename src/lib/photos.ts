/**
 * Real photographs, from Burst (see public/images/CREDITS.md).
 *
 * Each is saved at five widths, up to the 4K original, and handed to the
 * browser as a `srcset` with a `sizes` hint, so it downloads only the width
 * the screen needs: a phone takes the 640 or the 1280, a laptop the 1280 or
 * the 1920, and only a large, dense display reaches the 3840. The 4K file is
 * there for the screens that can show it, and costs everyone else nothing.
 */

const WIDTHS = [640, 1280, 1920, 2560, 3840] as const;

/** The largest file's real width, where the original was narrower than 3840. */
const MAX_WIDTH: Partial<Record<PhotoName, number>> = { "turning-page": 3441 };

export type PhotoName =
  | "turning-page"
  | "sunlit-pages"
  | "book-spines"
  | "desk-notes"
  | "desk-brief"
  | "sofa-reader"
  | "library-shelf"
  | "glasses-linen"
  | "lap-reader";

export function photo(name: PhotoName, sizes: string) {
  const max = MAX_WIDTH[name];
  return {
    src: `/images/photos/${name}-1280.jpg`,
    srcSet: WIDTHS.map(
      (width) => `/images/photos/${name}-${width}.jpg ${width === 3840 && max ? max : width}w`,
    ).join(", "),
    sizes,
  };
}
