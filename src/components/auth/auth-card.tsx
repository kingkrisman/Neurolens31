import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { CloudOff, KeyRound, MailCheck, ShieldCheck } from "lucide-react";
import { Mark } from "@/components/mark";
import { PageEnter } from "@/components/gsap-motion";
import { Card } from "@/components/ui/surfaces";
import { UserAvatar } from "@/components/auth/user-avatar";
import {
  MIN_PASSWORD,
  requestPasswordReset,
  resendConfirmation,
  signInWithEmail,
  signUpWithEmail,
  useAuthUser,
} from "@/lib/auth-ui/session";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/**
 * Sign in and sign up, as one screen with two voices.
 *
 * `mode` changes the words rather than the machinery, because someone who has
 * never used the app goes looking for "create an account" and hesitates at a
 * page that only says "welcome back".
 *
 * Four states live here, and the third is the one password sign-in adds that
 * provider sign-in never had: an account can be created successfully and still
 * not be usable, because the address has to be confirmed first. Telling somebody
 * "welcome" and then refusing to let them in is the worst version of that, so a
 * successful sign-up goes to a screen whose entire job is "go and check your
 * email".
 */
type Stage =
  | { kind: "form" }
  | { kind: "confirm"; email: string }
  | { kind: "reset-sent"; email: string };

