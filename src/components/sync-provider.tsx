import { useEffect } from "react";
import { useAuthStatus } from "@/lib/auth-ui/session";
import { startSync, stopSync } from "@/lib/sync/engine";
import { armSync } from "@/lib/sync/notify";

/**
 * Starts and stops syncing with the reader's session.
 *
 * Renders nothing. It exists so the engine is driven by one subscription in one
 * place, rather than by whichever component happened to notice the sign-in
 * first — two of those would mean two pulls racing to write the same store.
 *
 * `armSync` comes first and is cleared last, so an edit made in the moment
 * between the session resolving and the first pull finishing is still queued.
 * The alternative loses exactly the writes made by the fastest readers.
 */
export function SyncProvider() {
  const { user, loading } = useAuthStatus();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      // Signed out: stop queueing, and stop holding a previous reader's state.
      armSync(false);
      stopSync();
      return;
    }

    armSync(true);
    void startSync(user.id);

    return () => {
      armSync(false);
      stopSync();
    };
  }, [user, loading]);

  return null;
}
