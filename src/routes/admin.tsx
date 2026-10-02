import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, BarChart3, LoaderCircle, Lock, PenLine } from "lucide-react";
import { useEffect, useState } from "react";
import { Mark } from "@/components/mark";
import { signInWith, useAuthStatus } from "@/lib/auth-ui/session";
import { amAdmin } from "@/lib/blog";
import { seo } from "@/lib/seo";
import { cn } from "@/lib/utils";

/**
 * The admin area: analytics and the blog.
 *
 * The check here only decides what to draw. What is actually protected — the
 * analytics, writing posts, uploading pictures — is refused by the database
 * to anyone who is not in `app_admins` (supabase/migrations/0004_admin_blog.sql),
 * so a visitor who edits this page in their browser gets empty answers.
 */
export const Route = createFileRoute("/admin")({
  head: () => seo({ title: "Admin", path: "/admin", noindex: true }),
  component: AdminLayout,
});

type Access = "checking" | "signed-out" | "refused" | "admin";

function AdminLayout() {
  const { user, loading } = useAuthStatus();
  const [access, setAccess] = useState<Access>("checking");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setAccess("signed-out");
      return;
    }
    let live = true;
    setAccess("checking");
    void amAdmin().then((ok) => {
      if (live) setAccess(ok ? "admin" : "refused");
    });
    return () => {
      live = false;
    };
  }, [user, loading]);

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-30 border-b border-fg/8 bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 text-sm font-semibold">
            <Mark className="size-6" />
            <span>NeuroLens</span>
            <span className="rounded-md bg-fg/6 px-1.5 py-0.5 text-[11px] font-medium tracking-wide text-muted uppercase">
              Admin
            </span>
          </Link>
          {access === "admin" ? (
            <nav aria-label="Admin" className="ml-2 flex items-center gap-1">
              <AdminTab to="/admin" icon={BarChart3} label="Analytics" exact />
              <AdminTab to="/admin/blog" icon={PenLine} label="Blog" />
            </nav>
          ) : null}
          <Link
            to="/blog"
            className="ml-auto hidden items-center gap-1 text-sm text-muted hover:text-fg sm:inline-flex"
          >
            View blog <ArrowUpRight size={14} aria-hidden />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        {access === "admin" ? (
          <Outlet />
        ) : access === "checking" ? (
          <p className="flex items-center gap-2 text-sm text-muted" role="status">
            <LoaderCircle size={16} className="animate-spin" aria-hidden /> Checking your access…
          </p>
        ) : (
          <div className="mx-auto mt-10 max-w-md rounded-2xl bg-surface p-7 text-center shadow-border">
            <span className="mx-auto grid size-10 place-items-center rounded-full bg-fg/6 text-muted">
              <Lock size={18} aria-hidden />
            </span>
            <h1 className="mt-4 text-lg font-semibold">
              {access === "signed-out" ? "Sign in to continue" : "This area is for the NeuroLens admin"}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {access === "signed-out"
                ? "Sign in with the account that runs NeuroLens."
                : "You are signed in, but this account is not an admin."}
            </p>
            {access === "signed-out" ? (
              // Signs in from here, so Google sends you back to /admin rather
              // than to the reader's sign-in page and on into the app.
              <button
                type="button"
                onClick={() => void signInWith("google").catch(() => {})}
                className="mt-5 inline-flex h-10 items-center rounded-full bg-fg px-5 text-sm font-semibold text-bg hover:opacity-90"
              >
                Sign in with Google
              </button>
            ) : (
              <Link
                to="/"
                className="mt-5 inline-flex h-10 items-center rounded-full bg-fg px-5 text-sm font-semibold text-bg hover:opacity-90"
              >
                Back to NeuroLens
              </Link>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function AdminTab({
  to,
  icon: Icon,
  label,
  exact = false,
}: {
  to: "/admin" | "/admin/blog";
  icon: typeof BarChart3;
  label: string;
  exact?: boolean;
}) {
  return (
    <Link
      to={to}
      activeOptions={{ exact }}
      className={cn("inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-muted transition-colors hover:text-fg")}
      activeProps={{ className: "bg-fg/7 text-fg font-medium" }}
    >
      <Icon size={15} aria-hidden />
      {label}
    </Link>
  );
}
