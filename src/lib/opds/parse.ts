/**
 * Read an OPDS catalogue.
 *
 * OPDS is the open standard for book catalogues, and it is what makes "connect
 * my library" a thing this app can honestly offer. Calibre-Web, Kavita, Komga,
 * Standard Ebooks and a great many public libraries publish one; Kindle,
 * Libby and Hoopla do not publish anything, which is why none of them can be
 * supported however much one would like to.
 *
 * Two shapes exist and both turn up in the wild: OPDS 1.x is Atom XML and is
 * what almost everything still serves, OPDS 2.0 is JSON. Both are handled here
 * and both collapse into the same `OpdsFeed`, so nothing downstream has to
 * care which it met.
 *
 * Parsed with `DOMParser`, so this runs in the browser. The server side only
 * proxies bytes — it never parses a feed, which keeps a hostile catalogue from
 * reaching anything but the tab that asked for it.
 */

/** A downloadable file for one book. */
export interface OpdsAcquisition {
  href: string;
  /** `application/epub+zip`, `text/plain`, `application/pdf`… */
  type: string;
  /** "open-access", "borrow", "buy" — absent means a plain download. */
  rel: string | null;
}

export interface OpdsEntry {
  id: string;
  title: string;
  authors: string[];
  summary: string | null;
  language: string | null;
  updated: string | null;
  coverUrl: string | null;
  /** Files this entry offers. Empty for a navigation entry. */
  acquisitions: OpdsAcquisition[];
  /** Where this entry leads, for a navigation entry. */
  navigationUrl: string | null;
}

export interface OpdsFeed {
  title: string;
  entries: OpdsEntry[];
  /** Paging and structure, already resolved to absolute URLs. */
  nextUrl: string | null;
  previousUrl: string | null;
  searchUrl: string | null;
}

const ACQUISITION_REL = "http://opds-spec.org/acquisition";
const IMAGE_RELS = ["http://opds-spec.org/image/thumbnail", "http://opds-spec.org/image"];
const CATALOG_TYPE = "application/atom+xml";

