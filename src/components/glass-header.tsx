import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Header chrome, after kiro.dev.
 *
 * A floating capsule rather than a full-bleed bar: inset from every edge,
 * rounded, and mostly transparent. The blur is the substance of the change —
 * this ran at 20px with a saturation boost and an SVG displacement refraction
 * on top, which turned whatever passed beneath into fog and made the header
 * read as a lid closing off the page. At 4px the content stays recognisable as
 * it travels under, and the capsule reads as a pane of glass resting on the
 * page instead.
 *
 * Nothing is painted at rest. The fill and the border arrive only once the page
 * has actually scrolled, so at the top the capsule is invisible and the hero
 * runs the full width behind it.
 */
export function GlassHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    // No `isolate` here. `isolation: isolate` creates a backdrop root, and a
    // backdrop root is exactly what `backdrop-filter` cannot see past — the
    // pane below would have had nothing to blur but its own empty container.
    // Layering is handled by paint order instead: the glass layers are
    // positioned and come first, the content is positioned and comes after.
    <div className={cn("nl-glass relative", className)}>
      {/* Two layers: one frosts what is behind, one supplies the colour. Kept
          apart because reading mode dims the colour while the blur has to stay
          at full strength — an opacity below 1 on the blurring element would
          make it a backdrop root and it would have nothing left to sample. */}
      <div aria-hidden className="nl-glass-pane pointer-events-none absolute inset-0" />
      <div aria-hidden className="nl-glass-tint pointer-events-none absolute inset-0" />
      {/* Positioned, so it paints above the two layers on DOM order alone — no
          z-index, and so no stacking context to trap them. */}
      <div className="nl-glass-content relative">{children}</div>
    </div>
  );
}
