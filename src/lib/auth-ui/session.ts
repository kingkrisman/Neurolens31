import { useSyncExternalStore } from "react";

/**
 * A stand-in session for designing the signed-in interface before a backend exists.
 *
 * Supabase is coming later. Until then the header, the badge, the account page
 * and the sign-in pages all need a "signed in" state to be built against, so
 * this keeps one in localStorage. Every function here is the seam Supabase
 * replaces: `signInWith` becomes `supabase.auth.signInWithOAuth`, `signOut`
 * becomes `supabase.auth.signOut`, and `useAuthUser` reads the Supabase session
 * instead of this key. Nothing else in the app should need to change.
 *
 * Nothing here authenticates anyone. It must not ship to production as-is.
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

const KEY = "neurolens-ui-session";
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function read(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

// useSyncExternalStore compares snapshots by identity, so the parsed object is
// cached against the raw string rather than re-parsed on every render.
let cachedRaw: string | null = null;
let cachedUser: AuthUser | null = null;

function snapshot(): AuthUser | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedUser = read();
  }
  return cachedUser;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab signing in or out updates this one too.
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The signed-in user, or null. Null on the server, so the first paint is signed out. */
export function useAuthUser(): AuthUser | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}

const SAMPLE: Record<AuthProvider, { name: string; email: string }> = {
  google: { name: "Amara Okafor", email: "amara.okafor@gmail.com" },
  apple: { name: "Amara Okafor", email: "amara@privaterelay.appleid.com" },
};

/**
 * Pretend to complete an OAuth round trip.
 *
 * The short delay is deliberate: the real flow leaves the page and comes back,
 * and a sign-in that resolves instantly would hide every loading state the
 * interface needs to handle.
 */
export async function signInWith(provider: AuthProvider): Promise<AuthUser> {
  await new Promise((resolve) => setTimeout(resolve, 700));
  const sample = SAMPLE[provider];
  const user: AuthUser = {
    id: `ui-${provider}`,
    name: sample.name,
    email: sample.email,
    provider,
    avatarSeed: sample.email,
    createdAt: Date.now(),
  };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(user));
  } catch {
    /* private mode — the session simply does not persist */
  }
  emit();
  return user;
}

export async function signOut(): Promise<void> {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing to remove */
  }
  emit();
}

export const PROVIDER_LABEL: Record<AuthProvider, string> = {
  google: "Google",
  apple: "Apple",
};