/** Make a feed-relative href absolute, so nothing downstream needs the base. */
function absolute(href: string | null, base: string): string | null {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

const text = (node: Element | null): string | null => {
  const value = node?.textContent?.trim();
  return value ? value : null;
};

/**
 * Whether a link leads to another page of catalogue rather than to a file.
 *
 * Decided by media type, not by `rel`: a navigation entry is one whose link is
 * itself a catalogue. Some servers omit the OPDS profile parameter, so the
 * check is on the Atom type with the profile treated as a bonus.
 */
function isCatalogLink(type: string | null): boolean {
  return Boolean(type && type.startsWith(CATALOG_TYPE));
}

function parseAtomEntry(entry: Element, base: string): OpdsEntry | null {
  const title = text(entry.querySelector("title"));
  if (!title) return null;

  const authors = [...entry.querySelectorAll("author > name")]
    .map((node) => text(node))
    .filter((name): name is string => Boolean(name));

  const acquisitions: OpdsAcquisition[] = [];
  let coverUrl: string | null = null;
  let navigationUrl: string | null = null;

  for (const link of entry.querySelectorAll("link")) {
    const rel = link.getAttribute("rel");
    const type = link.getAttribute("type");
    const href = absolute(link.getAttribute("href"), base);
    if (!href) continue;

    if (rel && IMAGE_RELS.includes(rel)) {
      coverUrl ??= href;
      continue;
    }
    if (rel?.startsWith(ACQUISITION_REL)) {
      acquisitions.push({
        href,
        type: type ?? "",
        // "…/acquisition/open-access" → "open-access".
        rel: rel === ACQUISITION_REL ? null : rel.slice(ACQUISITION_REL.length + 1) || null,
      });
      continue;
    }
    /**
     * Plain Atom `enclosure` counts as a download too.
     *
     * Not every feed worth reading uses the OPDS acquisition rel. Standard
     * Ebooks publishes a straight Atom feed whose books hang off
     * `rel="enclosure"`, and treating only the OPDS rel as a file made every
     * entry there look like it had nothing to download — the catalogue
     * appeared to load and to be full of books that could not be opened.
     */
    if (rel === "enclosure") {
      acquisitions.push({ href, type: type ?? "", rel: null });
      continue;
    }
    if (isCatalogLink(type)) navigationUrl ??= href;
  }

  return {
    id: text(entry.querySelector("id")) ?? `${base}#${title}`,
    title,
    authors,
    summary: text(entry.querySelector("summary")) ?? text(entry.querySelector("content")),
    language: text(entry.querySelector("language")),
    updated: text(entry.querySelector("updated")),
    coverUrl,
    acquisitions,
    navigationUrl,
  };
}

function parseAtom(doc: Document, base: string): OpdsFeed | null {
  const feed = doc.querySelector("feed");
  if (!feed) return null;

  let nextUrl: string | null = null;
  let previousUrl: string | null = null;
  let searchUrl: string | null = null;

  // `:scope >` so a link inside an entry is not mistaken for the feed's own.
  for (const link of feed.querySelectorAll(":scope > link")) {
    const rel = link.getAttribute("rel");
    const href = absolute(link.getAttribute("href"), base);
    if (!href) continue;
    if (rel === "next") nextUrl ??= href;
    else if (rel === "previous" || rel === "prev") previousUrl ??= href;
    else if (rel === "search") searchUrl ??= href;
  }

  const entries: OpdsEntry[] = [];
  for (const entry of feed.querySelectorAll(":scope > entry")) {
    const parsed = parseAtomEntry(entry, base);
    if (parsed) entries.push(parsed);
  }

  return {
    title: text(feed.querySelector(":scope > title")) ?? "Catalogue",
    entries,
    nextUrl,
    previousUrl,
    searchUrl,
  };
}

/* ── OPDS 2.0 (JSON) ─────────────────────────────────────────────────────── */

type JsonLink = { href?: string; type?: string; rel?: string | string[] };
type JsonPublication = {
  metadata?: {
    identifier?: string;
    title?: string;
    author?: unknown;
    description?: string;
    language?: string | string[];
    modified?: string;
  };
  links?: JsonLink[];
  images?: JsonLink[];
};

const rels = (link: JsonLink): string[] =>
  Array.isArray(link.rel) ? link.rel : link.rel ? [link.rel] : [];

function authorNames(author: unknown): string[] {
  if (!author) return [];
  const list = Array.isArray(author) ? author : [author];
  return list
    .map((one) => (typeof one === "string" ? one : (one as { name?: string })?.name))
    .filter((name): name is string => Boolean(name));
}

function parseJsonPublication(item: JsonPublication, base: string): OpdsEntry | null {
  const meta = item.metadata ?? {};
  if (!meta.title) return null;

  const acquisitions: OpdsAcquisition[] = [];
  let navigationUrl: string | null = null;
  for (const link of item.links ?? []) {
    const href = absolute(link.href ?? null, base);
    if (!href) continue;
    const linkRels = rels(link);
    if (isCatalogLink(link.type ?? null) || link.type === "application/opds+json") {
      navigationUrl ??= href;
      continue;
    }
    acquisitions.push({
      href,
      type: link.type ?? "",
      rel:
        linkRels.find((r) => r.startsWith(ACQUISITION_REL))?.slice(ACQUISITION_REL.length + 1) ||
        null,
    });
  }

  const language = Array.isArray(meta.language)
    ? (meta.language[0] ?? null)
    : (meta.language ?? null);

  return {
    id: meta.identifier ?? `${base}#${meta.title}`,
    title: meta.title,
    authors: authorNames(meta.author),
    summary: meta.description ?? null,
    language,
    updated: meta.modified ?? null,
    coverUrl: absolute(item.images?.[0]?.href ?? null, base),
    acquisitions,
    navigationUrl,
  };
}

function parseJson(body: unknown, base: string): OpdsFeed | null {
  const feed = body as {
    metadata?: { title?: string };
    publications?: JsonPublication[];
    navigation?: JsonLink[];
    links?: JsonLink[];
  };
  if (!feed || typeof feed !== "object") return null;
  if (!feed.publications && !feed.navigation) return null;

  const entries: OpdsEntry[] = [];
  for (const item of feed.publications ?? []) {
    const parsed = parseJsonPublication(item, base);
    if (parsed) entries.push(parsed);
  }
  for (const link of feed.navigation ?? []) {
    const href = absolute(link.href ?? null, base);
    if (!href) continue;
    entries.push({
      id: href,
      title: (link as { title?: string }).title ?? href,
      authors: [],
      summary: null,
      language: null,
      updated: null,
      coverUrl: null,
      acquisitions: [],
      navigationUrl: href,
    });
  }

  let nextUrl: string | null = null;
  let previousUrl: string | null = null;
  let searchUrl: string | null = null;
  for (const link of feed.links ?? []) {
    const href = absolute(link.href ?? null, base);
    if (!href) continue;
    const linkRels = rels(link);
    if (linkRels.includes("next")) nextUrl ??= href;
    if (linkRels.includes("previous") || linkRels.includes("prev")) previousUrl ??= href;
    if (linkRels.includes("search")) searchUrl ??= href;
  }

  return { title: feed.metadata?.title ?? "Catalogue", entries, nextUrl, previousUrl, searchUrl };
}

/**
 * Parse whatever a catalogue returned.
 *
 * Sniffed from the body rather than trusted from `Content-Type`, because
 * plenty of servers label an OPDS feed `application/xml`, `text/xml`, or
 * nothing at all.
 */
export function parseOpds(body: string, base: string): OpdsFeed | null {
  const trimmed = body.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("{")) {
    try {
      return parseJson(JSON.parse(trimmed), base);
    } catch {
      return null;
    }
  }

  if (typeof DOMParser === "undefined") return null;
  const doc = new DOMParser().parseFromString(trimmed, "application/xml");
  // A parse failure is reported as a document containing an error element
  // rather than as an exception.
  if (doc.querySelector("parsererror")) return null;
  return parseAtom(doc, base);
}

