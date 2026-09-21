import { useEffect, useState, type ReactNode } from "react";
import { useAppStore } from "@/lib/store";
import { subscribeSync, syncState } from "@/lib/sync/engine";
import { OnboardingSurvey } from "@/components/onboarding-survey";

/**
 * Decides whether this account has ever been asked.
 *
 * Getting the *timing* right matters more than the survey itself. Three things
 * have to be true before it can show, and each one is a way of being wrong:
 *
 * **The store has hydrated.** Before that the profile is the built-in default,
 * which has no `onboardedAt`, so everyone looks new.
 *
 * **A sync has completed.** This is the one that matters. `onboardedAt` lives
 * on the profile and arrives from the account, so a returning reader signing in
 * on a second device looks brand new for as long as the pull takes. Asking them
 * five questions they already answered — and then overwriting the settings they
 * tuned — is the worst thing this component could do. A first-time sign-in is
 * always online (OAuth just completed), so waiting for the round trip costs
 * nothing in the case it exists for.
 *
 * **The library is empty.** A genuinely new account has no books. Somebody who
 * read on this device before accounts existed has a library adopted into their
 * first account along with settings they chose deliberately, and a survey would
 * offer to replace them. Better to skip the question than to undo their work.
 *
 * Renders children underneath either way, so the app is mounted and warm behind
 * the survey rather than starting from cold when it closes.
 */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const hydrated = useAppStore((s) => s.hydrated);
  const onboardedAt = useAppStore((s) => s.profile.onboardedAt);
  const hasBooks = useAppStore((s) => s.sessions.length > 0);

  const [synced, setSynced] = useState(() => syncState().lastSyncedAt !== null);
  useEffect(() => subscribeSync((state) => setSynced(state.lastSyncedAt !== null)), []);

  /**
   * Latched, so finishing the survey closes it and nothing re-opens it.
   *
   * `setProfile` writes `onboardedAt` and that alone would be enough — but it
   * goes through the store, the sync queue and back, and a survey that flickers
   * because a write is in flight is worse than one that simply closes.
   */
  const [dismissed, setDismissed] = useState(false);

  const ask = hydrated && synced && !onboardedAt && !hasBooks && !dismissed;

  return (
    <>
      {children}
      {ask ? <OnboardingSurvey onDone={() => setDismissed(true)} /> : null}
    </>
  );
}
