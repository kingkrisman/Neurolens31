import { useEffect } from "react";
import { installGlobalReporter } from "@/lib/telemetry/errors";

/**
 * Listens for the crashes no error boundary sees.
 *
 * React boundaries catch faults thrown during render. They do not catch an
 * error in an event handler, a `setTimeout`, or a promise nobody awaited — and
 * the sync engine is almost entirely promises. Those went to the console and
 * nowhere else.
 *
 * Renders nothing, and mounts in the root so it is listening before any route
 * has had a chance to fail.
 */
export function CrashReporter() {
  useEffect(() => installGlobalReporter(), []);
  return null;
}
