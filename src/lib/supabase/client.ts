import { createClient, type SupabaseClient, type Session, type User } from "@supabase/supabase-js";

/**
 * The one Supabase client.
 *
 * Created lazily and kept on `globalThis` rather than at module scope, because
 * dev HMR re-evaluates this module and a second client means a second auth
 * listener, a second token refresh timer, and two copies of the session racing
 * to write the same storage key.
 *
 * The anon key belongs in the browser — it is designed to be public, and it is
 * row-level security in the database, not this key, that decides who may read
 * what. See supabase/migrations: every table is `enable row level security`
 * with policies comparing `auth.uid()` to `user_id`. If those policies are ever
 * dropped, this key is an open door.
 */

const url = import.meta.env?.VITE_SUPABASE_URL ?? "";
const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? "";

/** Whether Supabase is configured at all. */
export const supabaseConfigured = Boolean(url && anonKey);

type Global = typeof globalThis & { __neurolensSupabase__?: SupabaseClient };

/**
 * Returns null when nothing is configured rather than throwing.
 *
 * A missing key is a deployment mistake, and the app should say so in one clear
 * place — see `SupabaseMissing` — instead of every call site exploding with a
 * different error that reads like a bug in the reader.
 */
export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfigured) return null;
  const globalRef = globalThis as Global;
  globalRef.__neurolensSupabase__ ??= createClient(url, anonKey, {
    auth: {
      // The session survives a reload and refreshes itself; without this a
      // reader is signed out whenever the access token expires mid-book.
      persistSession: true,
      autoRefreshToken: true,
      // OAuth comes back as a URL fragment that has to be read and cleared.
      detectSessionInUrl: true,
      storageKey: "neurolens-auth",
      flowType: "pkce",
    },
    global: {
      headers: { "x-client-info": "neurolens" },
    },
  });
  return globalRef.__neurolensSupabase__;
}

export type { Session, User };

/** The signed-in person, or null. Throws nothing; a failure reads as signed out. */
export async function currentUser(): Promise<User | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getUser();
    return data.user ?? null;
  } catch {
    return null;
  }
}
