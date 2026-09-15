import { useEffect } from "react";
import { startWindowSmoothScroll } from "@/lib/smooth-scroll";

/** Weighted scrolling for the whole window. Mount once, at the root. */
export function SmoothScroll() {
  useEffect(() => startWindowSmoothScroll(), []);
  return null;
}
