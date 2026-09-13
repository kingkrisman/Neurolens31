/** Same-origin API proxies: timeout plus one retry on 5xx / network, never on timeout. */

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function isAbort(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  return error instanceof Error && error.name === "AbortError";
}

export async function proxyFetch(
  url: string | URL,
  init: RequestInit,
  options: { timeoutMs: number; attempts?: number; retryDelayMs?: number },
): Promise<Response> {
  const attempts = Math.max(1, options.attempts ?? 2);
  const retryDelayMs = options.retryDelayMs ?? 220;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (!response.ok && response.status >= 500 && attempt < attempts - 1) {
        await sleep(retryDelayMs);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (isAbort(error) || attempt === attempts - 1) throw error;
      await sleep(retryDelayMs);
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Request failed");
}
