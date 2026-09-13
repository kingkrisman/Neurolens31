import { useRef } from "react";
import { useReducedMotion } from "@/lib/prefers-reduced-motion";
import type { ComponentType } from "react";

/**
 * Anything that draws itself at a given size.
 *
 * Was typed to `LucideIcon`, which locked the component to one icon library.
 * The reader now draws its chrome from Phosphor data via `@iconify/react`, and
 * those are perfectly good icons that simply are not Lucide components — the
 * only thing this actually needs is something it can render with a size.
 */
export type SwappableIcon = ComponentType<{ size?: number; className?: string }>;
import { gsap, registerGsap, useGSAP } from "@/lib/gsap";

registerGsap();

export function IconSwap({
  active,
  ActiveIcon,
  InactiveIcon,
  size = 16,
}: {
  active: boolean;
  ActiveIcon: SwappableIcon;
  InactiveIcon: SwappableIcon;
  size?: number;
}) {
  const reduce = useReducedMotion();
  const onRef = useRef<HTMLSpanElement>(null);
  const offRef = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      const on = onRef.current;
      const off = offRef.current;
      if (!on || !off) return;
      const duration = reduce ? 0.01 : 0.3;
      gsap.to(on, {
        opacity: active ? 1 : 0,
        scale: active ? 1 : 0.25,
        filter: active ? "blur(0px)" : "blur(4px)",
        duration,
        ease: "power3.out",
      });
      gsap.to(off, {
        opacity: active ? 0 : 1,
        scale: active ? 0.25 : 1,
        filter: active ? "blur(4px)" : "blur(0px)",
        duration,
        ease: "power3.out",
      });
    },
    { dependencies: [active, reduce] },
  );

  return (
    <span className="relative inline-flex size-4 items-center justify-center">
      <span
        ref={offRef}
        className="absolute inset-0 flex items-center justify-center"
        style={{ opacity: active ? 0 : 1 }}
        aria-hidden={active}
      >
        <InactiveIcon size={size} />
      </span>
      <span
        ref={onRef}
        className="absolute inset-0 flex items-center justify-center"
        style={{ opacity: active ? 1 : 0 }}
        aria-hidden={!active}
      >
        <ActiveIcon size={size} />
      </span>
    </span>
  );
}
