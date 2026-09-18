import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { CloudOff, KeyRound, ShieldCheck } from "lucide-react";
import { Mark } from "@/components/mark";
import { PageEnter } from "@/components/gsap-motion";
import { Card } from "@/components/ui/surfaces";
import { ProviderMark } from "@/components/auth/provider-mark";
import { UserAvatar } from "@/components/auth/user-avatar";
import { PROVIDER_LABEL, signInWith, useAuthUser, type AuthProvider } from "@/lib/auth-ui/session";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/**
 * Google only, for now.
 *
 * Apple sign-in needs a paid Apple Developer account, an App ID, a Service ID
 * and a signing key, none of which exist yet — and a provider button that opens
 * a provider error is worse than one that is absent, particularly as the first
 * thing a new reader touches. `AuthProvider` still carries "apple", and the
 * styling for it is still below, so restoring it is this line.
 */
const PROVIDERS: AuthProvider[] = ["google"];

/**
 * Sign in and sign up, as one screen with two voices.
 *
 * With only provider sign-in there is no mechanical difference between the two:
 * the first time someone continues with a provider, an account is created. So
 * this is one component, and `mode` changes only the words — which still
 * matters, because someone who has never used the app goes looking for "create
 * an account" and hesitates at a page that only says "welcome back".
 */
export function AuthCard({ mode }: { mode: "signin" | "signup" }) {
  const user = useAuthUser();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<AuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const copy =
    mode === "signin"
      ? {
          eyebrow: "Welcome back",
          title: "Sign in to NeuroLens",
          lead: "Pick up where you left off, on any device.",
          verb: "Continue with",
          switchPrompt: "New to NeuroLens?",
          switchLink: "Create an account",
          switchTo: "/signup" as const,
        }
      : {
          eyebrow: "Get started",
          title: "Create your account",
          lead: "Your books, highlights and reading profile, on every device you read on.",
          verb: "Sign up with",
          switchPrompt: "Already have an account?",
          switchLink: "Sign in",
          switchTo: "/login" as const,
        };

  async function start(provider: AuthProvider) {
    setError(null);
    setBusy(provider);
    // Recorded before the redirect, not after: the browser is about to leave
    // for the provider and this page will not run again. The queue is on the
    // device, so the event survives the trip.
    track("auth", { action: mode === "signin" ? "sign_in" : "sign_up", provider });
    try {
      await signInWith(provider);
      // No navigation here. `signInWith` hands the browser to the provider;
      // the session arrives when they send it back, and the effect below is
      // what moves the reader on. Navigating now would race the redirect.
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : `Could not continue with ${PROVIDER_LABEL[provider]}. Try again.`,
      );
      setBusy(null);
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
            <p className="mt-6 font-serif text-base text-accent italic">{copy.eyebrow}</p>
            <h1 className="mt-2 text-4xl leading-tight text-balance">{copy.title}</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted">{copy.lead}</p>
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
          ) : (
            <div data-enter className="mt-8 flex flex-col gap-2.5">
              {PROVIDERS.map((provider) => (
                <button
                  key={provider}
                  type="button"
                  disabled={busy !== null}
                  aria-busy={busy === provider}
                  onClick={() => void start(provider)}
                  className={cn(
                    "relative flex h-12 w-full items-center justify-center gap-3 rounded-md px-4 text-sm font-medium",
                    "transition-[background-color,transform,opacity] duration-150 active:scale-[0.99]",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                    // Apple's guidelines call for a solid black or white button;
                    // Google's for white with its own mark. Both followed, in the
                    // page's own ink and paper so neither clashes with the theme.
                    provider === "apple"
                      ? "bg-fg text-bg hover:opacity-90"
                      : "bg-surface shadow-border hover:bg-fg/4",
                  )}
                >
                  <ProviderMark idp={provider} className="absolute left-4 size-5" />
                  <span>
                    {busy === provider
                      ? `Connecting to ${PROVIDER_LABEL[provider]}…`
                      : `${copy.verb} ${PROVIDER_LABEL[provider]}`}
                  </span>
                </button>
              ))}

              {error ? (
                <p role="alert" className="text-xs leading-relaxed text-danger">
                  {error}
                </p>
              ) : null}

              <p className="mt-1 text-center text-sm text-muted">
                {copy.switchPrompt}{" "}
                <Link
                  to={copy.switchTo}
                  className="font-medium text-fg underline underline-offset-4"
                >
                  {copy.switchLink}
                </Link>
              </p>
            </div>
          )}

          <div data-enter>
            <ul className="mt-9 space-y-3 border-t border-fg/10 pt-6 text-xs leading-relaxed text-muted">
              <li className="flex gap-2.5">
                <KeyRound size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                <span>
                  <span className="font-medium text-fg">No password.</span> Nothing to remember,
                  reset, or have stolen from somewhere else.
                </span>
              </li>
              <li className="flex gap-2.5">
                <CloudOff size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                <span>
                  <span className="font-medium text-fg">Your books stay on your device.</span> An
                  account carries your settings across, not the files you upload.
                </span>
              </li>
              <li className="flex gap-2.5">
                <ShieldCheck size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                <span>
                  <span className="font-medium text-fg">Only your name and email.</span> Google
                  confirms it is you; NeuroLens never sees your password.
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
            {/* Was "Keep reading without an account", which is no longer an
                option — reading needs one. It goes back to the page that
                explains the app, which is what somebody not ready to sign up
                actually wants. */}
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
