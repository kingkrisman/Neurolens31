import { useEffect, useState } from "react";
import { getSupabase, supabaseConfigured, type User } from "@/lib/supabase/client";

/**
 * The signed-in person, from Supabase, by email and password.
 *
 * This was provider sign-in (Google, Apple) and before that a localStorage
 * stand-in. Password sign-in is less work to set up — no OAuth client, no
 * consent screen, no redirect URI to get wrong — but it moves work into the
 * app, and that is what most of this file is:
 *
 *  - A new account has to confirm its address before it can be used, so
 *    `signUpWithEmail` can succeed without producing a session. The interface
 *    has to say "check your email", not "you are in".
 *  - A forgotten password needs a way back, so there is a reset request and a
 *    reset completion, which are two different moments in two different page
 *    loads.
 *  - Supabase's errors are written for developers. They are translated here,
 *    once, rather than in every form that can hit them.
 */

/** Kept as a type because the account page and header still name it. */
export type AuthProvider = "email";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  provider: AuthProvider;
  /** Seed for the generated avatar, so a person keeps the same face. */
  avatarSeed: string;
  createdAt: number;
  /** False until the address has been confirmed. */
  confirmed: boolean;
}

export const PROVIDER_LABEL: Record<AuthProvider, string> = {
  email: "email",
};

/** The shortest password this app will accept. Supabase itself allows six. */
export const MIN_PASSWORD = 8;

function toAuthUser(user: User | null): AuthUser | null {
  if (!user) return null;
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const name =
    (typeof metadata.name === "string" && metadata.name.trim()) ||
    (user.email ? user.email.split("@")[0] : "") ||
    "Reader";
  return {
    id: user.id,
    name,
    email: user.email ?? "",
    provider: "email",
    // The id, not the email: an address can change, and changing it should not
    // also take away the face somebody has been reading next to.
    avatarSeed: user.id,
    createdAt: user.created_at ? Date.parse(user.created_at) : Date.now(),
    confirmed: Boolean(user.email_confirmed_at ?? user.confirmed_at),
  };
}

/**
 * Supabase's message, in the words of somebody trying to read a book.
 *
 * The originals name the mechanism ("Invalid login credentials", "User already
 * registered"), which tells a reader nothing about what to do next. Deliberately
 * vague about which half of a wrong sign-in was wrong: saying "no account with
 * that address" to anybody who asks turns the form into a way of testing
 * whether a given person has an account here.
 */
export function friendlyAuthError(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("invalid login credentials")) {
    return "That email and password do not match an account.";
  }
  if (text.includes("email not confirmed")) {
    return "Confirm your email first — check your inbox for the link we sent.";
  }
  if (text.includes("already registered") || text.includes("already been registered")) {
    return "There is already an account with that address. Try signing in instead.";
  }
  if (text.includes("password should be at least") || text.includes("password is too short")) {
    return `Use at least ${MIN_PASSWORD} characters.`;
  }
  if (text.includes("weak password") || text.includes("pwned")) {
    return "That password is too easy to guess. Try a longer one.";
  }
  if (text.includes("rate limit") || text.includes("too many requests")) {
    // Worth naming, because this project sends email through Supabase's own
    // sender, which allows only a few messages an hour.
    return "Too many attempts for now. Wait a few minutes and try again.";
  }
  if (text.includes("unable to validate email") || text.includes("invalid email")) {
    return "That does not look like an email address.";
  }
  if (text.includes("failed to fetch") || text.includes("networkerror")) {
    return "Could not reach the server. Check your connection.";
  }
  return message || "Something went wrong. Try again.";
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

    // Fires on sign-in, sign-out, token refresh, password recovery, and in this
    // tab when another tab does any of them.
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

/** The signed-in user, or null. Null while the session is still resolving. */
export function useAuthUser(): AuthUser | null {
  return useAuthStatus().user;
}

function client() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Sign-in is not configured yet.");
  return supabase;
}

/** Where Supabase should send somebody after they click a link in an email. */
function emailRedirect(path: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  return `${window.location.origin}${path}`;
}

export type SignUpOutcome =
  /** Confirmation is on: an email has gone out and there is no session yet. */
  | { status: "confirm"; email: string }
  /** Confirmation is off: they are signed in already. */
  | { status: "signed-in" };

/**
 * Create an account.
 *
 * Supabase answers the same way whether the address is new or already taken —
 * deliberately, so a sign-up form cannot be used to find out who has an
 * account. That means a "check your inbox" screen is the honest response to
 * both, and somebody who already had an account gets an email saying so.
 */
export async function signUpWithEmail(
  email: string,
  password: string,
  name?: string,
): Promise<SignUpOutcome> {
  const { data, error } = await client().auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: name?.trim() ? { name: name.trim() } : undefined,
      emailRedirectTo: emailRedirect("/"),
    },
  });
  if (error) throw new Error(friendlyAuthError(error.message));
  if (data.session) return { status: "signed-in" };
  return { status: "confirm", email: email.trim() };
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const { error } = await client().auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw new Error(friendlyAuthError(error.message));
}

/**
 * Ask for a reset link.
 *
 * Resolves the same way whether or not the address has an account, for the
 * reason above. The link lands on /reset-password, which is where the new
 * password is actually set.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await client().auth.resetPasswordForEmail(email.trim(), {
    redirectTo: emailRedirect("/reset-password"),
  });
  if (error) throw new Error(friendlyAuthError(error.message));
}

/** Set a new password. Only works while the recovery session is live. */
export async function updatePassword(password: string): Promise<void> {
  const { error } = await client().auth.updateUser({ password });
  if (error) throw new Error(friendlyAuthError(error.message));
}

/** Send the confirmation email again, for the one that never arrived. */
export async function resendConfirmation(email: string): Promise<void> {
  const { error } = await client().auth.resend({
    type: "signup",
    email: email.trim(),
    options: { emailRedirectTo: emailRedirect("/") },
  });
  if (error) throw new Error(friendlyAuthError(error.message));
}

export async function signOut(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.auth.signOut();
}
