import { useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { useAuthStatus } from "@/lib/auth-ui/session";
import { adoptLegacy, setScope } from "@/lib/storage-scope";
import { startSync, stopSync } from "@/lib/sync/engine";
import { armSync } from "@/lib/sync/notify";

/**
 * Puts the right reader's data in front of the right reader, then syncs it.
 *
 * Renders nothing. It exists so this happens once, in one place — two
 * components noticing a sign-in would mean two pulls racing to write the same
 * store.
 *
 * The order here is the fix for a real leak. Local storage belongs to the
 * browser rather than to an account, so before this, two people signing in on
 * one laptop shared one library: the second saw the first's books. Scope is
 * therefore set *before* anything reads storage, and the store is told to
 * re-read under it, so the previous reader's library is gone from view before
 * the new reader's arrives.
 *
 * Nothing is deleted to achieve that. Each account's data sits under its own
 * keys, so signing out and back in — or handing the laptop back — returns
 * exactly what was there, including books somebody chose not to upload.
 */
export function SyncProvider() {
  const { user, loading } = useAuthStatus();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      armSync(false);
      stopSync();
      // Back to the unscoped view, which is where a signed-out reader's data
      // lives and where anything from before accounts still is.
      setScope(null);
      return;
    }

    // Before the store reads anything.
    setScope(user.id);
    // The first account on a device inherits the library that was already being
    // read here; a second account does not, because this only fires for an
    // account with nothing of its own.
    adoptLegacy(user.id);
    useAppStore.getState().rehydrateForAccount();

    armSync(true);
    void startSync(user.id);

    return () => {
      armSync(false);
      stopSync();
    };
  }, [user, loading]);

  return null;
}
