import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Download, LogOut, Trash2, BookOpen, Clock, Highlighter } from "lucide-react";
import { Mark } from "@/components/mark";
import { Card } from "@/components/ui/surfaces";
import { PageEnter } from "@/components/gsap-motion";
import { UserAvatar } from "@/components/auth/user-avatar";
import { PROVIDER_LABEL, signOut, useAuthUser } from "@/lib/auth-ui/session";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/account")({ component: Account });

function Account() {
  // The same session the header badge reads, so the two can never disagree.
  const user = useAuthUser();
  const isPending = false;
  const sessions = useAppStore((s) => s.sessions);
  const highlights = useAppStore((s) => s.highlights);
  const clearData = useAppStore((s) => s.clearData);

  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const stats = useMemo(() => {
    const books = sessions.length;
    const marks = Object.values(highlights).reduce((total, list) => total + list.length, 0);
    const minutes = sessions.reduce((total, session) => {
      const words = session.content?.trim() ? session.content.trim().split(/\s+/).length : 0;
      return total + Math.round(((words * (session.progress ?? 0)) / 220) || 0);
    }, 0);
    return { books, marks, minutes };
  }, [sessions, highlights]);

  /**
   * Everything this app holds about the reader, as one file.
   *
   * Built here rather than asked of a server because there is no server holding
   * it — the books, marks and settings are in this browser, and a reader who
   * wants to leave should be able to take them without asking anyone.
   */
  function exportData() {
    const payload = {
      exportedAt: new Date().toISOString(),
      app: "NeuroLens",
      account: user ? { name: user.name, email: user.email, provider: user.provider } : null,
      profile: useAppStore.getState().profile,
      sessions: useAppStore.getState().sessions,
      highlights: useAppStore.getState().highlights,
      bookmarks: useAppStore.getState().bookmarks,
      ink: useAppStore.getState().ink,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `neurolens-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function endSession() {
    setSignOutError(null);
    setSigningOut(true);
    try {
      await signOut();
    } catch (err) {
      // Deployed, only the server can end the session — so a failure here means
      // the reader is still signed in, and saying otherwise would be a lie.
      setSignOutError(err instanceof Error ? err.message : "Could not sign out. Try again.");
      setSigningOut(false);
    }
  }

  const name = user?.name ?? "Your account";

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <div className="grain" aria-hidden />

      <header className="material sticky top-0 z-40">
        <div className="flex h-16 items-center justify-between px-5 sm:px-8">
          <Link to="/" aria-label="NeuroLens home" className="icon-group flex items-center gap-2.5">
            <Mark detail className="size-9 text-fg sm:size-10" />
            <span className="text-sm font-medium">NeuroLens</span>
          </Link>
          <Link to="/" className="text-sm font-medium hover:opacity-70">
            Open reader
          </Link>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="mx-auto max-w-2xl px-5 py-14 outline-none sm:px-8">
        <PageEnter>
          <p data-enter className="font-serif text-base text-accent italic">Your account</p>
          <h1 data-enter className="mt-2 text-4xl leading-tight">{name}</h1>

          {isPending ? (
            <p data-enter className="mt-8 text-sm text-muted">Loading your account…</p>
          ) : !user ? (
            <div data-enter>
              <Card className="mt-8 p-6">
                <p className="text-sm leading-relaxed text-muted">
                  You are reading without an account. Everything still works — your books, marks and
                  settings are saved in this browser. Signing in carries them to your other devices.
                </p>
                <Link
                  to="/login"
                  className="mt-5 inline-flex h-11 items-center rounded-md bg-fg px-5 text-sm font-medium text-bg"
                >
                  Sign in
                </Link>
              </Card>
            </div>
          ) : (
            <>
              <div data-enter>
                <Card className="mt-8 flex items-center gap-4 p-5">
                  <UserAvatar seed={user.avatarSeed} size={56} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{user.name}</p>
                    <p className="truncate text-xs text-muted">{user.email}</p>
                    <p className="mt-1 text-[11px] text-subtle">
                      Signed in with {PROVIDER_LABEL[user.provider]} · since{" "}
                      {new Date(user.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </Card>
              </div>

              <div data-enter>
                <h2 className="mt-10 font-serif text-xl italic">Your reading</h2>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <Stat icon={BookOpen} value={stats.books} label={stats.books === 1 ? "book" : "books"} />
                  <Stat icon={Highlighter} value={stats.marks} label={stats.marks === 1 ? "mark" : "marks"} />
                  <Stat icon={Clock} value={stats.minutes} label="min read" />
                </div>
              </div>
            </>
          )}

          <div data-enter>
            <h2 className="mt-10 font-serif text-xl italic">Your data</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Your books, highlights, drawings and settings live in this browser. Nothing here is
              uploaded.
            </p>

            <div className="mt-4 space-y-2">
              <Row
                icon={Download}
                title="Download everything"
                detail="One JSON file with your books, marks, drawings and settings."
                action="Download"
                onAction={exportData}
              />

              <Row
                icon={Trash2}
                danger
                title="Erase everything on this device"
                detail={
                  confirmingClear
                    ? "This cannot be undone. Your books, marks and settings will be gone."
                    : "Removes every book, mark, drawing and setting from this browser."
                }
                action={confirmingClear ? "Yes, erase it all" : "Erase"}
                onAction={() => {
                  if (!confirmingClear) {
                    setConfirmingClear(true);
                    return;
                  }
                  clearData();
                  setConfirmingClear(false);
                }}
                secondary={confirmingClear ? { label: "Cancel", onAction: () => setConfirmingClear(false) } : undefined}
              />

              {user ? (
                <Row
                  icon={LogOut}
                  title="Sign out"
                  detail="Ends this session. Your data on this device is untouched."
                  action={signingOut ? "Signing out…" : "Sign out"}
                  onAction={() => void endSession()}
                  disabled={signingOut}
                />
              ) : null}
            </div>

            {signOutError ? (
              <p role="alert" className="mt-3 text-xs text-danger">
                {signOutError}
              </p>
            ) : null}
          </div>

          <div data-enter>
            <div className="mt-10 flex flex-wrap gap-x-5 gap-y-2 border-t border-fg/10 pt-6 text-sm text-muted">
              <Link to="/help" className="hover:text-fg">How to use NeuroLens</Link>
              <Link to="/support" className="hover:text-fg">Get help</Link>
              <Link to="/privacy" className="hover:text-fg">Privacy</Link>
              <Link to="/terms" className="hover:text-fg">Terms</Link>
            </div>
          </div>
        </PageEnter>
      </main>
    </div>
  );
}

function Stat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof BookOpen;
  value: number;
  label: string;
}) {
  return (
    <Card className="p-4">
      <Icon size={15} className="text-accent" aria-hidden />
      <p className="mt-2 font-serif text-2xl tabular-nums">{value.toLocaleString()}</p>
      <p className="text-xs text-muted">{label}</p>
    </Card>
  );
}

function Row({
  icon: Icon,
  title,
  detail,
  action,
  onAction,
  secondary,
  danger = false,
  disabled = false,
}: {
  icon: typeof Download;
  title: string;
  detail: string;
  action: string;
  onAction: () => void;
  secondary?: { label: string; onAction: () => void };
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <Card className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
      <Icon size={16} className={cn("shrink-0", danger ? "text-danger" : "text-accent")} aria-hidden />
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">{detail}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {secondary ? (
          <button
            type="button"
            onClick={secondary.onAction}
            className="h-9 rounded-md px-3 text-sm font-medium text-muted hover:bg-fg/6 hover:text-fg"
          >
            {secondary.label}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onAction}
          disabled={disabled}
          className={cn(
            "h-9 rounded-md px-3.5 text-sm font-medium shadow-border",
            "transition-[background-color] duration-[150ms] ease-[var(--ease-standard)]",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
            "disabled:cursor-not-allowed disabled:opacity-60",
            danger ? "bg-danger text-white hover:opacity-90" : "bg-surface hover:bg-fg/6",
          )}
        >
          {action}
        </button>
      </div>
    </Card>
  );
}
