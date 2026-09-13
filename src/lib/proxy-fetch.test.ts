import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { proxyFetch } from "./proxy-fetch.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("proxyFetch", () => {
  it("retries a 502 then succeeds", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls === 1) return new Response("nope", { status: 502 });
      return new Response("ok", { status: 200 });
    }) as typeof fetch;
    const response = await proxyFetch("https://example.test/x", {}, { timeoutMs: 200, retryDelayMs: 5 });
    assert.equal(response.status, 200);
    assert.equal(calls, 2);
  });

  it("does not retry a 404", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("missing", { status: 404 });
    }) as typeof fetch;
    const response = await proxyFetch("https://example.test/x", {}, { timeoutMs: 200, attempts: 3, retryDelayMs: 5 });
    assert.equal(response.status, 404);
    assert.equal(calls, 1);
  });
});
