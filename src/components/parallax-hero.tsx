import { useEffect, useRef, type ReactNode } from "react";
import { useReducedMotion } from "@/lib/prefers-reduced-motion";
import { Media } from "@/components/ui/surfaces";
import { cn } from "@/lib/utils";

function cssScrollTimeline(): boolean {
  return typeof CSS !== "undefined" && CSS.supports("animation-timeline: scroll()");
}

const LERP = 0.14;
const SETTLE = 0.05;

export function ParallaxHero({ children, className }: { children: ReactNode; className?: string }) {
  const sectionRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const pane = section.closest(".pane-scroll") as HTMLElement | null;
    const hasTimeline = cssScrollTimeline();
    const motionOff = reduceMotion === true;

    let targetX = 0;
    let targetY = 0;
    let curX = 0;
    let curY = 0;
    let raf = 0;
    let running = false;

    const writeMouse = () => {
      section.style.setProperty("--mx", `${curX.toFixed(2)}px`);
      section.style.setProperty("--my", `${curY.toFixed(2)}px`);
      section.style.setProperty("--rx", `${(-curY * 0.045).toFixed(3)}deg`);
      section.style.setProperty("--ry", `${(curX * 0.038).toFixed(3)}deg`);
    };

    const tick = () => {
      curX += (targetX - curX) * LERP;
      curY += (targetY - curY) * LERP;
      writeMouse();
      if (Math.abs(targetX - curX) < SETTLE && Math.abs(targetY - curY) < SETTLE) {
        curX = targetX;
        curY = targetY;
        writeMouse();
        running = false;
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    const kick = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(tick);
    };

    const onPointer = (event: PointerEvent) => {
      if (motionOff) return;
      if (event.pointerType === "touch") return;
      const nx = (event.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      const ny = (event.clientY / Math.max(1, window.innerHeight)) * 2 - 1;
      const rect = section.getBoundingClientRect();
      const overHero = event.clientY >= rect.top && event.clientY <= rect.bottom;
      const mag = overHero ? 30 : 18;
      targetX = nx * mag;
      targetY = ny * mag * 0.7;
      kick();
    };

    const onLeave = () => {
      targetX = 0;
      targetY = 0;
      kick();
    };

    const onScroll = () => {
      if (!pane || hasTimeline || motionOff) return;
      section.style.setProperty("--parallax", `${pane.scrollTop}px`);
    };

    if (!motionOff) {
      section.classList.add("is-tracking");
      window.addEventListener("pointermove", onPointer, { passive: true });
      document.documentElement.addEventListener("mouseleave", onLeave);
    }

    if (!hasTimeline && pane) {
      onScroll();
      pane.addEventListener("scroll", onScroll, { passive: true });
    }

    return () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      section.classList.remove("is-tracking");
      window.removeEventListener("pointermove", onPointer);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      pane?.removeEventListener("scroll", onScroll);
    };
  }, [reduceMotion]);

  return (
    <section
      ref={sectionRef}
      className={cn("parallax-hero relative -mt-14 overflow-clip sm:-mt-16", className)}
    >
      <div className="parallax-mouse-far pointer-events-none absolute inset-x-0 -top-[22%] h-[144%]" aria-hidden>
        <div className="parallax-far h-full w-full">
          <Media
            src="/images/hero-lens.jpg"
            alt=""
            width={1792}
            height={1008}
            loading="eager"
            fetchPriority="high"
            className="h-full w-full object-cover object-[center_42%]"
          />
        </div>
      </div>
      <div className="parallax-mouse-glow parallax-glow pointer-events-none absolute inset-0" aria-hidden />
      <div className="parallax-veil pointer-events-none absolute inset-0" aria-hidden />
      <div className="parallax-mouse-near relative z-10">
        <div className="parallax-near">{children}</div>
      </div>
    </section>
  );
}
