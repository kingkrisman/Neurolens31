/**
 * Core Web Vitals, measured with the platform rather than a library.
 *
 * These are the three things Google actually ranks page experience on, and the
 * only way to know a real reader's numbers — as opposed to a lab score from a
 * fast machine on a fast connection — is to measure them on the device.
 *
 *   LCP  when the biggest thing on screen finished drawing
 *   INP  how long the page took to answer the slowest interaction
 *   CLS  how much the layout moved under the reader
 *
 * CLS matters here more than it does for most apps. Text shifting under
 * somebody with dyslexia or an attention difficulty does not merely look
 * untidy; it costs them their place on the line.
 *
 * Nothing is timed precisely on purpose. A raw LCP in milliseconds is close to
 * a fingerprint — it varies with device, network and moment — so each figure is
 * reduced to the band Google itself defines and the number is discarded. What
 * survives is "this page was slow for somebody", which is the only part worth
 * acting on.
 */
import { track } from "./analytics";

/** Google's published thresholds: at or under good, over poor, between is the middle. */
const THRESHOLDS = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  FCP: [1800, 3000],
  TTFB: [800, 1800],
} as const;

type Metric = keyof typeof THRESHOLDS;

function rate(metric: Metric, value: number): "good" | "needs-improvement" | "poor" {
  const [good, poor] = THRESHOLDS[metric];
  if (value <= good) return "good";
  return value <= poor ? "needs-improvement" : "poor";
}

/** Which part of the app this was measured in, as three coarse buckets. */
function view(): "home" | "reader" | "document" {
  if (typeof document === "undefined") return "home";
  if (document.querySelector(".reader-scroll")) return "reader";
  if (document.querySelector(".doc-body")) return "document";
  return "home";
}

function report(metric: Metric, value: number) {
  track("web_vital", { metric, rating: rate(metric, value), view: view() });
}

/**
 * Start watching. Returns a teardown.
 *
 * Everything is wrapped: PerformanceObserver throws on an entry type a browser
 * does not know, and a browser that cannot report INP should still report LCP
 * rather than failing the lot.
 */
export function startWebVitals(): () => void {
  if (typeof PerformanceObserver === "undefined") return () => {};

  const observers: PerformanceObserver[] = [];
  const observe = (type: string, callback: (entries: PerformanceEntryList) => void) => {
    try {
      const observer = new PerformanceObserver((list) => callback(list.getEntries()));
      observer.observe({ type, buffered: true } as PerformanceObserverInit);
      observers.push(observer);
    } catch {
      // This browser does not report that entry type. The rest still work.
    }
  };

  // LCP keeps being revised upward until the reader interacts, so only the last
  // value counts — reported once the page is actually finished being looked at.
  let lcp = 0;
  observe("largest-contentful-paint", (entries) => {
    const last = entries.at(-1);
    if (last) lcp = last.startTime;
  });

  // One observer, filtered by name: "paint" also carries first-paint, and
  // observing a `first-contentful-paint` type as well would report it twice.
  let reportedFcp = false;
  observe("paint", (entries) => {
    for (const entry of entries) {
      if (entry.name !== "first-contentful-paint" || reportedFcp) continue;
      reportedFcp = true;
      report("FCP", entry.startTime);
    }
  });

  observe("navigation", (entries) => {
    const nav = entries[0] as PerformanceNavigationTiming | undefined;
    if (nav) report("TTFB", nav.responseStart);
  });

  // CLS accumulates across the visit, but only within a session window: shifts
  // more than a second apart, or five seconds from the window's start, begin a
  // new one. The score is the worst window, not the total.
  let clsValue = 0;
  let windowValue = 0;
  let windowStart = 0;
  let windowLast = 0;
  observe("layout-shift", (entries) => {
    for (const entry of entries as Array<
      PerformanceEntry & { value: number; hadRecentInput: boolean }
    >) {
      // A shift the reader caused by interacting is not a shift under them.
      if (entry.hadRecentInput) continue;
      if (
        windowValue &&
        entry.startTime - windowLast < 1000 &&
        entry.startTime - windowStart < 5000
      ) {
        windowValue += entry.value;
      } else {
        windowValue = entry.value;
        windowStart = entry.startTime;
      }
      windowLast = entry.startTime;
      clsValue = Math.max(clsValue, windowValue);
    }
  });

  // INP is the worst interaction of the visit, not the first or the average.
  let inp = 0;
  observe("event", (entries) => {
    for (const entry of entries as Array<
      PerformanceEntry & { duration: number; interactionId?: number }
    >) {
      if (!entry.interactionId) continue;
      inp = Math.max(inp, entry.duration);
    }
  });

  /**
   * Reported when the page is hidden, not on unload.
   *
   * `visibilitychange` is the last event a mobile browser reliably fires — a
   * tab swiped away or an app switched out often never sees `unload` at all,
   * and those are exactly the visits where something was slow enough that the
   * reader gave up.
   */
  let sent = false;
  const flushVitals = () => {
    if (sent || document.visibilityState !== "hidden") return;
    sent = true;
    if (lcp) report("LCP", lcp);
    if (inp) report("INP", inp);
    // Reported even at zero: a visit with no shifts is the good case, and
    // leaving it out would make the numbers look worse than they are.
    report("CLS", clsValue);
    for (const observer of observers) observer.disconnect();
  };

  document.addEventListener("visibilitychange", flushVitals);
  return () => {
    document.removeEventListener("visibilitychange", flushVitals);
    for (const observer of observers) observer.disconnect();
  };
}
