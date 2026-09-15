import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { contentSecurityPolicy, originOf, securityHeaders } from "./security-headers.mjs";

function directive(policy, name) {
  const found = policy.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name} `));
  return found ? found.slice(name.length + 1).split(" ") : null;
}

describe("contentSecurityPolicy", () => {
  const policy = contentSecurityPolicy();

  it("refuses scripts from anywhere but this origin", () => {
    const scripts = directive(policy, "script-src");
    assert.ok(scripts.includes("'self'"));
    assert.ok(!scripts.some((value) => value.startsWith("http")), "no remote script hosts");
    assert.ok(!scripts.includes("*"));
  });

  it("does not allow eval in production", () => {
    assert.ok(!directive(policy, "script-src").includes("'unsafe-eval'"));
  });

  it("blocks plugins and base-tag hijacking", () => {
    assert.deepEqual(directive(policy, "object-src"), ["'none'"]);
    assert.deepEqual(directive(policy, "base-uri"), ["'self'"]);
  });

  it("allows generated avatars", () => {
    assert.ok(directive(policy, "img-src").includes("data:"));
  });

  it("stops other sites from framing the app", () => {
    const ancestors = directive(policy, "frame-ancestors");
    assert.ok(!ancestors.includes("*"));
  });

  it("adds a configured https service to connect-src, and only https", () => {
    const withExtra = contentSecurityPolicy({
      extraConnect: ["https://abc.supabase.co/rest/v1", "http://insecure.example.com", undefined],
    });
    const connect = directive(withExtra, "connect-src");
    assert.ok(connect.includes("https://abc.supabase.co"));
    assert.ok(!connect.some((value) => value.includes("insecure.example.com")));
  });

  it("opens the hot-reload socket only in development", () => {
    assert.ok(!directive(policy, "connect-src").includes("ws:"));
    assert.ok(directive(contentSecurityPolicy({ dev: true }), "connect-src").includes("ws:"));
  });
});

describe("securityHeaders", () => {
  it("sets the full set in production", () => {
    const headers = securityHeaders();
    for (const name of [
      "Content-Security-Policy",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "Strict-Transport-Security",
    ]) {
      assert.ok(headers[name], `${name} missing`);
    }
  });

  it("leaves HSTS out of development, where it would pin localhost", () => {
    assert.equal(securityHeaders({ dev: true })["Strict-Transport-Security"], undefined);
  });
});

describe("originOf", () => {
  it("reduces a URL to its origin", () => {
    assert.equal(originOf("https://abc.supabase.co/rest/v1?x=1"), "https://abc.supabase.co");
  });

  it("rejects anything that is not https", () => {
    assert.equal(originOf("http://abc.supabase.co"), null);
    assert.equal(originOf("javascript:alert(1)"), null);
    assert.equal(originOf("not a url"), null);
  });
});