/** Types this app can actually open, best first. */
const READABLE = [
  "text/plain",
  "application/epub+zip",
  "application/pdf",
  "text/html",
  "application/xhtml+xml",
];

/**
 * The file to fetch for an entry, or null when there is nothing readable.
 *
 * Prefers plain text, then EPUB, then PDF — the order the reader handles best.
 * Anything needing a loan or a purchase is skipped: those are DRM flows this
 * app has no part in, and offering a download that turns into a paywall is
 * worse than offering nothing.
 */
export function bestAcquisition(entry: OpdsEntry): OpdsAcquisition | null {
  const open = entry.acquisitions.filter((file) => file.rel === null || file.rel === "open-access");
  for (const type of READABLE) {
    const match = open.find((file) => file.type.startsWith(type));
    if (match) return match;
  }
  return null;
}

/** Whether this entry is a folder rather than a book. */
export function isNavigation(entry: OpdsEntry): boolean {
  return entry.acquisitions.length === 0 && Boolean(entry.navigationUrl);
}

/**
 * One row per book, not one per edition.
 *
 * Project Gutenberg lists "with images" and "no images" as separate entries
 * with the same title and author, so a book's page showed what looked like the
 * same book twice with nothing to tell them apart. The first readable entry is
 * kept; the others are the same text. Folders and unreadable entries pass
 * through untouched.
 */
export function collapseEditions(entries: OpdsEntry[]): OpdsEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (!bestAcquisition(entry)) return true;
    const key = `${entry.title.trim().toLowerCase()}|${entry.authors.join(",").toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The line under a title: the authors, or failing that a summary short enough
 * to be a byline.
 *
 * Gutenberg's lists put the author in the entry's text rather than in an
 * author element, so without the fallback every book read "Browse this
 * collection". A long summary is a description, not a byline, and is left out.
 */
export function entryByline(entry: OpdsEntry): string | null {
  if (entry.authors.length > 0) return entry.authors.join(", ");
  const summary = entry.summary?.replace(/\s+/g, " ").trim();
  return summary && summary.length <= 80 ? summary : null;
}
