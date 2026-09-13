import { useEffect, useId, useState, type ReactNode } from "react";
import { GLASS_DISPLACEMENT_MAP } from "@/lib/glass-map";
import { cn } from "@/lib/utils";

/** How far the backdrop is pushed at the edges of the pane, in pixels. */
const DISPLACEMENT = 20;
/** Spread between the R, G and B displacement passes. Higher fringes harder. */
const ABERRATION = 0.35;

/**
 * The refraction filter, ported from `liquid-glass-react` (rdev).
 *
 * The shape of it: a displacement map is loaded with `feImage`, then the source
 * is displaced through it *three times* at slightly different scales and each
 * pass is masked down to a single colour channel. Screen-blending the three
 * back together is what produces chromatic aberration — the coloured fringing
 * real glass shows where it bends light hardest, and the detail that separates
 * this from a plain blur.
 *
 * The aberration is then composited through an edge mask so it appears only at
 * the borders. Fringing across the whole pane would read as a broken display;
 * confined to the edges it reads as thickness.
 */
function GlassFilter({ id }: { id: string }) {
  return (
    <svg aria-hidden className="pointer-events-none absolute size-0" focusable="false">
      <defs>
        <filter
          id={id}
          x="-35%"
          y="-35%"
          width="170%"
          height="170%"
          colorInterpolationFilters="sRGB"
        >
          <feImage
            x="0"
            y="0"
            width="100%"
            height="100%"
            result="DISPLACEMENT_MAP"
            href={GLASS_DISPLACEMENT_MAP}
            preserveAspectRatio="xMidYMid slice"
          />

          {/* Isolate the border of the map, so aberration can be limited to it. */}
          <feColorMatrix
            in="DISPLACEMENT_MAP"
            type="matrix"
            values="0.3 0.3 0.3 0 0
                    0.3 0.3 0.3 0 0
                    0.3 0.3 0.3 0 0
                    0   0   0   1 0"
            result="EDGE_INTENSITY"
          />
          <feComponentTransfer in="EDGE_INTENSITY" result="EDGE_MASK">
            <feFuncA type="discrete" tableValues={`0 ${ABERRATION * 0.05} 1`} />
          </feComponentTransfer>

          <feOffset in="SourceGraphic" dx="0" dy="0" result="CENTER_ORIGINAL" />

          {/* Three passes at diverging scales — one per channel. */}
          <feDisplacementMap
            in="SourceGraphic"
            in2="DISPLACEMENT_MAP"
            scale={-DISPLACEMENT}
            xChannelSelector="R"
            yChannelSelector="B"
            result="RED_DISPLACED"
          />
          <feColorMatrix
            in="RED_DISPLACED"
            type="matrix"
            values="1 0 0 0 0
                    0 0 0 0 0
                    0 0 0 0 0
                    0 0 0 1 0"
            result="RED_CHANNEL"
          />

          <feDisplacementMap
            in="SourceGraphic"
            in2="DISPLACEMENT_MAP"
            scale={DISPLACEMENT * (-1 - ABERRATION * 0.05)}
            xChannelSelector="R"
            yChannelSelector="B"
            result="GREEN_DISPLACED"
          />
          <feColorMatrix
            in="GREEN_DISPLACED"
            type="matrix"
            values="0 0 0 0 0
                    0 1 0 0 0
                    0 0 0 0 0
                    0 0 0 1 0"
            result="GREEN_CHANNEL"
          />

          <feDisplacementMap
            in="SourceGraphic"
            in2="DISPLACEMENT_MAP"
            scale={DISPLACEMENT * (-1 - ABERRATION * 0.1)}
            xChannelSelector="R"
            yChannelSelector="B"
            result="BLUE_DISPLACED"
          />
          <feColorMatrix
            in="BLUE_DISPLACED"
            type="matrix"
            values="0 0 0 0 0
                    0 0 0 0 0
                    0 0 1 0 0
                    0 0 0 1 0"
            result="BLUE_CHANNEL"
          />

          <feBlend in="GREEN_CHANNEL" in2="BLUE_CHANNEL" mode="screen" result="GB_COMBINED" />
          <feBlend in="RED_CHANNEL" in2="GB_COMBINED" mode="screen" result="RGB_COMBINED" />
          <feGaussianBlur
            in="RGB_COMBINED"
            stdDeviation={Math.max(0.1, 0.5 - ABERRATION * 0.1)}
            result="ABERRATED_BLURRED"
          />

          {/* Fringing at the edges, the clean original everywhere else. */}
          <feComposite
            in="ABERRATED_BLURRED"
            in2="EDGE_MASK"
            operator="in"
            result="EDGE_ABERRATION"
          />
          <feComponentTransfer in="EDGE_MASK" result="INVERTED_MASK">
            <feFuncA type="table" tableValues="1 0" />
          </feComponentTransfer>
          <feComposite
            in="CENTER_ORIGINAL"
            in2="INVERTED_MASK"
            operator="in"
            result="CENTER_CLEAN"
          />
          <feComposite in="EDGE_ABERRATION" in2="CENTER_CLEAN" operator="over" />
        </filter>
      </defs>
    </svg>
  );
}

