/**
 * Crash reports that cannot carry what somebody was reading.
 *
 * The app had no error monitoring at all: a crash in the reader was a
 * `console.error` on a stranger's phone, which is the same as no information.
 * The fault that emptied a book mid-read went unnoticed for days for exactly
 * this reason.
 *
 * The hard part is that an error message is free text, and free text is the one
 * shape this app refuses to collect. A parser throwing on a malformed file will
 * happily quote the file at you, and "Unexpected token 'W' in JSON" is the
 * beginning of a sentence somebody wrote. So the message is normalised before
 * it leaves the device — see `scrubMessage` — and the table it lands in has no
 * column for an account, an address or a URL.
 *
 * Sent without being asked, with two exceptions, both of which are somebody
 * having already said no to sending things:
 *
 *  - a browser sending Global Privacy Control or Do Not Track;
 *  - a reader who switched analytics off.
 *
 * Not gated on analytics being switched *on*, because the people most likely to
 * hit a crash are the ones who never opened the settings, and a monitor that
 * only reports from careful users reports nothing about the bugs that matter.
 */

import { analyticsChoice, privacySignal } from "../analytics.ts";

/** The areas of the app a crash can come from. Matches the database's CHECK. */
export const AREAS = [
  "home",
  "reader",
  "library",
  "insights",
  "settings",
  "document",
  "auth",
  "unknown",
] as const;

export type Area = (typeof AREAS)[number];

export function asArea(value: string | undefined): Area {
  return (AREAS as readonly string[]).includes(value ?? "") ? (value as Area) : "unknown";
}

const MAX_MESSAGE = 300;
const MAX_STACK = 2_000;

/**
 * Strip everything from a message that could be content rather than code.
 *
 * In order, and the order matters — URLs before quotes, because a URL can
 * contain an apostrophe:
 *
 *  - URLs and `blob:`/`data:` references become `<url>`. A data URL is an
 *    entire file inlined into the message.
 *  - Anything in single, double or back quotes becomes `<q>`. This is where a
 *    parser puts the text it choked on.
 *  - Runs of digits become `<n>`, which also removes byte offsets and the
 *    character positions that make two copies of one bug look like two bugs.
 *  - Anything shaped like an email address becomes `<email>`, before the
 *    general case, so a stray address in a message cannot survive.
 *
 * What survives is the part a developer actually reads: the error's class and
 * the shape of the sentence. "Unexpected token '<q>' in JSON at position <n>"
 * is as useful as the original and carries none of the file.
 */
export function scrubMessage(input: string): string {
  return input
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, "<email>")
    .replace(/\b(?:https?|blob|data|file):[^\s)'"`]+/gi, "<url>")
    .replace(/'[^']*'|"[^"]*"|`[^`]*`/g, "<q>")
    .replace(/\d+/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_MESSAGE);
}

/**
 * Keep only the frames, and only the parts of them that name our own code.
 *
 * A stack line is `at fn (https://host/assets/reader-a1b2.js:9:1417)`. The
 * function name and the file are what locate a bug; the origin is not, and it
 * is the one part of a stack that differs between a reader on a custom domain
 * and one on a preview deploy. So the path is reduced to its last segment.
 *
 * Two prefixes, not one: a JavaScript stack uses `at`, and React's component
 * stack uses `in` (`in Reader (created by App)`). Accepting only `at` would
 * have thrown away every component stack — which is the more useful of the two
 * for a render fault, because it names the component rather than the bundle.
 */
export function scrubStack(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const lines = input
    .split("\n")
    .filter((line) => /^\s*(?:at|in)\s/.test(line))
    .map((line) =>
      line
        .replace(/\b(?:https?|blob|file):\/\/[^\s)]*\/([^/\s)]+)/gi, "$1")
        .replace(/\s+/g, " ")
        .trim(),
    );
  const joined = lines.join("\n").slice(0, MAX_STACK);
  return joined || undefined;
}

/** Whether a crash may be reported from this device. */
export function reportingAllowed(): boolean {
  return !privacySignal() && analyticsChoice() !== "off";
}

/**
 * Don't report the same crash twice.
 *
 * A render loop that throws produces one error per frame. Without this, a
 * single broken component is thousands of rows and a rate limit.
 */
const seen = new Set<string>();
const MAX_PER_SESSION = 10;
let sent = 0;

/** Exposed for tests; a real session never needs to forget. */
export function resetReporting(): void {
  seen.clear();
  sent = 0;
}

const release = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_APP_VERSION;

export interface ReportBody {
  message: string;
  area: Area;
  stack?: string;
  release?: string;
}

/** The row for a crash, or null when this one should not be sent. */
export function buildReport(
  error: unknown,
  area: string | undefined,
  stack?: string,
): ReportBody | null {
  if (!reportingAllowed()) return null;
  if (sent >= MAX_PER_SESSION) return null;

  const raw =
    error instanceof Error ? error.message : typeof error === "string" ? error : "Non-error thrown";
  const message = scrubMessage(raw) || "Unknown error";
  const resolved = asArea(area);

  const key = `${resolved}:${message}`;
  if (seen.has(key)) return null;
  seen.add(key);
  sent += 1;

  const frames = scrubStack(stack ?? (error instanceof Error ? error.stack : undefined));
  return {
    message,
    area: resolved,
    ...(frames ? { stack: frames } : {}),
    ...(release ? { release } : {}),
  };
}

/**
 * Report a crash. Never throws, never awaits anything the caller cares about.
 *
 * A reporter that can fail the thing it is reporting on is worse than none: an
 * error boundary calling this is already rendering a fallback, and an exception
 * here would take out the fallback too.
 */
export function reportError(error: unknown, area?: string, stack?: string): void {
  try {
    const body = buildReport(error, area, stack);
    if (!body) return;
    void fetch("/api/errors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
      credentials: "omit",
    }).catch(() => {
      /* offline, or the endpoint is not there. A lost crash report is not a bug. */
    });
  } catch {
    /* never let reporting be the thing that breaks */
  }
}

/**
 * Catch what no boundary can: errors outside React's render, and promises
 * nobody awaited. Both are silent by default, and both are where the sync
 * engine's failures would surface.
 */
export function installGlobalReporter(): () => void {
  if (typeof window === "undefined") return () => {};

  const onError = (event: ErrorEvent) => {
    reportError(event.error ?? event.message, "unknown");
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    reportError(event.reason, "unknown");
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
