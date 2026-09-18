import { useEffect, useState } from "react";
import { getSupabase, supabaseConfigured, type User } from "@/lib/supabase/client";

/**
 * The signed-in person, from Supabase.
 *
 * This file used to be a stand-in: a localStorage key holding an invented user
 * so the signed-in interface could be designed before a backend existed. Its
 * own header said it must not ship. The shape it exposed is kept exactly —
 * `useAuthUser`, `signInWith`, `signOut`, `PROVIDER_LABEL` — so the header, the
 * account page and the sign-in cards did not have to change; only what sits
 * behind them did.
 *
 * What is different now, and matters:
 *
 *  - A session is a signed token from Supabase, not a value the browser can
 *    edit. Writing the old key by hand no longer signs anybody in.
 *  - Signing in leaves the page and comes back. The OAuth redirect is handled
 *    by the client (`detectSessionInUrl`), so `signInWith` resolves to nothing
 *    useful — the session arrives on the next load, through the listener.
 *  - The name and picture come from the provider, and may be absent. An account
 *    with neither still has to render, so both have fallbacks.
 */

export type AuthProvider = "google" | "apple";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  provider: AuthProvider;
  /** Seed for the generated avatar, so a person keeps the same face. */
  avatarSeed: string;
  createdAt: number;
}

export const PROVIDER_LABEL: Record<AuthProvider, string> = {
  google: "Google",
  apple: "Apple",
};

/**
 * Supabase's user, in the shape the interface already speaks.
 *
 * The avatar seed is the user id rather than the email: the id never changes,
 * and an email can — a person who changes theirs should not also lose the face
 * they have been reading next to.
 */
function toAuthUser(user: User | null): AuthUser | null {
  if (!user) return null;
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const provider = (user.app_metadata?.provider === "apple" ? "apple" : "google") as AuthProvider;
  const name =
    (typeof metadata.full_name === "string" && metadata.full_name) ||
    (typeof metadata.name === "string" && metadata.name) ||
    // Apple's private relay gives no name at all after the first sign-in.
    (user.email ? user.email.split("@")[0] : "") ||
    "Reader";
  return {
    id: user.id,
    name,
    email: user.email ?? "",
    provider,
    avatarSeed: user.id,
    createdAt: user.created_at ? Date.parse(user.created_at) : Date.now(),
  };
}

/**
 * The signed-in user, or null.
 *
 * Deliberately not `useSyncExternalStore`: Supabase resolves the session
 * asynchronously, so there is no snapshot to read on the first render. Null
 * until it answers — which is also what the server renders, so hydration
 * matches. Use `useAuthStatus` where the difference between "no account" and
 * "not known yet" matters, because showing a signed-out page to somebody who is
 * in fact signed in is its own kind of wrong.
 */
export function useAuthUser(): AuthUser | null {
  return useAuthStatus().user;
}

/**
 * A hint that this device has signed in before. Not a credential.
 *
 * The server cannot know who is asking, so the gate renders the public page
 * while the session is still resolving — otherwise every crawler, and every
 * first-time visitor, is served a loading spinner as the home page. For someone
 * who has signed in before, a flash of the marketing page on every load would
 * be its own insult, so this picks a loader for them instead.
 *
 * It grants nothing. Forging it shows a spinner to somebody who is not signed
 * in, and then the real session resolves and the public page appears anyway.
 */
const RETURNING_KEY = "neurolens-returning";

export function wasSignedInBefore(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(RETURNING_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberReturning(signedIn: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (signedIn) window.localStorage.setItem(RETURNING_KEY, "1");
    else window.localStorage.removeItem(RETURNING_KEY);
  } catch {
    /* private mode — the hint is optional */
  }
}

export type AuthStatus = {
  user: AuthUser | null;
  /** True until Supabase has reported one way or the other. */
  loading: boolean;
  /** No URL or key configured — a deployment problem, not a signed-out reader. */
  configured: boolean;
};

export function useAuthStatus(): AuthStatus {
  const [state, setState] = useState<AuthStatus>({
    user: null,
    loading: supabaseConfigured,
    configured: supabaseConfigured,
  });

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setState({ user: null, loading: false, configured: false });
      return;
    }

    let live = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!live) return;
      const user = toAuthUser(data.session?.user ?? null);
      rememberReturning(Boolean(user));
      setState({ user, loading: false, configured: true });
    });

    // Fires on sign-in, sign-out, token refresh, and in this tab when another
    // tab does any of them.
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!live) return;
      const user = toAuthUser(session?.user ?? null);
      rememberReturning(Boolean(user));
      setState({ user, loading: false, configured: true });
    });

    return () => {
      live = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return state;
}

/**
 * Begin an OAuth sign-in.
 *
 * Returns nothing: the browser leaves for the provider and comes back to
 * `redirectTo`, where the client reads the session out of the URL. Anything
 * this function returned would be read after the page had already gone.
 */
export async function signInWith(provider: AuthProvider): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Sign-in is not configured yet.");

  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      // Back to where they started, not always the home page — somebody who
      // signed in from the account page should land back on it.
      redirectTo: typeof window !== "undefined" ? window.location.origin + window.location.pathname : undefined,
      queryParams: provider === "google" ? { access_type: "offline", prompt: "consent" } : undefined,
    },
  });
  if (error) throw new Error(error.message);
}

export async function signOut(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.auth.signOut();
}
