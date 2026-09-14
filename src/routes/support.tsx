import { useEffect, useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Check, Copy, Mail } from "lucide-react";
import { PublicLayout } from "@/components/public-layout";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/support")({ component: Support });

/**
 * Where support mail goes.
 *
 * A placeholder on purpose. Putting a personal address on a public page is a
 * decision for whoever owns it, not one to make on their behalf — and once it
 * ships it cannot be taken back out of the archives that scrape it. Replace it
 * with an address meant to be public before this page goes live.
 */
const SUPPORT_EMAIL = "support@neurolens.app";

const TOPICS = [
  { id: "broken", label: "Something is broken" },
  { id: "file", label: "A file will not open" },
  { id: "reading", label: "Reading is still hard" },
  { id: "account", label: "Account or sign-in" },
  { id: "idea", label: "An idea for the app" },
  { id: "other", label: "Something else" },
] as const;

/**
 * Support.
 *
 * There is no server to post a ticket to, and pretending otherwise would be the
 * worst possible thing to do on this particular page — a contact form that
 * silently drops what someone wrote is how a person decides an app is not
 * listening. So the page composes the message and hands it over: a mail draft,
 * or the text on the clipboard for anywhere else.
 *
 * The technical details are gathered automatically because the answer to "what
 * browser are you on?" is the one thing nobody knows and everybody is asked.
 */
function Support() {
  const [topic, setTopic] = useState<string>("broken");
  const [what, setWhat] = useState("");
  const [expected, setExpected] = useState("");
  const [copied, setCopied] = useState(false);

  /**
   * Read after mount, not during render.
   *
   * These come from `navigator` and `window`, which do not exist when the page
   * is rendered on the server — so computing them during render gives the
   * server one answer and the browser another, and React throws the whole tree
   * away and rebuilds it. Collected in an effect instead, so both renders agree
   * and the details simply arrive a frame later.
   */
  const [details, setDetails] = useState("Collecting…");
  useEffect(() => setDetails(diagnostics()), []);

  const topicLabel = TOPICS.find((t) => t.id === topic)?.label ?? "Something else";

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

  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
    `NeuroLens — ${topicLabel}`,
  )}&body=${encodeURIComponent(body)}`;

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(body);
    } catch {
      /* clipboard blocked — the textarea below is still selectable by hand */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <PublicLayout
      eyebrow="Support"
      title="Tell us what went wrong."
      image="/images/cover-fast.jpg"
      imageAlt="A quiet desk with a notebook"
    >
      <p>
        Before anything else, it is worth checking{" "}
        <Link to="/help" className="text-fg underline underline-offset-2">
          how to use NeuroLens
        </Link>{" "}
        — most things people write in about are answered there, and faster.
      </p>

      <div className="not-prose mt-2 space-y-5">
        <fieldset>
          <legend className="text-sm font-medium text-fg">What is this about?</legend>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {TOPICS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={topic === item.id}
                onClick={() => setTopic(item.id)}
                className={cn(
                  "h-9 rounded-full px-3.5 text-sm shadow-border transition-colors duration-[150ms]",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
                  topic === item.id ? "bg-fg text-bg" : "bg-surface hover:bg-fg/6",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </fieldset>

        <Field
          id="support-what"
          label="What happened?"
          hint="What you were doing, and what the app did instead. If there was a message on screen, its exact words help most."
          value={what}
          onChange={setWhat}
          rows={4}
        />

        <Field
          id="support-expected"
          label="What did you expect?"
          hint="Optional, but it often makes the difference between a bug and a misunderstanding."
          value={expected}
          onChange={setExpected}
          rows={2}
        />

        <div>
          <p className="text-sm font-medium text-fg">Technical details</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Collected from this browser and attached to your message. No reading content is included.
          </p>
          <pre className="mt-2 max-h-36 overflow-auto rounded-md bg-fg/4 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted">
            {details}
          </pre>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <a
            href={mailto}
            className="inline-flex h-11 items-center gap-2 rounded-md bg-fg px-5 text-sm font-medium text-bg hover:opacity-90"
          >
            <Mail size={15} aria-hidden />
            Email support
          </a>
          <button
            type="button"
            onClick={() => void copyAll()}
            className="inline-flex h-11 items-center gap-2 rounded-md bg-surface px-5 text-sm font-medium shadow-border hover:bg-fg/6"
          >
            {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
            {copied ? "Copied" : "Copy message"}
          </button>
        </div>

        <p className="text-xs leading-relaxed text-subtle">
          The email button opens your own mail app with all of this filled in — nothing is sent until
          you send it. If mail is not set up on this device, copy the message and paste it wherever
          suits you. Replies come from{" "}
          <span className="font-medium text-muted">{SUPPORT_EMAIL}</span>.
        </p>
      </div>

      <p className="border-t border-fg/10 pt-6">
        If this is about your data — getting a copy of it, or deleting it — you can do both yourself,
        immediately, from{" "}
        <Link to="/account" className="text-fg underline underline-offset-2">
          your account
        </Link>
        . No request needed.
      </p>
    </PublicLayout>
  );
}

function Field({
  id,
  label,
  hint,
  value,
  onChange,
  rows,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (next: string) => void;
  rows: number;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
      </label>
      <p className="mt-1 text-xs leading-relaxed text-muted">{hint}</p>
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "mt-2 w-full resize-y rounded-md bg-surface px-3 py-2.5 text-sm leading-relaxed shadow-border",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
        )}
      />
    </div>
  );
}

/**
 * What a person cannot be expected to know about their own browser.
 *
 * Deliberately narrow: enough to reproduce a fault, and nothing about what
 * anyone is reading.
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
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    add("graphics", ext ? gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unavailable");
  } catch {
    add("graphics", "unavailable");
  }
  add("time", new Date().toISOString());
  return lines.join("\n");
}
