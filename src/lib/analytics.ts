/**
 * Usage analytics that cannot carry personal data.
 *
 * What NeuroLens wants to learn is how the app is used — which tools, which
 * file types, where people give up — and nothing about who is using it or what
 * they read. The usual way to promise that is a policy. This makes it a
 * property of the code instead: every event is checked against a fixed schema
 * before it is stored, each field only accepts values from a short closed list,
 * and anything else is dropped. There is no field that takes free text, so a
 * book's contents, a file name, an email or a highlight cannot be recorded even
 * by mistake — there is nowhere to put them.
 *
 * - The id is a random number made on this device. It is not the account, is
 *   never joined to one, and is thrown away when analytics is switched off.
 * - Timestamps are rounded to the hour, so events cannot be lined up against
 *   anything else a person did.
 * - Opt-in. Nothing is recorded until the person says yes, and a browser
 *   sending Global Privacy Control or Do Not Track is never even asked.
 * - Events go to this app's own endpoint, not a third party's, and only once
 *   someone has said yes. Until they are accepted they stay queued on the
 *   device, where the account page shows them word for word.
 */

const BUCKETS = ["0", "1-9", "10-49", "50-199", "200-999", "1000+"] as const;
const SIZE_BUCKETS = ["<100KB", "100KB-1MB", "1-5MB", "5-20MB", "20MB+"] as const;
const FORMATS = ["pdf", "epub", "docx", "html", "rtf", "md", "txt", "other"] as const;

type Field = readonly string[] | "bool";

/**
 * Every event the app may record, and every value each field may hold.
 *
 * Adding an event means adding it here, which is the point: the list of what is
 * collected lives in one place a reviewer can read in a minute.
 */
export const SCHEMA = {
  app_open: {},
  tab_view: { tab: ["explore", "read", "library", "insights", "settings"] },
  file_opened: { format: FORMATS, size: SIZE_BUCKETS, pages: BUCKETS, skipped_pages: "bool" },
  file_failed: { format: FORMATS, stage: ["open", "pages", "unsupported", "read"] },
  highlight_added: { color: ["butter", "tangerine", "rose", "mint", "sky", "violet"] },
  ink_stroke: { tool: ["pen", "marker", "pencil", "eraser"] },
  setting_changed: {
    setting: [
      "fontFamily",
      "fontSize",
      "lineHeight",
      "letterSpacing",
      "wordSpacing",
      "theme",
      "tint",
      "align",
      "bionicStrength",
      "readingMask",
      "wordGuide",
      "syllables",
      "letterGuide",
      "plainLanguage",
      "focusHighlight",
      "rhythmOptimization",
      "other",
    ],
  },
  tour: { step: ["1", "2", "3", "4", "5", "6", "7", "8"], action: ["next", "skip", "done"] },
  auth: { action: ["sign_in", "sign_up", "sign_out"], provider: ["google", "apple", "none"] },
  avatar_changed: {
    style: [
      "notionists-neutral",
      "lorelei-neutral",
      "micah",
      "personas",
      "avataaars-neutral",
      "big-smile",
      "croodles-neutral",
      "miniavs",
      "dylan",
      "thumbs",
      "shapes",
      "glass",
    ],
  },
  /** Someone chose to mark the site as a preferred source in Google. */
  preferred_source_click: {},
  /**
   * Core Web Vitals, bucketed to Google's own good/needs-work/poor thresholds.
   *
   * The raw millisecond figure is deliberately not kept. A precise LCP is a
   * fingerprint — it varies by device, connection and moment — and the only
   * question worth answering here is which of three bands a page fell into.
   */
  web_vital: {
    metric: ["LCP", "INP", "CLS", "TTFB", "FCP"],
    rating: ["good", "needs-improvement", "poor"],
    view: ["home", "reader", "document"],
  },
} as const satisfies Record<string, Record<string, Field>>;

export type EventName = keyof typeof SCHEMA;

export interface StoredEvent {
  e: EventName;
  p: Record<string, string | boolean>;
  /** Hour the event happened in, as epoch milliseconds. */
  t: number;
}

const QUEUE_KEY = "neurolens-analytics-queue";
const PREF_KEY = "neurolens-analytics";
const ID_KEY = "neurolens-analytics-id";
const SESSION_KEY = "neurolens-analytics-session";
const MAX_QUEUE = 500;

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Keep only what the schema allows.
 *
 * Returns null for an event that is not in the schema at all. For a known
 * event, a field survives only when its value is one of the listed values (or
 * a real boolean for "bool" fields); unknown fields and anything free-form are
 * silently removed.
 */
export function sanitize(
  name: string,
  props: Record<string, unknown> = {},
): Record<string, string | boolean> | null {
  if (!Object.prototype.hasOwnProperty.call(SCHEMA, name)) return null;
  const fields = SCHEMA[name as EventName] as Record<string, Field>;
  const clean: Record<string, string | boolean> = {};
  for (const [key, rule] of Object.entries(fields)) {
    const value = props[key];
    if (rule === "bool") {
      if (typeof value === "boolean") clean[key] = value;
    } else if (typeof value === "string" && rule.includes(value)) {
      clean[key] = value;
    }
  }
  return clean;
}

/** A browser-level request not to be tracked. */
export function privacySignal(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.globalPrivacyControl === true || nav.doNotTrack === "1";
}

