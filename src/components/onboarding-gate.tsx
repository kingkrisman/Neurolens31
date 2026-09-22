import { useEffect, useState, type ReactNode } from "react";
import { useAppStore } from "@/lib/store";
import { subscribeSync, syncState, type SyncState } from "@/lib/sync/engine";
import { OnboardingSurvey } from "@/components/onboarding-survey";

/**
 * Decides whether this account has ever been asked.
 *
 * The flag lives on `meta`, not on the reading profile. It used to live on the
 * profile, and the survey came back on every refresh: a mode change rebuilds
 * the profile from a preset, a saved setup replaces it, and a sync pull
 * replaces the local copy with the server's — each one silently erased "has
 * been asked". See `lib/account-meta.ts`, where it is now merged instead.
 *
 * Asks only once three things are true:
 *
 * **The store has hydrated.** Before that, meta is empty and everyone looks new.
 *
 * **The account has had its say.** On a second device the flag arrives with the
 * first pull, so asking before then re-asks somebody who already answered. The
 * wait ends as soon as that pull lands — or, if sync cannot happen at all
 * (offline, or failing), as soon as that is known, so a broken server does not
 * hide the survey forever. A fixed timer is the last resort, and it is long
 * enough that an ordinary pull always wins the race: the first version of this
 * gave up after 2.5 seconds, and a slow pull on a returning account lost to it
 * and showed the survey to somebody who had already filled it in.
 *
 * **Nothing has been recorded.**
 *
 * The app underneath is mounted either way and made `inert` while the survey is
 * up, so keyboard and screen-reader users cannot tab out into a page they
 * cannot see.
 */

/** Longer than any healthy pull, shorter than anyone waits before giving up. */
const LAST_RESORT_MS = 8_000;

function accountHasAnswered(state: SyncState): boolean {
  return state.lastSyncedAt !== null || state.phase === "offline" || state.phase === "error";
}

export function OnboardingGate({ children }: { children: ReactNode }) {
  const hydrated = useAppStore((s) => s.hydrated);
  const onboardedAt = useAppStore((s) => s.meta.onboardedAt);

  const [settled, setSettled] = useState(() => accountHasAnswered(syncState()));
  useEffect(() => subscribeSync((state) => setSettled(accountHasAnswered(state))), []);

  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setGaveUp(true), LAST_RESORT_MS);
    return () => clearTimeout(timer);
  }, []);

  /**
   * Latched for this session, so answering closes it at once. The real record
   * is `meta.onboardedAt`, which the survey sets before calling this.
   */
  const [dismissed, setDismissed] = useState(false);

  const ask = hydrated && (settled || gaveUp) && !onboardedAt && !dismissed;

  return (
    <>
      <div inert={ask ? true : undefined} className="contents">
        {children}
      </div>
      {ask ? <OnboardingSurvey onDone={() => setDismissed(true)} /> : null}
    </>
  );
}
