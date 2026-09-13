import { useEffect, useState } from "react";
import { playOpeningSting } from "@/lib/opening-sound";

const SEEN_KEY = "neurolens-opening-seen";

export function Opening() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(SEEN_KEY) === "1") return;

    setOpen(true);
    const close = () => {
      sessionStorage.setItem(SEEN_KEY, "1");
      setOpen(false);
    };
    const onFirstPointer = () => {
      void playOpeningSting();
    };
    window.addEventListener("pointerdown", onFirstPointer, { once: true });
    const timer = window.setTimeout(close, 480);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", onFirstPointer);
    };
  }, []);

  if (!open) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 bg-fg/10"
      role="status"
      aria-live="polite"
      aria-label="Loading NeuroLens"
    >
      <span className="boot-bar-fill block h-full origin-left bg-fg" />
    </div>
  );
}
