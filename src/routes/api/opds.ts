import { createFileRoute } from "@tanstack/react-router";
import { checkUrlShape, isPrivateAddress } from "@/lib/opds/safe-url";

/**
 * Fetch an OPDS catalogue, or a book from one, on the reader's behalf.
 *
 * The one endpoint in the app that fetches a URL somebody typed, so it is the
 * one that could become a request forger. See `lib/opds/safe-url.ts` for the
 * rules; this file enforces them on every hop.
 *
 * Two faults in the first version, both of which broke book downloads:
 *
 * **It read the body as text.** `response.text()` decodes bytes as UTF-8, and
 * an EPUB is a zip. Every book fetched through here arrived corrupted, and the
 * reader's parser threw on it. The body is now passed through as bytes.
 *
 * **It refused every redirect.** That was meant to stop a public host bouncing
 * the request somewhere private — but real catalogues redirect all the time.
 * Project Gutenberg answers every download with a 302 to its cache, one of them
 * to plain `http://`. So redirects are now followed by hand, up to five, and
 * each new address goes through the same checks as the first: the shape, then
 * DNS. A redirect to a private address is still refused; it just has to be
 * refused on its own merits rather than for being a redirect.
 */

const TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 5;

/** A catalogue page is kilobytes. */
const MAX_FEED_BYTES = 2 * 1024 * 1024;
/** A book can be large — illustrated EPUBs run to tens of megabytes. */
const MAX_BOOK_BYTES = 40 * 1024 * 1024;

const USER_AGENT = "NeuroLens/1.0 (adaptive reader; OPDS client)";

const refuse = (reason: string, status = 400) =>
  Response.json({ error: reason }, { status, headers: { "cache-control": "no-store" } });

/**
 * Does this hostname resolve anywhere it should not?
 *
 * Imported lazily so `node:dns` stays out of the client bundle.
 */
async function resolvesPrivately(hostname: string): Promise<boolean> {
  try {
    const { lookup } = await import("node:dns/promises");
    const results = await lookup(hostname, { all: true });
    if (results.length === 0) return true;
    return results.some((entry) => isPrivateAddress(entry.address));
  } catch {
    // Unresolvable: refuse rather than hand an unknown name to fetch.
    return true;
  }
}

/**
 * Check one address, as a redirect target or as the original.
 *
 * A redirect to plain `http://` is upgraded to `https://` before it is checked.
 * Gutenberg sends its text files that way; its servers answer on https, and
 * following a redirect *down* to an unencrypted connection is what the https
 * rule exists to prevent.
 */
async function vet(raw: string): Promise<{ ok: true; url: URL } | { ok: false; reason: string }> {
  const upgraded = raw.startsWith("http://") ? `https://${raw.slice("http://".length)}` : raw;
  const verdict = checkUrlShape(upgraded);
  if (!verdict.ok) return verdict;
  if (await resolvesPrivately(verdict.url.hostname)) {
    return { ok: false, reason: "That address is not on the public internet." };
  }
  return verdict;
}

async function fetchOnce(url: URL, book: boolean): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: {
        accept: book
          ? "application/epub+zip, application/pdf, text/plain, */*;q=0.5"
          : "application/atom+xml;profile=opds-catalog, application/opds+json, application/atom+xml, application/xml;q=0.8, */*;q=0.5",
        "user-agent": USER_AGENT,
      },
      redirect: "manual",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export const Route = createFileRoute("/api/opds")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const params = new URL(request.url).searchParams;
        const asked = params.get("url");
        if (!asked) return refuse("Missing catalogue address.");
        const book = params.get("kind") === "book";
        const limit = book ? MAX_BOOK_BYTES : MAX_FEED_BYTES;

        let current = await vet(asked);
        if (!current.ok) return refuse(current.reason);

        let response: Response | null = null;
        for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
          try {
            response = await fetchOnce(current.url, book);
          } catch {
            return refuse("Could not reach that catalogue.", 502);
          }

          const location = response.headers.get("location");
          if (response.status >= 300 && response.status < 400 && location) {
            if (hop === MAX_REDIRECTS) return refuse("That address redirects too many times.", 502);
            // Relative locations are resolved against the address that sent them.
            current = await vet(new URL(location, current.url).toString());
            if (!current.ok) return refuse(current.reason, 502);
            continue;
          }
          break;
        }

        if (!response || !response.ok) {
          return refuse(`The catalogue answered ${response?.status ?? "nothing"}.`, 502);
        }

        const declared = Number(response.headers.get("content-length") ?? 0);
        if (declared > limit) {
          return refuse(
            book ? "That book is too large to open here." : "That catalogue page is too large.",
            502,
          );
        }

        // Bytes, not text. See the note at the top: decoding a zip as UTF-8 is
        // what corrupted every EPUB.
        const body = await response.arrayBuffer();
        if (body.byteLength > limit) {
          return refuse(
            book ? "That book is too large to open here." : "That catalogue page is too large.",
            502,
          );
        }

        return new Response(body, {
          status: 200,
          headers: {
            "content-type": response.headers.get("content-type") ?? "application/octet-stream",
            "cache-control": book ? "private, max-age=3600" : "public, max-age=300",
          },
        });
      },
    },
  },
});
