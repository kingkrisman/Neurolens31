import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/lib/prefers-reduced-motion";
import { cn } from "@/lib/utils";

/** A reader on a metered or slow connection has asked for less, not more. */
function savingData(): boolean {
  if (typeof navigator === "undefined") return false;
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  return Boolean(connection?.saveData) || /(^|-)2g$/.test(connection?.effectiveType ?? "");
}

/**
 * A silent, looping clip that behaves like a picture until it is worth moving.
 *
 * - No bytes until it is near the screen: no `src` and `preload="none"` until
 *   then, so a visitor who never scrolls this far downloads nothing.
 * - Plays only while a good part of it is visible and pauses as soon as it is
 *   not, so only the one or two clips on screen are ever decoding. That is
 *   what keeps a page with several videos from stuttering.
 * - Stays a still — its poster — under reduced motion, Save-Data, a slow
 *   connection, or when the browser refuses autoplay (iOS Low Power Mode).
 * - Decorative. Hidden from assistive technology; the words beside it carry
 *   the meaning.
 */
export function AmbientVideo({
  src,
  poster,
  className,
}: {
  src: string;
  poster: string;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video || typeof IntersectionObserver === "undefined") return;
    if (prefersReducedMotion() || savingData()) return;

    video.muted = true;
    const root = video.closest(".pane-scroll");
    let loaded = false;
    let showing = false;

    const load = () => {
      if (loaded) return;
      loaded = true;
      video.preload = "auto";
      video.src = src;
    };
    const play = () => {
      load();
      // Refused autoplay leaves the poster, which is a fine picture.
      void video.play().catch(() => {});
    };

    const near = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        load();
        near.disconnect();
      },
      { root, rootMargin: "60% 60% 60% 60%" },
    );
    const visible = new IntersectionObserver(
      ([entry]) => {
        showing = Boolean(entry && entry.intersectionRatio >= 0.35);
        if (showing && !document.hidden) play();
        else video.pause();
      },
      { root, threshold: [0, 0.35, 0.6] },
    );
    const onVisibility = () => {
      if (document.hidden) video.pause();
      else if (showing) play();
    };

    near.observe(video);
    visible.observe(video);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      near.disconnect();
      visible.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      video.pause();
    };
  }, [src]);

  return (
    <video
      ref={ref}
      poster={poster}
      muted
      loop
      playsInline
      preload="none"
      disablePictureInPicture
      disableRemotePlayback
      aria-hidden
      tabIndex={-1}
      className={cn("pointer-events-none bg-fg/10 object-cover", className)}
    />
  );
}
