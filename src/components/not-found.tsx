import { Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, CircleHelp, MessageCircle } from "lucide-react";
import { PublicLayout } from "@/components/public-layout";

const PLACES = [
  { to: "/", label: "Open the reader", body: "Pick up where you left off.", icon: BookOpen },
  { to: "/help", label: "Browse help", body: "Short answers, searchable.", icon: CircleHelp },
  { to: "/support", label: "Tell us", body: "If a link brought you here, we want to know.", icon: MessageCircle },
] as const;

/**
 * A missing page that still takes you somewhere.
 *
 * Every screen should answer where you are and where you can go. A dead end
 * that only says "not found" answers neither, so this offers the three places
 * someone who got lost most likely wanted.
 */
export function NotFound() {
  return (
    <PublicLayout
      eyebrow="Page not found"
      title="This page has wandered off."
      lead="It may have moved, or the link may be mistyped. Nothing you saved is affected."
    >
      <ul className="grid gap-3 sm:grid-cols-3">
        {PLACES.map(({ to, label, body, icon: Icon }) => (
          <li key={to}>
            <Link
              to={to}
              className="group flex h-full flex-col rounded-2xl bg-surface p-5 shadow-border transition-[transform,box-shadow] duration-200 ease-[var(--ease-out)] hover:shadow-[0_0_0_1px_rgba(22,22,21,0.07),0_14px_30px_-16px_rgba(22,22,21,0.28)] active:scale-[0.985]"
            >
              <span className="grid size-10 place-items-center rounded-xl bg-accent/10 text-accent">
                <Icon size={18} aria-hidden />
              </span>
              <span className="mt-5 flex items-center gap-1.5 text-[15px] font-semibold tracking-[-0.01em] text-fg">
                {label}
                <ArrowRight
                  size={14}
                  aria-hidden
                  className="transition-transform duration-200 ease-[var(--ease-out)] group-hover:translate-x-0.5"
                />
              </span>
              <span className="mt-1 text-sm leading-snug text-muted">{body}</span>
            </Link>
          </li>
        ))}
      </ul>
    </PublicLayout>
  );
}
