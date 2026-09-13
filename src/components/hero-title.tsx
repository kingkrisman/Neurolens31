import { useRef } from "react";
import { useReducedMotion } from "@/lib/prefers-reduced-motion";
import { easeOut, gsap, registerGsap, useGSAP } from "@/lib/gsap";

registerGsap();

export function HeroTitle() {
  const ref = useRef<HTMLHeadingElement>(null);
  const reduce = useReducedMotion();

  useGSAP(
    () => {
      const root = ref.current;
      if (!root || reduce) return;
      gsap.fromTo(
        root,
        { y: 18, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, duration: 0.55, ease: easeOut, clearProps: "transform,visibility,opacity" },
      );
    },
    { dependencies: [reduce] },
  );

  return (
    // Tracking is size-specific, so the display size is fluid rather than a
    // pair of fixed steps: it grows with the viewport and the negative tracking
    // in the base h1 rule keeps pace instead of only being right at one size.
    <h1
      ref={ref}
      className="max-w-[18ch] text-[clamp(2.5rem,7vw,5.25rem)] leading-[1.04] lg:max-w-[15ch]"
    >
      Read with <em className="font-medium italic">effortless</em> clarity.
    </h1>
  );
}
