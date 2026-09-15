import { Link, createFileRoute } from "@tanstack/react-router";
import { AlertCircle, BookOpen, Check, Copy, Database, FileWarning, Lightbulb, Mail, UserRound, Wrench } from "lucide-react";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { PublicLayout } from "@/components/public-layout";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/support")({ component: Support });

/**
 * Where support mail goes. A placeholder until there is an address meant to be
 * public: a personal address on a public page is scraped the day it ships.
 */
const SUPPORT_EMAIL = "support@neurolens.app";

const TOPICS: Array<{ id: string; label: string; icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }> }> = [
  { id: "broken", label: "Something is broken", icon: Wrench },
  { id: "file", label: "A file will not open", icon: FileWarning },
  { id: "reading", label: "Reading is still hard", icon: BookOpen },
  { id: "account", label: "Account or sign-in", icon: UserRound },
  { id: "idea", label: "An idea", icon: Lightbulb },
  { id: "other", label: "Something else", icon: AlertCircle },
];

/**
 * Support.
 *
 * There is no ticket server, and pretending otherwise on the one page whose job
 * is listening would be the worst possible failure: a form that silently drops
 * what someone wrote. So the message is written here, shown in full as it will
 * be sent, and handed to the reader's own mail app — nothing leaves until they
 * press send there.
 */
