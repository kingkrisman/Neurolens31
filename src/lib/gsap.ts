import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";

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
  gsap.to(scrollerOf(target), {
    duration: 0.7,
    ease: "power3.inOut",
    overwrite: "auto",
    scrollTo: { y: target, offsetY, autoKill: true },
  });
}
