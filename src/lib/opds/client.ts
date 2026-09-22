import { parseOpds, type OpdsFeed } from "./parse.ts";
import { checkUrlShape } from "./safe-url.ts";

/**
 * Talking to a catalogue from the browser.
 *
 * Always through this app's own `/api/opds`, never directly. Two reasons and
 * both are decisive: the Content-Security-Policy names the hosts this page may
 * connect to and a reader's catalogue is not among them, and almost no OPDS
 * server sends CORS headers, so a direct call would be refused even without a
 * policy. The proxy also means the URL is checked somewhere a hostile page
 * cannot skip.
 */

/**
 * Catalogues worth offering before anybody has typed anything.
 *
 * Both addresses were checked rather than assumed, which was worth doing:
 * Standard Ebooks' OPDS feed now answers 401 and is for patrons only, so the
 * preset points at their open Atom feed instead — same books, plain Atom, and
 * the parser handles `rel="enclosure"` for exactly this reason. Gutenberg's
 * mobile host (`m.gutenberg.org`) times out; `www` serves the same catalogue.
 */
export const PRESET_CATALOGUES = [
  {
    id: "standard-ebooks",
    name: "Standard Ebooks",
    url: "https://standardebooks.org/feeds/atom/new-releases",
    description: "Public-domain books, carefully typeset and proofread. Free.",
  },
  {
    id: "gutenberg-opds",
    name: "Project Gutenberg",
    url: "https://www.gutenberg.org/ebooks.opds/",
    description: "Seventy thousand public-domain books.",
  },
] as const;

export class OpdsError extends Error {}

/**
 * The proxied address. `book` switches the proxy to its larger size limit and
 * book-shaped Accept header — a catalogue page is kilobytes, an illustrated
 * EPUB can be tens of megabytes, and one cap for both is wrong for one of them.
 */
function proxied(url: string, book = false): string {
  return `/api/opds?url=${encodeURIComponent(url)}${book ? "&kind=book" : ""}`;
}

/**
 * Fetch and parse one page of a catalogue.
 *
 * The address is checked here as well as on the server. Not because the server
 * check can be skipped — it cannot — but because a reader who has mistyped
 * something should be told so immediately rather than after a round trip.
 */
export async function fetchFeed(url: string, signal?: AbortSignal): Promise<OpdsFeed> {
  const verdict = checkUrlShape(url);
  if (!verdict.ok) throw new OpdsError(verdict.reason);

  let response: Response;
  try {
    response = await fetch(proxied(url), { signal, credentials: "omit" });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error;
    throw new OpdsError("Could not reach that catalogue.");
  }

  if (!response.ok) {
    const said = await response
      .json()
      .then((body: { error?: string }) => body?.error)
      .catch(() => null);
    throw new OpdsError(said ?? "That catalogue could not be read.");
  }

  const body = await response.text();
  const feed = parseOpds(body, url);
  if (!feed) {
    throw new OpdsError("That address did not return a book catalogue.");
  }
  return feed;
}

/**
 * Download one book's file, through the same proxy.
 *
 * Returned as a `File` so it goes into exactly the same path as something
 * dragged in from a desktop — the reader already knows how to open an EPUB, a
 * PDF and a text file, and a book from a catalogue is not a different kind of
 * thing once it has been fetched.
 */
export async function fetchBookFile(
  href: string,
  title: string,
  type: string,
  signal?: AbortSignal,
): Promise<File> {
  const verdict = checkUrlShape(href);
  if (!verdict.ok) throw new OpdsError(verdict.reason);

  const response = await fetch(proxied(href, true), { signal, credentials: "omit" }).catch(
    (error) => {
      if ((error as Error)?.name === "AbortError") throw error;
      throw new OpdsError("Could not reach the library. Check your connection and try again.");
    },
  );
  if (!response.ok) {
    // The proxy says why in plain words ("too large to open here", "not on
    // the public internet"); a generic failure hides the one useful fact.
    const said = await response
      .json()
      .then((body: { error?: string }) => body?.error)
      .catch(() => null);
    throw new OpdsError(said ?? "That book could not be downloaded. Try another one.");
  }

  const blob = await response.blob();
  return new File([blob], `${safeName(title)}${extensionFor(type)}`, {
    type: type || blob.type,
  });
}

/** A file name from a title: no separators, no length to break a filesystem. */
function safeName(title: string): string {
  return (
    title
      .replace(/[^\w\s.-]/g, "")
      .trim()
      .slice(0, 80) || "book"
  );
}

function extensionFor(type: string): string {
  if (type.startsWith("application/epub")) return ".epub";
  if (type.startsWith("application/pdf")) return ".pdf";
  if (type.startsWith("text/html") || type.startsWith("application/xhtml")) return ".html";
  return ".txt";
}
