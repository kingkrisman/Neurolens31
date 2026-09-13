import { useEffect } from "react";

/**
 * Register the service worker, in production only.
 *
 * Not in dev: Vite serves modules unbundled and rewrites them constantly, and a
 * worker sitting in front of that will happily serve yesterday's module graph
 * and produce failures that look like code bugs. The offline story is a
 * property of the built app, so it is tested against the built app.
 *
 * Registration is deferred to `load` so it never competes with the first paint
 * — the point is to help the *second* visit, and it should cost the first one
 * nothing.
 */
export function OfflineReady() {
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // A failed registration is not worth surfacing: everything still works,
        // it just works online-only.
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}

/**
 * The escape hatch.
 *
 * If a release ever ships a worker that serves a broken shell, visitors have no
 * obvious way out — the bad worker answers before the network does. Exposing
 * this on `window` means a fix can be talked through with someone in a support
 * thread without asking them to find Application → Storage in devtools.
 */
if (typeof window !== "undefined") {
  (window as unknown as { nlDisableOffline?: () => void }).nlDisableOffline = () => {
    navigator.serviceWorker?.controller?.postMessage("nl-unregister");
    void navigator.serviceWorker?.getRegistrations().then((all) => {
      for (const registration of all) void registration.unregister();
    });
  };
}
