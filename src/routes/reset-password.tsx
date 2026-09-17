import { useEffect, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";
import { Mark } from "@/components/mark";
import { PageEnter } from "@/components/gsap-motion";
import { Card } from "@/components/ui/surfaces";
import { LensLoader } from "@/components/ui/loader";
import { MIN_PASSWORD, updatePassword, useAuthStatus } from "@/lib/auth-ui/session";
import { seo } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    ...seo({
      title: "Set a new password",
      description: "Choose a new password for your NeuroLens account.",
      path: "/reset-password",
      noindex: true,
    }),
  }),
  component: ResetPassword,
});

/**
 * The second half of a password reset.
 *
 * Clicking the link in the email signs the reader in, briefly and for this
 * purpose only — Supabase calls it a recovery session. So arriving here with a
 * session is the proof that the link was genuine, and there is no token to
 * validate by hand.
 *
 * Which also means the failure to handle is arriving here *without* one: a link
 * that has expired, been used already, or been opened in a different browser
 * from the one that asked. That is a dead end, and saying so plainly beats a
 * form that accepts a new password and then cannot save it.
 */
function ResetPassword() {
  const { user, loading, configured } = useAuthStatus();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Sent onward once the password has actually changed, and not before.
  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(() => void navigate({ to: "/" }), 1600);
    return () => window.clearTimeout(timer);
  }, [done, navigate]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (password !== again) {
      setError("Those two do not match.");
      return;
    }
    setBusy(true);
    try {
      await updatePassword(password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the new password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <div className="grain" aria-hidden />

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-14 outline-none sm:px-8"
      >
        <PageEnter>
          <div data-enter className="flex flex-col items-center text-center">
            <Link to="/" aria-label="NeuroLens home" className="icon-group">
              <Mark detail className="size-12 text-fg" />
            </Link>
            <p className="mt-6 font-serif text-base text-accent italic">Password</p>
            <h1 className="mt-2 text-4xl leading-tight text-balance">
              {done ? "That is done" : "Set a new password"}
            </h1>
          </div>

          <div data-enter>
            {!configured ? (
              <Card className="mt-8 p-6 text-center">
                <p className="text-sm leading-relaxed text-muted">
                  Sign-in is not configured on this deployment, so a password cannot be changed here.
                </p>
              </Card>
            ) : loading ? (
              <div className="mt-10 flex justify-center">
                <LensLoader label="Checking your link" />
              </div>
            ) : done ? (
              <Card className="mt-8 p-6 text-center">
                <p className="text-sm leading-relaxed">
                  Your password is changed and you are signed in. Taking you to your library.
                </p>
                <Link
                  to="/"
                  className="mt-5 inline-flex h-11 items-center justify-center rounded-md bg-fg px-5 text-sm font-medium text-bg hover:opacity-90"
                >
                  Go now
                </Link>
              </Card>
            ) : !user ? (
              <Card className="mt-8 p-6">
                <p className="text-sm leading-relaxed">
                  This link cannot be used. Reset links work once, expire after a while, and only in
                  the browser that asked for them.
                </p>
                <p className="mt-3 text-xs leading-relaxed text-subtle">
                  Ask for a fresh one and open it in this browser.
                </p>
                <Link
                  to="/login"
                  className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-md bg-fg px-4 text-sm font-medium text-bg hover:opacity-90"
                >
                  Back to sign in
                </Link>
              </Card>
            ) : (
              <form noValidate onSubmit={(event) => void submit(event)} className="mt-8 flex flex-col gap-3">
                <p className="text-sm leading-relaxed text-muted">
                  Setting a new password for <span className="font-medium text-fg">{user.email}</span>.
                </p>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="new-password" className="text-xs font-medium text-muted">
                    New password
                  </label>
                  <input
                    id="new-password"
                    name="new-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={MIN_PASSWORD}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="h-12 rounded-md bg-surface px-4 text-[15px] shadow-border outline-none focus-visible:ring-2 focus-visible:ring-fg/25"
                  />
                  <span className="text-xs text-subtle">{MIN_PASSWORD} characters or more</span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="new-password-again" className="text-xs font-medium text-muted">
                    Again
                  </label>
                  <input
                    id="new-password-again"
                    name="new-password-again"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={again}
                    onChange={(event) => setAgain(event.target.value)}
                    className="h-12 rounded-md bg-surface px-4 text-[15px] shadow-border outline-none focus-visible:ring-2 focus-visible:ring-fg/25"
                  />
                </div>

                {error ? (
                  <p role="alert" className="text-xs leading-relaxed text-danger">
                    {error}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={busy}
                  aria-busy={busy}
                  className={cn(
                    "mt-1 h-12 rounded-md bg-fg px-4 text-sm font-semibold text-bg",
                    "transition-[transform,opacity] duration-150 ease-[var(--ease-out)] hover:opacity-90 active:scale-[0.99]",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                  )}
                >
                  {busy ? "Saving…" : "Save new password"}
                </button>
              </form>
            )}
          </div>

          <p data-enter className="mt-9 flex items-start gap-2.5 border-t border-fg/10 pt-6 text-xs leading-relaxed text-muted">
            <KeyRound size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden />
            <span>
              Changing your password signs out anywhere else you were signed in, which is the point
              if somebody else had it.
            </span>
          </p>
        </PageEnter>
      </main>
    </div>
  );
}
