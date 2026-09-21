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
 * There used to be a third condition — an empty library — and it is gone; see
 * the note on `ask` below for why.
 *
 * Renders children underneath either way, so the app is mounted and warm behind
 * the survey rather than starting from cold when it closes, and marks them
 * `inert` while it is up so "underneath" means underneath for the keyboard and
 * a screen reader too.
 *
 * None of this is worth much on its own: this component was correct and
 * mounted nowhere for two releases, because the home route imported it and
 * never placed it in the JSX. `tests/onboarding.spec.ts` loads the real route
 * as a signed-in reader, which is the only thing that would have noticed.
 */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const hydrated = useAppStore((s) => s.hydrated);
  const onboardedAt = useAppStore((s) => s.profile.onboardedAt);

  const [synced, setSynced] = useState(() => syncState().lastSyncedAt !== null);
  useEffect(() => subscribeSync((state) => setSynced(state.lastSyncedAt !== null)), []);

  /**
   * Give up waiting for the sync after a moment.
   *
   * Waiting for the account's settings is right, but waiting *indefinitely*
   * turns any sync problem into a survey that silently never appears — which
   * is exactly what happened: with the deployed Supabase URL misspelled, the
   * pull could never complete and the survey was suppressed forever, with no
   * error and nothing to notice. A condition that can only ever be met by a
   * healthy server is a feature that disappears when the server is not.
   *
   * Two and a half seconds is longer than a pull takes and shorter than it
   * takes to find a book and upload it, so the ordinary case still waits for
   * the real answer.
   */
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), 2_500);
    return () => clearTimeout(timer);
  }, []);

  /**
   * Latched, so finishing the survey closes it and nothing re-opens it.
   *
   * `setProfile` writes `onboardedAt` and that alone would be enough — but it
   * goes through the store, the sync queue and back, and a survey that flickers
   * because a write is in flight is worse than one that simply closes.
   */
  const [dismissed, setDismissed] = useState(false);

  /**
   * An existing library is no longer a reason not to ask.
   *
   * It used to be: somebody who read here before accounts existed has their
   * library adopted into their first account along with settings they chose,
   * and a survey would offer to replace them. But that guard also silenced the
   * survey for anyone who opened a book before it appeared — and for every
   * account that already had one, which is most of the ones anybody would test
   * with. It protected a rare reader by breaking the feature for the common one.
   *
   * The protection moved somewhere better: the survey's last step shows exactly
   * what it is about to change and nothing is applied until it is accepted. A
   * reader with settings they like can see that and decline, which is more
   * respectful than never asking and far less fragile than guessing from the
   * shape of their library.
   */
  const ask = hydrated && (synced || waited) && !onboardedAt && !dismissed;

  return (
    <>
      {/* `inert` while the survey is up.
          The survey covers the app, but covering is only paint: without this
          the whole shell stays in the tab order and in the accessibility tree
          underneath it, so a keyboard or screen-reader user tabs straight out
          of the questions into a page they cannot see, and the document has two
          `h1`s — the survey's and the landing page's. Found exactly that way,
          by a test that asked for the heading and got two. */}
      <div inert={ask ? true : undefined} className="contents">
        {children}
      </div>
      {ask ? <OnboardingSurvey onDone={() => setDismissed(true)} /> : null}
    </>
  );
}