/**
 * Whether events are recorded on this device right now.
 *
 * Opt-in: nothing is recorded until the person says yes. Where the law asks for
 * consent before measuring use (the EU and UK among them), silence is not
 * consent, and an app about respecting its readers should not be the one that
 * treats it as such.
 */
export function analyticsEnabled(): boolean {
  return storage()?.getItem(PREF_KEY) === "on";
}

/** The person's answer, or null if they have not been asked yet. */
export function analyticsChoice(): "on" | "off" | null {
  const saved = storage()?.getItem(PREF_KEY);
  return saved === "on" || saved === "off" ? saved : null;
}

/**
 * Whether it is worth asking at all.
 *
 * A browser sending Global Privacy Control or Do Not Track has already
 * answered, so the question is not put to that person.
 */
export function shouldAskForAnalytics(): boolean {
  return analyticsChoice() === null && !privacySignal();
}

/** Turning it off also discards everything queued and the device id. */
export function setAnalyticsEnabled(on: boolean): void {
  const store = storage();
  if (!store) return;
  store.setItem(PREF_KEY, on ? "on" : "off");
  if (!on) {
    store.removeItem(QUEUE_KEY);
    store.removeItem(ID_KEY);
  }
  for (const listener of listeners) listener();
}

export function queuedEvents(): StoredEvent[] {
  try {
    const raw = storage()?.getItem(QUEUE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as StoredEvent[]) : [];
  } catch {
    return [];
  }
}

function hour(now: number): number {
  return Math.floor(now / 3_600_000) * 3_600_000;
}

const listeners = new Set<() => void>();
export function subscribeAnalytics(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function append(event: StoredEvent) {
  const store = storage();
  if (!store) return;
  const next = [...queuedEvents(), event].slice(-MAX_QUEUE);
  try {
    store.setItem(QUEUE_KEY, JSON.stringify(next));
  } catch {
    /* storage full — analytics is the first thing to give up, never a book */
  }
}

/** Record one event. Does nothing when switched off or when the event is unknown. */
export function track(
  name: EventName,
  props: Record<string, unknown> = {},
  now = Date.now(),
): void {
  if (!analyticsEnabled()) return;
  const clean = sanitize(name, props);
  if (!clean) return;

  // One app_open per browser session, recorded lazily with the first event so
  // nothing has to remember to call it.
  try {
    if (typeof sessionStorage !== "undefined" && !sessionStorage.getItem(SESSION_KEY)) {
      sessionStorage.setItem(SESSION_KEY, "1");
      if (name !== "app_open") append({ e: "app_open", p: {}, t: hour(now) });
    }
  } catch {
    /* no session storage — skip the open marker */
  }

  append({ e: name, p: clean, t: hour(now) });
  for (const listener of listeners) listener();
  void flush();
}

/**
 * Where the queue is sent.
 *
 * The app's own endpoint by default, which is same-origin: no third party is
 * involved, nothing crosses to another domain, and there is no vendor to trust.
 * `VITE_ANALYTICS_ENDPOINT` overrides it for anyone pointing this at their own
 * collector, and is required to be https so events cannot be sent in the clear.
 */
const FIRST_PARTY_ENDPOINT = "/api/analytics";

function endpoint(): string {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  const url = env?.VITE_ANALYTICS_ENDPOINT;
  return url && /^https:\/\//.test(url) ? url : FIRST_PARTY_ENDPOINT;
}

/**
 * Send the queue, and only clear it once that has actually worked.
 *
 * The device id is deliberately not sent. It exists to keep one browser's queue
 * coherent, the server has no column for it, and a value that identifies a
 * device is not made harmless by being discarded on arrival — it is safer never
 * to put it on the wire.
 */
export async function flush(): Promise<boolean> {
  const events = queuedEvents();
  if (!events.length || !analyticsEnabled()) return false;
  const url = endpoint();
  const body = JSON.stringify({ events });

  // `keepalive` so a flush started as the tab closes still completes, which is
  // exactly when most of them start. sendBeacon would do the same, but it
  // reports only that the request was queued, never that it was accepted — and
  // clearing the queue on that would lose events whenever the server was down.
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: body.length < 60_000,
      credentials: "omit",
    });
    if (!response.ok) return false;
  } catch {
    // Offline, blocked, or the endpoint is not there. The queue survives on the
    // device and the next flush tries again.
    return false;
  }

  storage()?.removeItem(QUEUE_KEY);
  return true;
}

export function bucketCount(n: number): (typeof BUCKETS)[number] {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 10) return "1-9";
  if (n < 50) return "10-49";
  if (n < 200) return "50-199";
  if (n < 1000) return "200-999";
  return "1000+";
}

export function bucketSize(bytes: number): (typeof SIZE_BUCKETS)[number] {
  const kb = bytes / 1024;
  if (kb < 100) return "<100KB";
  if (kb < 1024) return "100KB-1MB";
  if (kb < 5 * 1024) return "1-5MB";
  if (kb < 20 * 1024) return "5-20MB";
  return "20MB+";
}

/** File type from a name, reduced to the closed list — never the name itself. */
export function formatOf(fileName: string): (typeof FORMATS)[number] {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf" || ext === "epub" || ext === "docx" || ext === "rtf") return ext;
  if (ext === "html" || ext === "htm" || ext === "xhtml") return "html";
  if (ext === "md" || ext === "markdown") return "md";
  if (ext === "txt" || ext === "text") return "txt";
  return "other";
}
