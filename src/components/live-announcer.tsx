import { useEffect, useState } from "react";
import { subscribeAnnounce } from "@/lib/announce";

/** Visually hidden polite live region for status messages (WCAG 4.1.3). */
export function LiveAnnouncer() {
  const [message, setMessage] = useState("");

  useEffect(() => {
    let frame = 0;
    const stop = subscribeAnnounce((next) => {
      setMessage("");
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setMessage(next));
    });
    return () => {
      cancelAnimationFrame(frame);
      stop();
    };
  }, []);

  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}
