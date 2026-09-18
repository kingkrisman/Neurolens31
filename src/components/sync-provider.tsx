import { useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { useAuthStatus } from "@/lib/auth-ui/session";
import { adoptLegacy, currentScope, setScope } from "@/lib/storage-scope";
import { startSync, stopSync } from "@/lib/sync/engine";
import { armSync } from "@/lib/sync/notify";

/**
 * Puts the right reader's data in front of the right reader, then syncs it.
 *
 * Renders nothing. It exists so this happens once, in one place — two
 * components noticing a sign-in would mean two pulls racing to write the same
 * store.
 *
 * Two things here are load-bearing, and both were learned the hard way.
 *
 * **It depends on the account's id, not on the user object.** Supabase hands
 * back a new object on every auth event, including the token refresh that
 * happens roughly hourly and when a tab regains focus. Depending on the object
 * meant this effect re-ran mid-read, re-scoped storage and emptied the book
 * somebody was reading — the page went to "0 words" while they were on it.
 *
 * **It re-reads storage only when the account actually changes.** Re-scoping is
 * destructive to what is on screen: the open book is cleared, because carrying
 * one account's reading into another's session is the fault this scoping exists
 * to prevent. That is right on a real switch and catastrophic on a refresh, so
 * the scope is compared before anything is touched.
 */
export function SyncProvider() {
  const { user, loading } = useAuthStatus();
  // The identity, not the object: this is what keeps a token refresh from
  // looking like a different person.
  const userId = user?.id ?? null;

  useEffect(() => {
    if (loading) return;

    if (!userId) {
      armSync(false);
      stopSync();
      // Back to the unscoped view, where a signed-out reader's data lives and
      // where anything from before accounts still is.
      setScope(null);
      return;
    }

    // Only when this is genuinely a different account. A refreshed token is the
    // same reader, and their open book must survive it.
    if (currentScope() !== userId) {
      setScope(userId);
      // The first account on a device inherits the library already being read
      // here; a second does not, because this only fires for an account with
      // nothing of its own.
      adoptLegacy(userId);
      useAppStore.getState().rehydrateForAccount();
    }

    armSync(true);
    void startSync(userId);

    return () => {
      armSync(false);
      stopSync();
    };
  }, [userId, loading]);

  return null;
}