export function AuthCard({ mode }: { mode: "signin" | "signup" }) {
  const user = useAuthUser();
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>({ kind: "form" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const signup = mode === "signup";
  const copy = signup
    ? {
        eyebrow: "Get started",
        title: "Create your account",
        lead: "Your books, highlights and reading profile, on every device you read on.",
        submit: "Create account",
        switchPrompt: "Already have an account?",
        switchLink: "Sign in",
        switchTo: "/login" as const,
      }
    : {
        eyebrow: "Welcome back",
        title: "Sign in to NeuroLens",
        lead: "Pick up where you left off, on any device.",
        submit: "Sign in",
        switchPrompt: "New to NeuroLens?",
        switchLink: "Create an account",
        switchTo: "/signup" as const,
      };

  /**
   * Checked here so the reader is told before a round trip, not after.
   *
   * The form carries `noValidate`, so this is the only validation that speaks.
   * The browser's own bubbles fire first otherwise, and they differ between
   * browsers, vanish on a blur, and are awkward with a screen reader; these
   * report through one `role="alert"` that stays put. The `required`, `type` and
   * `minLength` attributes are still on the inputs — they carry the semantics
   * and the password-manager hints, just not the interface.
   */
  function localProblem(): string | null {
    if (!email.trim()) return "Enter your email address.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "That does not look like an email address.";
    if (!password) return "Enter your password.";
    if (signup && password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
    return null;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const problem = localProblem();
    if (problem) {
      setError(problem);
      return;
    }

    setBusy(true);
    try {
      if (signup) {
        const outcome = await signUpWithEmail(email, password);
        track("auth", { action: "sign_up", provider: "none" });
        if (outcome.status === "confirm") {
          setStage({ kind: "confirm", email: outcome.email });
        } else {
          await navigate({ to: "/" });
        }
      } else {
        await signInWithEmail(email, password);
        track("auth", { action: "sign_in", provider: "none" });
        await navigate({ to: "/" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  /** The way back in. Needs only the address, so the password field is ignored. */
  async function forgot() {
    setError(null);
    setNotice(null);
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter your email address first, and we will send a reset link.");
      return;
    }
    setBusy(true);
    try {
      await requestPasswordReset(email);
      setStage({ kind: "reset-sent", email: email.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the link. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resend(address: string) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await resendConfirmation(address);
      setNotice("Sent again. It can take a minute to arrive.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send it again.");
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
            <p className="mt-6 font-serif text-base text-accent italic">
              {stage.kind === "form" ? copy.eyebrow : "Almost there"}
            </p>
            <h1 className="mt-2 text-4xl leading-tight text-balance">
              {stage.kind === "form" ? copy.title : "Check your email"}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {stage.kind === "form" ? copy.lead : null}
            </p>
          </div>

          {user ? (
            <div data-enter>
              <Card className="mt-8 flex flex-col items-center p-6 text-center">
                <UserAvatar seed={user.avatarSeed} size={56} />
                <p className="mt-3 text-sm">
                  Signed in as <span className="font-medium">{user.name}</span>
                </p>
                <p className="text-xs text-muted">{user.email}</p>
                <button
                  type="button"
                  onClick={() => void navigate({ to: "/" })}
                  className="mt-5 h-11 w-full rounded-md bg-fg px-4 text-sm font-medium text-bg hover:opacity-90"
                >
                  Continue reading
                </button>
                <Link to="/account" className="mt-3 text-sm font-medium text-muted hover:text-fg">
                  Manage your account
                </Link>
              </Card>
            </div>
          ) : stage.kind !== "form" ? (
            <div data-enter>
              <Card className="mt-8 p-6">
                <span className="grid size-10 place-items-center rounded-full bg-accent/10 text-accent">
                  <MailCheck size={18} aria-hidden />
                </span>
                <p className="mt-4 text-sm leading-relaxed">
                  {stage.kind === "confirm" ? (
                    <>
                      We sent a link to <span className="font-medium">{stage.email}</span>. Open it
                      and your account is ready.
                    </>
                  ) : (
                    <>
                      If there is an account for{" "}
                      <span className="font-medium">{stage.email}</span>, a link to set a new
                      password is on its way.
                    </>
                  )}
                </p>
                <p className="mt-3 text-xs leading-relaxed text-subtle">
                  Nothing after a few minutes? Look in spam — and check the address above for a typo.
                </p>

                {notice ? (
                  <p role="status" className="mt-3 text-xs text-accent">
                    {notice}
                  </p>
                ) : null}
                {error ? (
                  <p role="alert" className="mt-3 text-xs leading-relaxed text-danger">
                    {error}
                  </p>
                ) : null}

                <div className="mt-5 flex flex-col gap-2">
                  {stage.kind === "confirm" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void resend(stage.email)}
                      className="h-11 rounded-md bg-bg px-4 text-sm font-medium text-fg shadow-border hover:bg-fg/5 disabled:opacity-60"
                    >
                      {busy ? "Sending…" : "Send it again"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setStage({ kind: "form" });
                      setError(null);
                      setNotice(null);
                    }}
                    className="h-11 rounded-md px-4 text-sm font-medium text-muted hover:text-fg"
                  >
                    Use a different address
                  </button>
                </div>
              </Card>
            </div>
          ) : (
            <form
              data-enter
              noValidate
              onSubmit={(event) => void submit(event)}
              className="mt-8 flex flex-col gap-3"
            >
              <div className="flex flex-col gap-1.5">
                <label htmlFor="auth-email" className="text-xs font-medium text-muted">
                  Email
                </label>
                <input
                  id="auth-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="h-12 rounded-md bg-surface px-4 text-[15px] shadow-border outline-none placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-fg/25"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <label htmlFor="auth-password" className="text-xs font-medium text-muted">
                    Password
                  </label>
                  {signup ? (
                    <span className="text-xs text-subtle">{MIN_PASSWORD} characters or more</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void forgot()}
                      disabled={busy}
                      className="text-xs font-medium text-muted underline underline-offset-2 hover:text-fg disabled:opacity-60"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <input
                  id="auth-password"
                  name="password"
                  type="password"
                  // Tells a password manager to offer a new one on sign-up and
                  // the saved one on sign-in — the wrong hint here is why
                  // managers so often fill the wrong field.
                  autoComplete={signup ? "new-password" : "current-password"}
                  required
                  minLength={signup ? MIN_PASSWORD : undefined}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={signup ? "Something only you would pick" : "Your password"}
                  className="h-12 rounded-md bg-surface px-4 text-[15px] shadow-border outline-none placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-fg/25"
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
                {busy ? "One moment…" : copy.submit}
              </button>

              <p className="mt-1 text-center text-sm text-muted">
                {copy.switchPrompt}{" "}
                <Link to={copy.switchTo} className="font-medium text-fg underline underline-offset-4">
                  {copy.switchLink}
                </Link>
              </p>
            </form>
          )}

          <div data-enter>
            <ul className="mt-9 space-y-3 border-t border-fg/10 pt-6 text-xs leading-relaxed text-muted">
              <li className="flex gap-2.5">
                <KeyRound size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                <span>
                  <span className="font-medium text-fg">Your password is never ours to lose.</span>{" "}
                  It is hashed before it is stored; NeuroLens cannot read it back.
                </span>
              </li>
              <li className="flex gap-2.5">
                <CloudOff size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                <span>
                  <span className="font-medium text-fg">Reading works offline.</span> Your library is
                  kept on the device as well as in your account.
                </span>
              </li>
              <li className="flex gap-2.5">
                <ShieldCheck size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                <span>
                  <span className="font-medium text-fg">Only your email.</span> No phone number, no
                  third party told you were here.
                </span>
              </li>
            </ul>

            <p className="mt-7 text-center text-xs leading-relaxed text-subtle">
              By continuing you agree to the{" "}
              <Link to="/terms" className="underline underline-offset-2 hover:text-fg">
                Terms
              </Link>{" "}
              and{" "}
              <Link to="/privacy" className="underline underline-offset-2 hover:text-fg">
                Privacy Policy
              </Link>
              .
            </p>
            <p className="mt-3 text-center text-sm">
              <Link to="/" className="font-medium text-muted hover:text-fg">
                Back to what NeuroLens does
              </Link>
            </p>
          </div>
        </PageEnter>
      </main>
    </div>
  );
}
