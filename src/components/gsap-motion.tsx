import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import { useReducedMotion } from "@/lib/prefers-reduced-motion";
import { useInView } from "@/lib/use-in-view";
import { cn } from "@/lib/utils";
import {
  easeOut,
  finePointer,
  gsap,
  registerGsap,
  scrollToId,
  useGSAP,
} from "@/lib/gsap";

registerGsap();

export function PageEnter({
  children,
  className,
  replayKey,
}: {
  children: ReactNode;
  className?: string;
  replayKey?: string | number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useGSAP(
    () => {
      const root = ref.current;
      if (!root || reduce) return;
      const items = root.querySelectorAll<HTMLElement>("[data-enter]");
      const targets = items.length ? items : root.querySelectorAll<HTMLElement>(":scope > *");
      if (!targets.length) return;
      gsap.fromTo(
        targets,
        { y: 22, autoAlpha: 0 },
        {
          y: 0,
          autoAlpha: 1,
          duration: 0.48,
          stagger: 0.06,
          ease: easeOut,
          clearProps: "transform,visibility,opacity",
        },
      );
    },
    { scope: ref, dependencies: [reduce, replayKey] },
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

export function GsapStagger({
  children,
  className,
  replayKey,
  selector = ":scope > *",
  y = 18,
}: {
  children: ReactNode;
  className?: string;
  replayKey?: string | number;
  selector?: string;
  y?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useGSAP(
    () => {
      const root = ref.current;
      if (!root || reduce) return;
      const items = root.querySelectorAll<HTMLElement>(selector);
      if (!items.length) return;
      gsap.fromTo(
        items,
        { y, autoAlpha: 0 },
        {
          y: 0,
          autoAlpha: 1,
          duration: 0.45,
          stagger: 0.055,
          ease: easeOut,
          clearProps: "transform,visibility,opacity",
        },
      );
    },
    { scope: ref, dependencies: [reduce, replayKey, selector, y] },
  );

  return (
    <div ref={ref} className={cn("gsap-stagger", className)}>
      {children}
    </div>
  );
}

export function GsapCount({
  value,
  suffix = "",
  className,
}: {
  value: number;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const inView = useInView(ref, { rootMargin: "0px 0px -6% 0px" });
  const played = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) {
      el.textContent = `${value}${suffix}`;
      return;
    }
    if (!inView || played.current) return;
    played.current = true;
    const state = { n: 0 };
    el.textContent = `0${suffix}`;
    gsap.to(state, {
      n: value,
      duration: 1.05,
      ease: "power2.out",
      onUpdate: () => {
        el.textContent = `${Math.round(state.n)}${suffix}`;
      },
    });
  }, [inView, value, suffix, reduce]);

  return (
    <span ref={ref} className={className}>
      {value}
      {suffix}
    </span>
  );
}

export function Magnetic({
  children,
  className,
  strength = 8,
}: {
  children: ReactNode;
  className?: string;
  strength?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || reduce || !finePointer()) return;
      const xTo = gsap.quickTo(el, "x", { duration: 0.45, ease: easeOut });
      const yTo = gsap.quickTo(el, "y", { duration: 0.45, ease: easeOut });
      const onMove = (event: PointerEvent) => {
        const box = el.getBoundingClientRect();
        xTo(((event.clientX - box.left) / box.width - 0.5) * strength);
        yTo(((event.clientY - box.top) / box.height - 0.5) * strength);
      };
      const reset = () => {
        xTo(0);
        yTo(0);
        el.style.willChange = "auto";
      };
      const arm = () => {
        el.style.willChange = "transform";
      };
      el.addEventListener("pointerenter", arm);
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerleave", reset);
      return () => {
        el.removeEventListener("pointerenter", arm);
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerleave", reset);
      };
    },
    { dependencies: [reduce, strength] },
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/** In-page scroll links + IntersectionObserver enters. No per-frame ScrollTrigger scrub. */
export function ScrollScene({ children, className, replayKey }: { children: ReactNode; className?: string; replayKey?: string | number }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const root = ref.current;
    if (!root || reduce) return;
    if (typeof IntersectionObserver === "undefined") return;
    const scroller = root.closest(".pane-scroll, .reader-scroll");
    const nodes = [
      ...root.querySelectorAll("[data-batch]"),
      ...[...root.querySelectorAll("[data-batch-children]")].flatMap((group) => [...group.querySelectorAll(":scope > *")]),
      ...root.querySelectorAll("[data-scrub-fade]"),
    ];
    if (!nodes.length) return;
    const seen = new Set<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        const rootBox = scroller instanceof Element ? scroller.getBoundingClientRect() : new DOMRect(0, 0, window.innerWidth, window.innerHeight);
        for (const entry of entries) {
          if (seen.has(entry.target)) continue;
          const entered = entry.isIntersecting || entry.boundingClientRect.top < rootBox.bottom;
          if (!entered) continue;
          seen.add(entry.target);
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      },
      {
        root: scroller instanceof Element ? scroller : null,
        rootMargin: "10000px 0px -10% 0px",
        threshold: 0,
      },
    );
    nodes.forEach((node) => {
      node.classList.add("io-reveal");
      const rootBox = (scroller instanceof Element ? scroller : document.documentElement).getBoundingClientRect();
      const box = node.getBoundingClientRect();
      if (box.top < rootBox.bottom) {
        node.classList.add("is-in");
        seen.add(node);
        return;
      }
      io.observe(node);
    });
    return () => io.disconnect();
  }, [reduce, replayKey]);

  function onInPageNav(event: MouseEvent<HTMLDivElement>) {
    const link = (event.target as HTMLElement).closest("a[href^='#']");
    if (!(link instanceof HTMLAnchorElement) || !link.hash) return;
    const id = decodeURIComponent(link.hash.slice(1));
    if (!id || !document.getElementById(id)) return;
    event.preventDefault();
    scrollToId(id);
  }

  return (
    <div ref={ref} className={className} onClick={onInPageNav}>
      {children}
    </div>
  );
}

export function StaggerWords({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();

  useGSAP(
    () => {
      const root = ref.current;
      if (!root || reduce) return;
      gsap.fromTo(
        root.querySelectorAll("[data-word]"),
        { y: 10, autoAlpha: 0 },
        {
          y: 0,
          autoAlpha: 1,
          duration: 0.4,
          stagger: 0.03,
          ease: "power3.out",
          clearProps: "transform,visibility,opacity",
        },
      );
    },
    { dependencies: [text, reduce] },
  );

  return (
    <span ref={ref} className={className}>
      {text.split(" ").map((word, index) => (
        <span key={`${word}-${index}`} data-word className="stagger-word">
          {word}&nbsp;
        </span>
      ))}
    </span>
  );
}

export function StaggerBlock({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || reduce) return;
      gsap.fromTo(
        el,
        { y: 14, autoAlpha: 0 },
        {
          y: 0,
          autoAlpha: 1,
          duration: 0.48,
          delay: delay / 1000,
          ease: "power3.out",
          clearProps: "transform,visibility,opacity",
        },
      );
    },
    { dependencies: [delay, reduce] },
  );

  return (
    <div ref={ref} className={cn("stagger-block", className)}>
      {children}
    </div>
  );
}