function Support() {
  const [topic, setTopic] = useState("broken");
  const [what, setWhat] = useState("");
  const [expected, setExpected] = useState("");
  const [copied, setCopied] = useState(false);
  const [touched, setTouched] = useState(false);

  // Read after mount: navigator does not exist during server rendering, and
  // reading it in render gave the server one answer and the browser another.
  const [details, setDetails] = useState("Collecting…");
  useEffect(() => setDetails(diagnostics()), []);

  const topicLabel = TOPICS.find((item) => item.id === topic)?.label ?? "Something else";
  const ready = what.trim().length >= 12;

  const body = useMemo(
    () =>
      [
        `Topic: ${topicLabel}`,
        "",
        "What happened:",
        what.trim() || "(not described)",
        "",
        "What I expected:",
        expected.trim() || "(not described)",
        "",
        "— technical details —",
        details,
      ].join("\n"),
    [topicLabel, what, expected, details],
  );

  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`NeuroLens — ${topicLabel}`)}&body=${encodeURIComponent(body)}`;

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(body);
    } catch {
      /* clipboard blocked — the preview is still selectable by hand */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <PublicLayout
      eyebrow="Support"
      title="Tell us what went wrong."
      wide
      lead={
        <>
          Write it the way you would say it. Most questions are answered faster in{" "}
          <Link to="/help" className="text-fg underline decoration-fg/30 underline-offset-4 hover:decoration-fg">
            Help
          </Link>
          , but if it is not there, this reaches a person.
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-start">
        <form
          className="space-y-8 rounded-3xl bg-surface p-6 shadow-border sm:p-8"
          onSubmit={(event) => event.preventDefault()}
        >
          <fieldset>
            <legend className="flex items-baseline gap-3">
              <StepNumber n={1} />
              <span className="doc-h3">What is this about?</span>
            </legend>
            <div role="radiogroup" aria-label="Topic" className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {TOPICS.map(({ id, label, icon: Icon }) => {
                const active = topic === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setTopic(id)}
                    className={cn(
                      "flex min-h-[4.5rem] flex-col items-start justify-between gap-2 rounded-xl p-3 text-left text-[13px] leading-snug",
                      "transition-[background-color,color,box-shadow,transform] duration-200 ease-[var(--ease-out)] active:scale-[0.97]",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
                      active
                        ? "bg-fg text-bg shadow-[0_8px_20px_-10px_rgba(22,22,21,0.45)]"
                        : "bg-bg text-fg shadow-border hover:bg-fg/5",
                    )}
                  >
                    <Icon size={16} aria-hidden />
                    <span className="font-medium">{label}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <Field
            n={2}
            id="support-what"
            label="What happened?"
            hint="What you were doing, and what the app did instead. If a message appeared, its exact words help most."
            value={what}
            onChange={setWhat}
            onBlur={() => setTouched(true)}
            rows={5}
            error={touched && !ready ? "A sentence or two is enough." : null}
          />

          <Field
            n={3}
            id="support-expected"
            label="What did you expect?"
            hint="Optional — it often decides whether this is a bug or a misunderstanding."
            value={expected}
            onChange={setExpected}
            rows={3}
          />
        </form>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <div className="overflow-hidden rounded-3xl bg-fg text-bg shadow-[0_24px_60px_-28px_rgba(22,22,21,0.55)]">
            <div className="flex items-center justify-between border-b border-bg/10 px-6 py-4">
              <p className="text-sm font-semibold">Your message</p>
              <p className="font-mono text-[11px] text-bg/50">to {SUPPORT_EMAIL}</p>
            </div>
            <div className="max-h-[22rem] overflow-auto px-6 py-5">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-bg/50 uppercase">Subject</p>
              <p className="mt-1 text-sm">NeuroLens — {topicLabel}</p>
              <p className="mt-5 text-[11px] font-semibold tracking-[0.14em] text-bg/50 uppercase">What happened</p>
              <p className={cn("mt-1 text-sm leading-relaxed whitespace-pre-wrap", !what.trim() && "text-bg/40")}>
                {what.trim() || "Start typing on the left…"}
              </p>
              {expected.trim() ? (
                <>
                  <p className="mt-5 text-[11px] font-semibold tracking-[0.14em] text-bg/50 uppercase">Expected</p>
                  <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">{expected.trim()}</p>
                </>
              ) : null}
              <details className="mt-5 group">
                <summary className="cursor-pointer text-[11px] font-semibold tracking-[0.14em] text-bg/50 uppercase marker:content-none">
                  Technical details <span className="normal-case tracking-normal text-bg/40">· attached automatically</span>
                </summary>
                <pre className="mt-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-bg/60">{details}</pre>
              </details>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-bg/10 p-4">
              {/* Always a real link with a destination. Without an href an <a>
                  is not a link at all: it drops out of the tab order and
                  assistive tech cannot announce it, so the one action on the
                  page would be unreachable by keyboard until it was ready. */}
              <a
                href={mailto}
                aria-disabled={!ready}
                onClick={(event) => {
                  if (!ready) {
                    event.preventDefault();
                    setTouched(true);
                    document.getElementById("support-what")?.focus();
                  }
                }}
                className={cn(
                  "inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-bg px-5 text-sm font-semibold text-fg",
                  "transition-[transform,opacity] duration-150 ease-[var(--ease-out)] active:scale-[0.97]",
                  !ready && "opacity-50",
                )}
              >
                <Mail size={15} aria-hidden />
                Open in mail
              </a>
              <button
                type="button"
                onClick={() => void copyAll()}
                className="relative inline-flex h-11 items-center justify-center gap-2 overflow-hidden rounded-full bg-bg/10 px-5 text-sm font-medium text-bg transition-[background-color,transform] duration-150 hover:bg-bg/15 active:scale-[0.97]"
              >
                <span
                  className={cn(
                    "inline-flex items-center gap-2 transition-[opacity,filter,transform] duration-200 ease-[var(--ease-out)]",
                    copied && "scale-95 opacity-0 blur-[3px]",
                  )}
                >
                  <Copy size={15} aria-hidden />
                  Copy
                </span>
                <span
                  aria-hidden={!copied}
                  className={cn(
                    "absolute inset-0 inline-flex items-center justify-center gap-2 transition-[opacity,filter,transform] duration-200 ease-[var(--ease-out)]",
                    copied ? "scale-100 opacity-100 blur-0" : "scale-105 opacity-0 blur-[3px]",
                  )}
                >
                  <Check size={15} aria-hidden />
                  Copied
                </span>
              </button>
            </div>
          </div>

          <p className="px-2 text-xs leading-relaxed text-subtle">
            Nothing is sent from this page. <span className="text-muted">Open in mail</span> starts a draft in
            your own mail app; <span className="text-muted">Copy</span> lets you paste it anywhere.
          </p>

          <Link
            to="/account"
            className="group flex items-start gap-3 rounded-2xl bg-surface p-4 shadow-border transition-[transform,box-shadow] duration-200 ease-[var(--ease-out)] active:scale-[0.985]"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
              <Database size={15} aria-hidden />
            </span>
            <span>
              <span className="block text-sm font-semibold text-fg">About your data?</span>
              <span className="mt-0.5 block text-sm leading-snug text-muted">
                Download or erase it yourself, instantly, from your account.
              </span>
            </span>
          </Link>
        </aside>
      </div>
    </PublicLayout>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-fg/8 font-mono text-[11px] font-semibold text-fg">
      {n}
    </span>
  );
}

function Field({
  n,
  id,
  label,
  hint,
  value,
  onChange,
  onBlur,
  rows,
  error = null,
}: {
  n: number;
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (next: string) => void;
  onBlur?: () => void;
  rows: number;
  error?: string | null;
}) {
  return (
    <div>
      <label htmlFor={id} className="flex items-baseline gap-3">
        <StepNumber n={n} />
        <span className="doc-h3">{label}</span>
      </label>
      <p id={`${id}-hint`} className="mt-1.5 pl-9 text-sm leading-relaxed text-muted">
        {hint}
      </p>
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
        aria-invalid={Boolean(error)}
        className={cn(
          "mt-3 w-full resize-y rounded-xl bg-bg px-4 py-3 text-[15px] leading-relaxed text-fg shadow-border placeholder:text-subtle",
          "transition-[box-shadow] duration-200 ease-[var(--ease-out)]",
          "focus:shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-fg)_28%,transparent),0_0_0_4px_color-mix(in_oklab,var(--color-fg)_6%,transparent)] focus:outline-none",
          error && "shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-danger)_45%,transparent)]",
        )}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * What a person cannot be expected to know about their own browser. Enough to
 * reproduce a fault; nothing about what anyone is reading.
 */
function diagnostics(): string {
  if (typeof window === "undefined") return "(collected in the browser)";
  const lines: string[] = [];
  const add = (key: string, value: unknown) => lines.push(`${key}: ${String(value)}`);
  add("app", "NeuroLens");
  add("page", window.location.origin);
  add("browser", navigator.userAgent);
  add("screen", `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio || 1}x`);
  add("language", navigator.language);
  add("online", navigator.onLine);
  try {
    add("reduced motion", window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    add("dark mode", window.matchMedia("(prefers-color-scheme: dark)").matches);
  } catch {
    /* matchMedia unavailable */
  }
  add("time", new Date().toISOString());
  return lines.join("\n");
}