/**
 * Liquid-glass chrome for the header.
 *
 * The technique is `liquid-glass-react`'s, but the markup is not: that package
 * emits its passes as siblings with inline positioning and expects to own the
 * box it sits in, which turned a 64px header into 242px of stacked layers with
 * the content pushed off screen. Owning the DOM here is what lets the same
 * filter work as full-bleed chrome.
 *
 * Two effects, on two elements, because they cannot share one:
 *
 *  - `backdrop-filter: blur() saturate()` frosts what is behind the header;
 *  - `filter: url(#…)` refracts that frosted result through the displacement
 *    map, bending the page at the edges of the pane.
 *
 * A single element cannot do both — `filter` would also distort the header's
 * own text — so the glass is a dedicated layer behind the content.
 */
export function GlassHeader({ children, className }: { children: ReactNode; className?: string }) {
  const filterId = useId();
  const [refract, setRefract] = useState(false);

  useEffect(() => {
    // Firefox parses `filter: url()` but composites it against backdrop-filter
    // incorrectly, blanking the pane; upstream disables it there for the same
    // reason. Reduced-motion opts out too: the refraction resamples as the page
    // scrolls beneath, so it is motion whether or not anything is animating.
    const isFirefox = navigator.userAgent.includes("Firefox");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setRefract(!isFirefox && !reduced);
  }, []);

  return (
    // No `isolate` here. `isolation: isolate` creates a backdrop root, and a
    // backdrop root is exactly what `backdrop-filter` cannot see past — the
    // pane below would have had nothing to blur but its own empty container.
    // Layering is handled by paint order instead: the glass layers are
    // positioned and come first, the content is positioned and comes after.
    <div className={cn("nl-glass relative", className)}>
      {refract ? <GlassFilter id={filterId} /> : null}
      {/* Two layers, because one element cannot carry both effects.

          `filter` applies to an element's *own* paint, so anything with a
          background of its own gets chewed by the displacement chain and
          screen-blended toward grey — which is exactly what a single combined
          layer produced. The refracting pane therefore paints nothing at all: it
          exists only to bend the backdrop behind it. The tint and the sheen sit
          above it, unfiltered, and supply the colour. */}
      <div
        aria-hidden
        className="nl-glass-pane pointer-events-none absolute inset-0"
        style={refract ? { filter: `url(#${filterId})` } : undefined}
      />
      <div aria-hidden className="nl-glass-tint pointer-events-none absolute inset-0" />
      {/* Positioned, so it paints above the three positioned layers on DOM
          order alone — no z-index, and so no stacking context to trap them. */}
      <div className="nl-glass-content relative">{children}</div>
    </div>
  );
}
