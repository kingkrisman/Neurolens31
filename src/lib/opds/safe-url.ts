/**
 * Whether a URL is safe for the server to fetch on a reader's behalf.
 *
 * Every other proxy in this app targets one hard-coded host. OPDS cannot: the
 * whole point is that somebody types in the address of *their* catalogue. That
 * turns the proxy into a request-forger for anyone who can reach the endpoint,
 * and a serverless function sits inside a network with things worth reaching —
 * cloud metadata at 169.254.169.254 hands out credentials to anything that
 * asks, and "internal" hostnames resolve to services that assume nobody
 * outside can see them.
 *
 * So the rule is: public internet, over TLS, or nothing.
 *
 * The host is checked twice, and both checks are needed. The textual one
 * catches literals and names nobody should be asking for. The numeric one runs
 * after DNS, because `evil.example.com` resolving to 127.0.0.1 passes every
 * string test ever written.
 *
 * What remains is DNS rebinding — an answer that is public when checked and
 * private when fetched. Closing that needs the connection pinned to the
 * address that was checked, which Node can do but not through `fetch`. For a
 * feature that GETs a book catalogue the residual risk is small and worth
 * naming rather than pretending away.
 */

export type UrlVerdict = { ok: true; url: URL } | { ok: false; reason: string };

/** Hostnames that are never a public catalogue, whatever they resolve to. */
const BLOCKED_NAMES = ["localhost", "metadata.google.internal", "metadata.goog", "instance-data"];

const BLOCKED_SUFFIXES = [".local", ".localhost", ".internal", ".home.arpa", ".onion"];

/** Dotted-quad to a 32-bit number, or null if it is not one. */
function ipv4(host: string): number | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

/** Ranges that are not the public internet. */
function isPrivateIpv4(address: number): boolean {
  const inRange = (from: string, bits: number) => {
    const base = ipv4(from)!;
    const mask = bits === 0 ? 0 : (-1 << (32 - bits)) >>> 0;
    return (address & mask) >>> 0 === (base & mask) >>> 0;
  };
  return (
    inRange("0.0.0.0", 8) || // this network
    inRange("10.0.0.0", 8) || // private
    inRange("100.64.0.0", 10) || // carrier-grade NAT
    inRange("127.0.0.0", 8) || // loopback
    inRange("169.254.0.0", 16) || // link-local, and cloud metadata
    inRange("172.16.0.0", 12) || // private
    inRange("192.0.0.0", 24) || // IETF protocol assignments
    inRange("192.168.0.0", 16) || // private
    inRange("198.18.0.0", 15) || // benchmarking
    inRange("224.0.0.0", 4) || // multicast
    inRange("240.0.0.0", 4) // reserved, includes broadcast
  );
}

function isPrivateIpv6(host: string): boolean {
  const address = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (address === "::1" || address === "::") return true;
  // Unique-local (fc00::/7) and link-local (fe80::/10).
  if (/^f[cd]/.test(address)) return true;
  if (/^fe[89ab]/.test(address)) return true;
  /**
   * IPv4-mapped — `::ffff:127.0.0.1` is loopback wearing a hat.
   *
   * Two spellings, and the second is the one that matters. `new URL()`
   * normalises the host, so `[::ffff:127.0.0.1]` comes back out as
   * `[::ffff:7f00:1]` — the dotted form is what somebody types and the hex form
   * is what this function is actually handed. Checking only the readable one
   * left loopback reachable, which is what the test caught.
   */
  const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(address);
  if (dotted) {
    const value = ipv4(dotted[1]!);
    return value === null || isPrivateIpv4(value);
  }
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(address);
  if (hex) {
    const value = ((parseInt(hex[1]!, 16) << 16) >>> 0) + parseInt(hex[2]!, 16);
    return isPrivateIpv4(value >>> 0);
  }
  return false;
}

/** True when this literal address is one the server must not be sent to. */
export function isPrivateAddress(host: string): boolean {
  const asV4 = ipv4(host);
  if (asV4 !== null) return isPrivateIpv4(asV4);
  if (host.includes(":")) return isPrivateIpv6(host);
  return false;
}

/**
 * Check the parts of a URL that can be checked without a network.
 *
 * Returns the parsed URL so callers do not parse it twice and risk the two
 * parses disagreeing — which is how a check and a fetch end up looking at
 * different addresses.
 */
export function checkUrlShape(input: string): UrlVerdict {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, reason: "That is not a web address." };
  }

  if (url.protocol !== "https:") {
    return { ok: false, reason: "Catalogue addresses must start with https://" };
  }
  if (url.username || url.password) {
    // Credentials in a URL would be forwarded by the proxy to whatever the
    // host turns out to be. If a catalogue needs a password it needs a
    // considered design, not this.
    return { ok: false, reason: "Addresses with a username or password are not supported yet." };
  }

  const host = url.hostname.toLowerCase();
  if (!host) return { ok: false, reason: "That address has no host." };
  if (BLOCKED_NAMES.includes(host) || BLOCKED_SUFFIXES.some((end) => host.endsWith(end))) {
    return { ok: false, reason: "That address is not on the public internet." };
  }
  if (isPrivateAddress(host)) {
    return { ok: false, reason: "That address is a private one." };
  }

  return { ok: true, url };
}
