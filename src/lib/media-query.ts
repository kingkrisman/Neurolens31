import { useEffect, useState } from "react";

/**
 * Subscribe to a media query.
 *
 * Starts `false` and resolves after mount so the server render and the first
 * client render agree — a width read during render would hydrate mismatched.
 * Components that switch layout on the result should pick the wide layout as
 * the `false` case only when that is the safe default.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    setMatches(media.matches);
    const onChange = () => setMatches(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** Matches Tailwind's `sm` breakpoint boundary: true below 640px. */
export function useIsMobile(): boolean {
  return useMediaQuery("(width < 40rem)");
}
