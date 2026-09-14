import { Check } from "lucide-react";
import { HIGHLIGHT_COLORS, colorById, type HighlightColorId } from "@/lib/highlight-colors";
import { cn } from "@/lib/utils";

/**
 * The row of markers.
 *
 * Swatches rather than a dropdown of colour names: picking a highlighter is a
 * visual decision, and a list of the words "Yellow, Orange, Pink" makes the
 * reader translate twice. Six sit comfortably in a row at phone width, which is
 * the other reason the palette stops at six.
 *
 * The current marker is named in text as well as ringed, because a ring around
 * one of six similar circles is not something everyone can see — and colour is
 * the entire subject here, so it cannot be the only channel.
 */
export function MarkerPalette({
  value,
  onChange,
  className,
  size = "md",
}: {
  value: HighlightColorId;
  onChange: (color: HighlightColorId) => void;
  className?: string;
  /** `sm` for the inline picker on a saved mark, `md` for the dock. */
  size?: "sm" | "md";
}) {
  const dot = size === "sm" ? "size-5" : "size-7";

  return (
    <div
      className={cn("flex items-center gap-1.5", className)}
      role="radiogroup"
      aria-label="Highlighter colour"
    >
      {HIGHLIGHT_COLORS.map((color) => {
        const active = color.id === value;
        return (
          <button
            key={color.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={color.label}
            title={color.label}
            onClick={() => onChange(color.id)}
            className={cn(
              "relative grid shrink-0 place-items-center rounded-full",
              "transition-[transform,box-shadow] duration-[150ms] ease-[var(--ease-standard)]",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
              "hover:scale-110 active:scale-95",
              dot,
              // The ring is drawn in the page's own ink, not in the swatch
              // colour, so it stays visible on the pale colours too.
              active && "ring-2 ring-fg ring-offset-2 ring-offset-surface",
            )}
            style={{ backgroundColor: color.hex }}
          >
            {active ? (
              <Check
                size={size === "sm" ? 11 : 14}
                strokeWidth={3}
                // Dark ink on every swatch: all six are light enough to carry it,
                // and a mark that changes colour with the swatch reads as a
                // different control rather than the same one moved.
                className="text-[#1A1208]"
                aria-hidden
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** The current marker, drawn as a single dot — for a toolbar button's face. */
export function MarkerDot({ value, className }: { value: HighlightColorId; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("block size-2.5 rounded-full shadow-border", className)}
      style={{ backgroundColor: colorById(value).hex }}
    />
  );
}
