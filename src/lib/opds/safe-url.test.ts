import assert from "node:assert/strict";
import { test } from "node:test";
import { checkUrlShape, isPrivateAddress } from "./safe-url.ts";

/**
 * These tests are the boundary between "a proxy" and "a request forger".
 *
 * Every other proxy here targets one fixed host. This one takes an address
 * from whoever is typing, and runs on a server that sits inside a network with
 * things worth reaching — so each case below is an attack, not an edge case.
 */

const ok = (url: string) => checkUrlShape(url).ok;

test("a real catalogue passes", () => {
  assert.equal(ok("https://standardebooks.org/feeds/opds"), true);
  assert.equal(ok("https://books.example.com/opds?page=2"), true);
});

test("plain http is refused", () => {
  // Without TLS the proxy is a channel for whoever is in the middle.
  assert.equal(ok("http://standardebooks.org/feeds/opds"), false);
});

test("non-web schemes are refused", () => {
  for (const url of ["file:///etc/passwd", "ftp://example.com/x", "gopher://example.com"]) {
    assert.equal(ok(url), false, url);
  }
});

test("cloud metadata is refused by address", () => {
  // The single most valuable target: it hands credentials to anything local.
  assert.equal(ok("https://169.254.169.254/latest/meta-data/"), false);
  assert.equal(isPrivateAddress("169.254.169.254"), true);
});

test("cloud metadata is refused by name", () => {
  assert.equal(ok("https://metadata.google.internal/computeMetadata/v1/"), false);
});

test("loopback is refused in every spelling", () => {
  assert.equal(ok("https://localhost/opds"), false);
  assert.equal(ok("https://127.0.0.1/opds"), false);
  assert.equal(ok("https://127.1.2.3/opds"), false);
  assert.equal(ok("https://[::1]/opds"), false);
  assert.equal(ok("https://[::ffff:127.0.0.1]/opds"), false);
});

test("private ranges are refused", () => {
  for (const host of [
    "10.0.0.1",
    "10.255.255.254",
    "172.16.0.1",
    "172.31.255.1",
    "192.168.1.1",
    "100.64.0.1",
  ]) {
    assert.equal(isPrivateAddress(host), true, host);
    assert.equal(ok(`https://${host}/opds`), false, host);
  }
});

test("addresses next to a private range are still public", () => {
  // 172.15 and 172.32 are outside 172.16/12, and 11.x is outside 10/8.
  for (const host of ["172.15.0.1", "172.32.0.1", "11.0.0.1", "192.167.1.1", "100.63.255.255"]) {
    assert.equal(isPrivateAddress(host), false, host);
  }
});

test("internal-looking names are refused", () => {
  for (const host of ["db.internal", "printer.local", "thing.home.arpa", "x.localhost"]) {
    assert.equal(ok(`https://${host}/opds`), false, host);
  }
});

test("IPv6 unique-local and link-local are refused", () => {
  assert.equal(isPrivateAddress("fd00::1"), true);
  assert.equal(isPrivateAddress("fe80::1"), true);
  assert.equal(isPrivateAddress("2001:4860:4860::8888"), false);
});

test("credentials in the URL are refused", () => {
  // They would be forwarded to whatever the host turns out to be.
  assert.equal(ok("https://user:pass@books.example.com/opds"), false);
});

test("nonsense is refused rather than throwing", () => {
  for (const url of ["", "not a url", "https://", "//example.com"]) {
    assert.equal(ok(url), false, JSON.stringify(url));
  }
});

test("a refusal explains itself in words a reader could act on", () => {
  const verdict = checkUrlShape("http://example.com/opds");
  assert.equal(verdict.ok, false);
  if (!verdict.ok) assert.match(verdict.reason, /https/i);
});

test("a pass hands back the parsed URL, so nothing parses it twice", () => {
  // Two parses of one string are two chances to disagree about the host.
  const verdict = checkUrlShape("https://standardebooks.org/feeds/opds");
  assert.equal(verdict.ok, true);
  if (verdict.ok) assert.equal(verdict.url.hostname, "standardebooks.org");
});

test("IPv4-mapped loopback is refused in the form URL actually produces", () => {
  // `new URL("https://[::ffff:127.0.0.1]/")` normalises the host to
  // `[::ffff:7f00:1]`, so a check that only understood the dotted spelling
  // never saw it. That gap let loopback through.
  assert.equal(new URL("https://[::ffff:127.0.0.1]/").hostname, "[::ffff:7f00:1]");
  assert.equal(isPrivateAddress("::ffff:7f00:1"), true);
  assert.equal(isPrivateAddress("::ffff:c0a8:1"), true, "192.168.0.1 in hex");
  assert.equal(isPrivateAddress("::ffff:a9fe:a9fe"), true, "169.254.169.254 in hex");
  assert.equal(isPrivateAddress("::ffff:0808:0808"), false, "8.8.8.8 is public");
});
