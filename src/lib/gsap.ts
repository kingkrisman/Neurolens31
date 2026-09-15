import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import { lenisFor } from "@/lib/smooth-scroll";

let registered = false;

export function registerGsap() {
  if (registered || typeof window === "undefined") return;
  gsap.registerPlugin(useGSAP, ScrollToPlugin);
  gsap.defaults({
    ease: "power3.out",
    duration: 0.4,
  });
  registered = true;
}

registerGsap();

export { gsap, useGSAP, ScrollToPlugin };

export const easeOut = "power3.out";
export const easeIn = "power2.in";
export const easeInOut = "power2.inOut";

/** The app scrolls inside `.pane-scroll`, not the window. */
export function scrollerOf(node: Element | null): HTMLElement | Window {
  const pane = node?.closest(".pane-scroll") ?? node?.closest(".reader-scroll");
  return pane instanceof HTMLElement ? pane : window;
}

export function finePointer(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches;
}

export function scrollToId(id: string, offsetY = 88) {
  registerGsap();
  const target = document.getElementById(id);
  if (!target) return;
  const scroller = scrollerOf(target);
  // When smooth scrolling drives this scroller, ask it to move; tweening
  // scrollTop underneath it would have the two fighting over every frame.
  const lenis = lenisFor(scroller);
  if (lenis) {
    lenis.scrollTo(target, { offset: -offsetY, duration: 1.1, easing: (t) => 1 - Math.pow(1 - t, 4) });
    return;
  }
  gsap.to(scroller, {
    duration: 0.7,
    ease: "power3.inOut",
    overwrite: "auto",
    scrollTo: { y: target, offsetY, autoKill: true },
  });
}
