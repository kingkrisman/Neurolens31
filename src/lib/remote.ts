export type RemoteErrorKind =
  | "abort"
  | "timeout"
  | "offline"
  | "not-found"
  | "rate-limit"
  | "http"
  | "parse"
  | "empty";

const RETRYABLE: Record<RemoteErrorKind, boolean> = {
  abort: false,
  timeout: true,
  offline: true,
  "not-found": false,
  "rate-limit": true,
  http: true,
  parse: false,
  empty: false,
};

export class RemoteError extends Error {
  readonly kind: RemoteErrorKind;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    kind: RemoteErrorKind,
    message: string,
    options?: { status?: number; retryable?: boolean; cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "RemoteError";
    this.kind = kind;
    this.status = options?.status;
    this.retryable = options?.retryable ?? RETRYABLE[kind];
  }
}

export function isRemoteError(error: unknown): error is RemoteError {
  return error instanceof RemoteError;
}

export function isAbortError(error: unknown): boolean {
  if (isRemoteError(error) && error.kind === "abort") return true;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  return error instanceof Error && error.name === "AbortError";
}

export function asRemoteError(error: unknown, fallback = "Something went wrong."): RemoteError {
  if (isRemoteError(error)) return error;
  if (isAbortError(error)) return new RemoteError("abort", "Cancelled.");
  return new RemoteError("http", error instanceof Error ? error.message : fallback, { cause: error });
}

export function isRetryableError(error: unknown): boolean {
  if (!isRemoteError(error)) return false;
  return error.retryable && error.kind !== "abort";
}

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_RETRIES = 1;
const USER_AGENT = "NeuroLens/1.0 (adaptive reader)";

export interface FetchJsonOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  accept?: string;
}

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new RemoteError("abort", "Cancelled."));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new RemoteError("abort", "Cancelled."));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function retryDelayMs(attempt: number, kind?: RemoteErrorKind): number {
  const base = kind === "rate-limit" ? 500 : 180;
  return Math.min(1400, base * 2 ** attempt);
}

async function fetchOnce(url: string, options: FetchJsonOptions = {}): Promise<Response> {
  if (isOffline()) {
    throw new RemoteError("offline", "You appear to be offline.");
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const parent = options.signal;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
  const onParentAbort = () => controller.abort(parent?.reason ?? "abort");
  parent?.addEventListener("abort", onParentAbort);

  try {
    let response: Response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: options.accept ?? "application/json",
          ...(typeof navigator === "undefined" ? { "User-Agent": USER_AGENT } : {}),
          ...options.headers,
        },
      });
    } catch (error) {
      if (controller.signal.aborted) {
        if (parent?.aborted) throw new RemoteError("abort", "Cancelled.");
        throw new RemoteError("timeout", "That request took too long.");
      }
      if (isOffline()) throw new RemoteError("offline", "You appear to be offline.");
      throw new RemoteError("http", "Could not reach that service.", { cause: error });
    }

    if (response.status === 404) {
      throw new RemoteError("not-found", "Nothing was found.", { status: 404 });
    }
    if (response.status === 429) {
      throw new RemoteError("rate-limit", "Too many requests. Wait a moment, then retry.", {
        status: 429,
      });
    }
    if (!response.ok) {
      throw new RemoteError("http", `The service returned ${response.status}.`, {
        status: response.status,
        retryable: response.status >= 500,
      });
    }
    return response;
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", onParentAbort);
  }
}

async function fetchResponse(url: string, options: FetchJsonOptions = {}): Promise<Response> {
  const retries = options.retries ?? DEFAULT_RETRIES;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchOnce(url, options);
    } catch (error) {
      lastError = error;
      if (options.signal?.aborted) throw asRemoteError(error);
      if (!isRetryableError(error) || attempt === retries) throw error;
      await sleep(retryDelayMs(attempt, isRemoteError(error) ? error.kind : undefined), options.signal);
    }
  }
  throw lastError instanceof Error ? lastError : new RemoteError("http", "Could not reach that service.");
}

/** JSON GET with timeout, abort, retries, 404/429, parse, and offline handling. */
export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const response = await fetchResponse(url, options);
  const text = await response.text();
  if (!text.trim()) {
    throw new RemoteError("empty", "The service returned nothing.");
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new RemoteError("parse", "The response could not be read.");
  }
}

/** Plain-text GET with the same timeout / abort / retry / status handling as fetchJson. */
export async function fetchText(url: string, options: FetchJsonOptions = {}): Promise<string> {
  const response = await fetchResponse(url, {
    ...options,
    accept: options.accept ?? "text/plain",
  });
  const text = await response.text();
  if (!text.trim()) {
    throw new RemoteError("empty", "The service returned nothing.");
  }
  return text;
}

export function remoteMessage(error: unknown, fallback = "Could not load that."): string {
  if (isAbortError(error)) return "";
  if (isRemoteError(error)) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
