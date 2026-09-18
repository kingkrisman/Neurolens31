/**
 * Mount once in `__root.tsx` so the Grok preview chrome can drive navigation.
 *
 * Loaded on demand, and that is the whole point of this file. The bridge
 * validates incoming postMessages with zod, which is 35 KB gzipped, and it was
 * imported at the top of a component mounted in the root — so every visitor to
 * the deployed site downloaded a schema validator for a message channel that
 * only exists inside a preview iframe. It was a fifth of the entry chunk doing
 * nothing.
 *
 * `window.parent === window` is the same condition the bridge itself checks
 * first before returning a no-op, and it is free: a top-level page — every
 * real visit — never reaches the import at all.
 */

import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";

export function PreviewHostBridge() {
  const router = useRouter();

  useEffect(() => {
    // Not embedded, so there is no host to bridge to and nothing to load.
    if (typeof window === "undefined" || window.parent === window) return;

    // Set synchronously so a cleanup that runs before the import resolves is
    // not lost — an unmount mid-load would otherwise leave the listener on.
    let teardown: (() => void) | null = null;
    let cancelled = false;

    void import("@/lib/preview-host-bridge").then(
      ({ collectRoutePathsFromTree, installPreviewHostBridge }) => {
        if (cancelled) return;
        teardown = installPreviewHostBridge({
          navigate: (path) => {
            router.history.push(path);
          },
          getRoutePaths: () => collectRoutePathsFromTree(router.routeTree),
        });
      },
      () => {
        /* the chunk failed to load; the app is not in a preview, so nothing is lost */
      },
    );

    return () => {
      cancelled = true;
      teardown?.();
    };
  }, [router]);

  return null;
}
