import { LensLoader } from "@/components/ui/loader";
import { PublicHome } from "@/components/auth/public-home";
import { useAuthStatus, wasSignedInBefore } from "@/lib/auth-ui/session";
import { useEffect, useState, type ReactNode } from "react";

/**
 * Stands in front of the app itself.
 *
 * Reading now needs an account, so the reader, the library and everything that
 * writes to it wait behind this. Three states, and the difference between them
 * matters:
 *
 *  - not yet known — Supabase resolves the session asynchronously, and showing
 *    a sign-in wall to somebody who is already signed in, for the half second
 *    before the answer arrives, is the worst of the three. So it waits.
 *  - not configured — no Supabase URL or key. That is a deployment fault, and
 *    saying "sign in" would send people to a page that cannot work either.
 *  - signed out — the actual wall.
 *
 * The public pages (help, privacy, terms, accessibility) are deliberately not
 * behind this. They are the pages search engines index and the pages somebody
 * reads while deciding whether to sign up at all.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading, configured } = useAuthStatus();

  /**
   * Read after mount, never during the first render.
   *
   * The server has no localStorage, so a first render that consulted this would
   * disagree with the server's and break hydration. False on both sides first,
   * then corrected.
   */
  const [returning, setReturning] = useState(false);
  useEffect(() => setReturning(wasSignedInBefore()), []);

  if (!configured) return <SupabaseMissing />;

  if (loading) {
    // The important half of this branch is the `else`: the server renders it,
    // so the home page a crawler is served is the marketing page rather than a
    // spinner. A spinner was what this did first, and it would have undone
    // every description, heading and piece of structured data on the site.
    return returning ? (
      <div className="flex min-h-dvh items-center justify-center bg-bg text-fg">
        <LensLoader label="Opening your library" />
      </div>
    ) : (
      <PublicHome />
    );
  }

  if (!user) return <SignedOut />;

  return <>{children}</>;
}

/**
 * The whole landing page, with sign-up where the reader would be.
 *
 * Not a sign-in wall. A wall at `/` would be the page Google indexes and the
 * page anybody arriving from a search result meets — so the product would be
 * represented, everywhere, by a screen that says nothing about it. Instead the
 * marketing page renders in full and only the part that needs an account is
 * swapped, which keeps one copy of the words rather than a landing page and a
 * separate description of it that drift apart.
 */
function SignedOut() {
  return <PublicHome />;
}

/**
 * Shown when the keys are missing.
 *
 * Deliberately not dressed up as a sign-in page: somebody arriving here cannot
 * fix it by signing in, and a wall that cannot be passed is worse than a plain
 * statement of what is wrong. The detail is for whoever deployed it; the first
 * line is for whoever is just trying to read.
 */
function SupabaseMissing() {
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5 py-14 sm:px-8">
        <p className="doc-eyebrow">Not configured</p>
        <h1 className="mt-4 font-serif text-3xl tracking-[-0.02em] sm:text-4xl">
          NeuroLens cannot reach its database.
        </h1>
        <p className="mt-5 text-[15px] leading-relaxed text-pretty text-muted">
          This is a configuration problem on our side, not something you did. Nothing you have saved
          is affected.
        </p>
        <div className="mt-8 rounded-2xl bg-surface p-5 shadow-border">
          <p className="text-sm font-medium">If this is your deployment</p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Set <code className="font-mono text-[13px] text-fg">VITE_SUPABASE_URL</code> and{" "}
            <code className="font-mono text-[13px] text-fg">VITE_SUPABASE_ANON_KEY</code>, then
            redeploy. Both are safe to expose; row-level security is what protects the data.
          </p>
        </div>
      </main>
    </div>
  );
}
