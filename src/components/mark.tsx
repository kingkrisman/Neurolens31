import { cn } from "@/lib/utils";

/**
 * The NeuroLens iris: a pupil, eight radial spokes, and the finer branches that
 * fork off each one.
 *
 * Two stroke weights carry the whole idea — the heavy spokes read at any size,
 * the light branches only resolve when the mark is given room. That is why the
 * detail layer is dropped below about 32px (see `detail`): at header scale the
 * 3.2 strokes land on roughly a third of a pixel each and turn into grey haze
 * around the pupil, which reads as a smudge rather than as an eye.
 *
 * No `color` attribute: the mark inherits `currentColor`, so it takes the ink of
 * whatever it sits in rather than pinning itself to one hex value.
 */
export function Mark({
  className,
  detail = false,
}: {
  className?: string;
  /** Draw the fine branch layer. Only legible at ~32px and up. */
  detail?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 96 96"
      className={cn("nl-mark size-7", className)}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="48" cy="48" r="8" fill="currentColor" stroke="none" className="nl-mark-pupil" />
      <g strokeWidth="4.5" className="nl-mark-rays">
        <path d="M60.9 53.4L72.0 57.9" />
        <path d="M53.4 60.9L57.9 72.0" />
        <path d="M42.6 60.9L38.1 72.0" />
        <path d="M35.1 53.4L24.0 57.9" />
        <path d="M35.1 42.6L24.0 38.1" />
        <path d="M42.6 35.1L38.1 24.0" />
        <path d="M53.4 35.1L57.9 24.0" />
        <path d="M60.9 42.6L72.0 38.1" />
      </g>
      {detail ? (
        <g strokeWidth="3.2" className="nl-mark-branches">
          <path d="M72.0 57.9Q79.0 57.4 84.0 57.0" />
          <path d="M72.0 57.9Q76.6 63.3 79.8 67.1" />
          <path d="M57.9 72.0Q63.3 76.6 67.1 79.8" />
          <path d="M57.9 72.0Q57.4 79.0 57.0 84.0" />
          <path d="M38.1 72.0Q38.6 79.0 39.0 84.0" />
          <path d="M38.1 72.0Q32.7 76.6 28.9 79.8" />
          <path d="M24.0 57.9Q19.4 63.3 16.2 67.1" />
          <path d="M24.0 57.9Q17.0 57.4 12.0 57.0" />
          <path d="M24.0 38.1Q17.0 38.6 12.0 39.0" />
          <path d="M24.0 38.1Q19.4 32.7 16.2 28.9" />
          <path d="M38.1 24.0Q32.7 19.4 28.9 16.2" />
          <path d="M38.1 24.0Q38.6 17.0 39.0 12.0" />
          <path d="M57.9 24.0Q57.4 17.0 57.0 12.0" />
          <path d="M57.9 24.0Q63.3 19.4 67.1 16.2" />
          <path d="M72.0 38.1Q76.6 32.7 79.8 28.9" />
          <path d="M72.0 38.1Q79.0 38.6 84.0 39.0" />
        </g>
      ) : null}
    </svg>
  );
}
