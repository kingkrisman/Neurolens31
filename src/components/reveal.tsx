import { useRef, type ReactNode } from "react";
import { useReducedMotion } from "@/lib/prefers-reduced-motion";
import { useInView } from "@/lib/use-in-view";
import { cn } from "@/lib/utils";

export function Reveal({
  children,
  className,
  delay = 0,
  variant = "rise",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  variant?: "rise" | "clip";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const inView = useInView(ref, { rootMargin: "0px 0px -8% 0px" });

  return (
    <div
      ref={ref}
      className={cn(variant === "clip" ? "reveal" : "io-reveal", (inView || reduce) && "is-in", className)}
      style={delay && !reduce ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
