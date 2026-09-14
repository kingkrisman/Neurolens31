import { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ShieldCheck, KeyRound, CloudOff } from "lucide-react";
import { Mark } from "@/components/mark";
import { Card } from "@/components/ui/surfaces";
import { PageEnter } from "@/components/gsap-motion";
import { ProviderMark } from "@/components/auth/provider-mark";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/login")({ component: Login });

/**
 * Sign in.
 *
 * `SIGN_IN_PATH` has pointed at `/login` since the auth layer was written, and
 * nothing answered there — every redirect to sign in landed on a missing page.
 *
 * No password field, deliberately. A password is one more thing to remember and
 * one more thing to lose, and for an app whose readers are here because
 * remembering is expensive, that is the wrong trade. The identity is borrowed
 * from an account the reader already has.
 */
function Login() {
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(providerId: string, label: string) {
    setError(null);
    setBusy(providerId);
    try {
      await signIn(providerId, { callbackURL: "/" });
    } catch (err) {
      // Sign-in that fails has to say so here. It opens a popup or leaves the
      // page, and a silent failure just returns the reader to a page that looks
      // like they never pressed anything.
      setError(err instanceof Error ? err.message : `Could not continue with ${label}.`);
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
        className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-16 outline-none sm:px-8"
      >
        <PageEnter>
          <div data-enter className="flex flex-col items-center text-center">
            <Link to="/" aria-label="NeuroLens home" className="icon-group">
              <Mark detail className="size-12 text-fg" />
            </Link>
            <p className="mt-6 font-serif text-base text-accent italic">Welcome back</p>
            <h1 className="mt-2 text-4xl leading-tight">Sign in to NeuroLens</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Your books, highlights and reading profile follow you between devices.
            </p>
          </div>

          {/* The dev fallback is not a signed-in person — it is what stands in
              when sign-in is switched off. Treating it as signed in here showed
              "you are already signed in as Dev User" and hid the whole page. */}
          {user && !user.isDevFallback ? (
            <div data-enter>
              <Card className="mt-8 p-5 text-center">
                <p className="text-sm">
                  You are already signed in as{" "}
                  <span className="font-medium">{user.displayName ?? user.primaryEmail ?? "your account"}</span>.
                </p>
                <button
                  type="button"
                  onClick={() => void navigate({ to: "/" })}
                  className="mt-4 h-11 w-full rounded-md bg-fg px-4 text-sm font-medium text-bg"
                >
                  Continue reading
                </button>
                <Link to="/account" className="mt-3 inline-flex text-sm font-medium text-muted hover:text-fg">
                  Manage your account
                </Link>
              </Card>
            </div>
          ) : (
            <div data-enter className="mt-8 flex flex-col gap-2.5">
              {GROK_PROVIDERS.map((provider) => (
                <button
                  key={provider.providerId}
                  type="button"
                  disabled={busy !== null || isPending}
                  onClick={() => void start(provider.providerId, provider.label)}
                  className={cn(
                    "flex h-12 w-full items-center gap-3 rounded-md bg-surface px-4 text-sm font-medium shadow-border",
                    "transition-[background-color,transform] duration-[150ms] ease-[var(--ease-standard)]",
                    "hover:bg-fg/4 active:scale-[0.99]",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                  )}
                >
                  <ProviderMark idp={provider.idp} />
                  <span className="flex-1 text-left">
                    {busy === provider.providerId ? `Opening ${provider.label}…` : `Continue with ${provider.label}`}
                  </span>
                </button>
              ))}

              {error ? (
                <p role="alert" className="mt-1 text-xs leading-relaxed text-danger">
                  {error}
                </p>
              ) : null}

              {!authEnabled ? (
                <p className="mt-1 text-xs leading-relaxed text-subtle">
                  Sign-in is switched off in this build, so these open a demo account. Everything on
                  this page works the same once it is switched on.
                </p>
              ) : null}
            </div>
          )}

          <div data-enter>
            <ul className="mt-8 space-y-3 text-xs leading-relaxed text-muted">
              <li className="flex gap-2.5">
                <KeyRound size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                <span>
                  <span className="font-medium text-fg">No password to remember.</span> There is no
                  password to forget, reset, or have stolen from somewhere else.
                </span>
              </li>
              <li className="flex gap-2.5">
                <CloudOff size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                <span>
                  <span className="font-medium text-fg">Your books stay on your device.</span> Signing
                  in carries your settings across, not the documents you upload.
                </span>
              </li>
              <li className="flex gap-2.5">
                <ShieldCheck size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                <span>
                  <span className="font-medium text-fg">We never see your password.</span> Google and
                  Apple confirm it is you; NeuroLens only receives your name and email.
                </span>
              </li>
            </ul>

            <p className="mt-8 text-center text-xs leading-relaxed text-subtle">
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
            <p className="mt-4 text-center text-sm">
              <Link to="/" className="font-medium text-muted hover:text-fg">
                Keep reading without an account
              </Link>
            </p>
          </div>
        </PageEnter>
      </main>
    </div>
  );
}
