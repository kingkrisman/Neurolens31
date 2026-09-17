import { useEffect } from "react";
import { startWebVitals } from "@/lib/web-vitals";

/**
 * Measures page experience for whoever is actually using the app.
 *
 * Renders nothing, and records nothing unless analytics has been turned on —
 * `track` drops the event otherwise, so this costs a few observers and no data
 * for anyone who said no.
 */
export function WebVitals() {
  useEffect(() => startWebVitals(), []);
  return null;
}
