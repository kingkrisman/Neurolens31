import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { CircleHelp, LogOut, Palette, UserRound } from "lucide-react";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/auth/user-avatar";
import { PROVIDER_LABEL, signOut, useAuthUser } from "@/lib/auth-ui/session";

/**
 * The header's account control: a sign-in button, or the person's badge.
 *
 * Signed out it is a quiet outline button — the way in to an account, so
 * asking for one should not be the loudest thing on screen. Signed
 * in it becomes a face, because a face is recognised faster than a name, and the
 * menu behind it holds the few things a person looks for under their own
 * picture.
 */
export function HeaderAccount() {
  const user = useAuthUser();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);

  if (!user) {
    return (
      <Button asChild variant="outline" size="sm" className="shrink-0">
        <Link to="/login">Sign in</Link>
      </Button>
    );
  }

  const firstName = user.name.split(/\s+/)[0] ?? user.name;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Account menu for ${user.name}`}
          className="group flex h-9 shrink-0 items-center gap-2 rounded-full py-0.5 pr-0.5 pl-0.5 transition-[background-color] duration-150 hover:bg-fg/6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg sm:pl-3"
        >
          <span className="hidden max-w-28 truncate text-sm font-medium sm:inline">
            {firstName}
          </span>
          <UserAvatar seed={user.avatarSeed} size={32} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-64 p-1.5">
        <div className="flex items-center gap-3 px-2 pt-1.5 pb-3">
          <UserAvatar seed={user.avatarSeed} size={40} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
        </div>
        <div className="border-t border-fg/10 pt-1">
          <DropdownMenuItem onSelect={() => void navigate({ to: "/account" })}>
            <UserRound size={14} aria-hidden />
            Account
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void navigate({ to: "/account", hash: "avatar" })}>
            <Palette size={14} aria-hidden />
            Customise avatar
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void navigate({ to: "/help" })}>
            <CircleHelp size={14} aria-hidden />
            Help
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={leaving}
            onSelect={async () => {
              setLeaving(true);
              track("auth", { action: "sign_out", provider: user.provider });
              await signOut();
              setLeaving(false);
            }}
          >
            <LogOut size={14} aria-hidden />
            {leaving ? "Signing out…" : "Sign out"}
          </DropdownMenuItem>
        </div>
        <p className="border-t border-fg/10 px-2 pt-2 pb-1 text-[11px] text-subtle">
          Signed in with {PROVIDER_LABEL[user.provider]}
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
