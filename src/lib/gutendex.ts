import { asRemoteError, fetchJson, fetchText, isAbortError, RemoteError } from "./remote.ts";

export const GUTENDEX_ORIGIN = "https://gutendex.com";
export const GUTENDEX_TIMEOUT_MS = 3_000;
export const GUTENBERG_TEXT_TIMEOUT_MS = 20_000;

export const FEATURED_GUTENDEX_QUERIES = [
  "Austen",
  "Darwin",
  "Frankenstein",
  "Dickens",
  "Sherlock",
  "Homer",
] as const;

export interface GutendexPerson {
  name: string;
  birth_year: number | null;
  death_year: number | null;
}

export interface GutendexBook {
  id: number;
  title: string;
  authors: GutendexPerson[];
  summaries?: string[];
  subjects: string[];
  bookshelves: string[];
  languages: string[];
  copyright: boolean | null;
  media_type: string;
  formats: Record<string, string>;
  download_count: number;
}

export interface GutendexList {
  count: number;
  next: string | null;
  previous: string | null;
  results: GutendexBook[];
  source: "gutendex" | "fallback";
}

/**
 * Should requests go through this app's same-origin proxy?
 *
 * True in the browser, where a direct cross-origin call would be blocked; false
 * on the server, which can reach the upstream host itself.
 *
 * Named `shouldUseSameOriginProxy` rather than `useSameOriginProxy` on purpose:
 * the `use` prefix made every lint pass read a plain predicate as a React hook
 * and report a rules-of-hooks violation at each call site. The rule was right
 * to complain — the name claimed something the function is not.
 */
function shouldUseSameOriginProxy(): boolean {
  return typeof window !== "undefined";
}

export function gutendexBooksUrl(params: URLSearchParams): string {
  const query = params.toString();
  const path = query ? `books?${query}` : "books";
  return shouldUseSameOriginProxy() ? `/api/gutendex/${path}` : `${GUTENDEX_ORIGIN}/${path}`;
}

export function gutendexSearchParams(term: string): URLSearchParams {
  const params = new URLSearchParams({
    languages: "en",
    mime_type: "text/plain",
  });
  const needle = term.trim();
  if (needle) params.set("search", needle);
  return params;
}

export function rewriteGutendexNext(next: string | null): string | null {
  if (!next) return null;
  try {
    const url = new URL(next);
    if (url.hostname !== "gutendex.com" && url.hostname !== "www.gutendex.com") return null;
    const path = `${url.pathname.replace(/^\//, "").replace(/\/$/, "")}${url.search}`;
    return shouldUseSameOriginProxy() ? `/api/gutendex/${path}` : next;
  } catch {
    return null;
  }
}

export function pickGutendexCover(formats: Record<string, string>): string | undefined {
  return formats["image/jpeg"] || formats["image/png"] || undefined;
}

export function pickGutendexTextUrl(formats: Record<string, string>): string | undefined {
  const entries = Object.entries(formats);
  const utf8 = entries.find(([mime, url]) => mime.startsWith("text/plain") && /utf-8/i.test(mime) && isAllowedGutenbergUrl(url));
  if (utf8) return utf8[1];
  const plain = entries.find(([mime, url]) => mime.startsWith("text/plain") && isAllowedGutenbergUrl(url));
  return plain?.[1];
}

const GUTENBERG_HOSTS = new Set(["www.gutenberg.org", "gutenberg.org", "aleph.gutenberg.org"]);

export function isAllowedGutenbergUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    if (!GUTENBERG_HOSTS.has(url.hostname)) return false;
    return /^\/(ebooks|cache\/epub|files)\//.test(url.pathname);
  } catch {
    return false;
  }
}

export function gutenbergFetchUrl(target: string): string {
  return shouldUseSameOriginProxy() ? `/api/gutenberg?url=${encodeURIComponent(target)}` : target;
}

const START_MARK = /\*\*\*\s*START OF (THE |THIS )?PROJECT GUTENBERG EBOOK[\s\S]*?\*\*\*/i;
const END_MARK = /\*\*\*\s*END OF (THE |THIS )?PROJECT GUTENBERG EBOOK[\s\S]*?\*\*\*/i;

export function stripGutenbergBoilerplate(text: string): string {
  let body = text.replace(/^\uFEFF/, "");
  const start = body.match(START_MARK);
  if (start && start.index != null) body = body.slice(start.index + start[0].length);
  const end = body.search(END_MARK);
  if (end !== -1) body = body.slice(0, end);
  return body.replace(/^\s+/, "").trim();
}

function gutenbergBook(
  id: number,
  title: string,
  authors: GutendexPerson[],
  subjects: string[],
  downloads: number,
): GutendexBook {
  return {
    id,
    title,
    authors,
    subjects,
    bookshelves: [],
    languages: ["en"],
    copyright: false,
    media_type: "Text",
    download_count: downloads,
    formats: {
      "text/plain; charset=utf-8": `https://www.gutenberg.org/ebooks/${id}.txt.utf-8`,
      "image/jpeg": `https://www.gutenberg.org/cache/epub/${id}/pg${id}.cover.medium.jpg`,
    },
  };
}

const FALLBACK_SHELF: GutendexBook[] = [
  gutenbergBook(1342, "Pride and Prejudice", [{ name: "Austen, Jane", birth_year: 1775, death_year: 1817 }], ["England -- Fiction"], 198164),
  gutenbergBook(84, "Frankenstein; Or, The Modern Prometheus", [{ name: "Shelley, Mary Wollstonecraft", birth_year: 1797, death_year: 1851 }], ["Science fiction"], 91000),
  gutenbergBook(11, "Alice's Adventures in Wonderland", [{ name: "Carroll, Lewis", birth_year: 1832, death_year: 1898 }], ["Fantasy"], 88000),
  gutenbergBook(1661, "The Adventures of Sherlock Holmes", [{ name: "Doyle, Arthur Conan", birth_year: 1859, death_year: 1930 }], ["Detective and mystery stories"], 72000),
  gutenbergBook(98, "A Tale of Two Cities", [{ name: "Dickens, Charles", birth_year: 1812, death_year: 1870 }], ["France -- History -- Revolution"], 68000),
  gutenbergBook(2701, "Moby Dick; Or, The Whale", [{ name: "Melville, Herman", birth_year: 1819, death_year: 1891 }], ["Whaling -- Fiction"], 54000),
  gutenbergBook(174, "The Picture of Dorian Gray", [{ name: "Wilde, Oscar", birth_year: 1854, death_year: 1900 }], ["Didactic fiction"], 51000),
  gutenbergBook(345, "Dracula", [{ name: "Stoker, Bram", birth_year: 1847, death_year: 1912 }], ["Gothic fiction"], 49000),
  gutenbergBook(1260, "Jane Eyre", [{ name: "Brontë, Charlotte", birth_year: 1816, death_year: 1855 }], ["Orphans -- Fiction"], 43000),
  gutenbergBook(76, "Adventures of Huckleberry Finn", [{ name: "Twain, Mark", birth_year: 1835, death_year: 1910 }], ["Mississippi River -- Fiction"], 41000),
  gutenbergBook(2009, "On the Origin of Species", [{ name: "Darwin, Charles", birth_year: 1809, death_year: 1882 }], ["Evolution (Biology)"], 18000),
  gutenbergBook(6130, "The Iliad", [{ name: "Homer", birth_year: -750, death_year: -650 }], ["Epic poetry, Greek"], 22000),
  gutenbergBook(1727, "The Odyssey", [{ name: "Homer", birth_year: -750, death_year: -650 }], ["Epic poetry, Greek"], 21000),
  gutenbergBook(1952, "The Yellow Wallpaper", [{ name: "Gilman, Charlotte Perkins", birth_year: 1860, death_year: 1935 }], ["Feminist fiction"], 19000),
  gutenbergBook(43, "The Strange Case of Dr. Jekyll and Mr. Hyde", [{ name: "Stevenson, Robert Louis", birth_year: 1850, death_year: 1894 }], ["Horror tales"], 17000),
];

export function fallbackGutendexSearch(term: string): GutendexList {
  const needle = term.trim().toLowerCase();
  const results = needle
    ? FALLBACK_SHELF.filter((book) => {
        const hay = `${book.title} ${book.authors.map((a) => a.name).join(" ")} ${book.subjects.join(" ")}`.toLowerCase();
        return needle.split(/\s+/).every((part) => hay.includes(part));
      })
    : FALLBACK_SHELF;
  return { count: results.length, next: null, previous: null, results, source: "fallback" };
}

export async function searchGutendex(term: string, signal?: AbortSignal): Promise<GutendexList> {
  try {
    const data = await fetchJson<GutendexList>(gutendexBooksUrl(gutendexSearchParams(term)), {
      signal,
      timeoutMs: GUTENDEX_TIMEOUT_MS,
    });
    if (!Array.isArray(data.results)) {
      throw new RemoteError("parse", "Gutendex returned an unexpected catalog.");
    }
    return {
      count: data.count ?? data.results.length,
      next: rewriteGutendexNext(data.next),
      previous: rewriteGutendexNext(data.previous),
      results: data.results,
      source: "gutendex",
    };
  } catch (error) {
    if (isAbortError(error)) throw error;
    return fallbackGutendexSearch(term);
  }
}

export async function fetchGutendexPage(url: string, signal?: AbortSignal): Promise<GutendexList> {
  const data = await fetchJson<GutendexList>(url, { signal, timeoutMs: GUTENDEX_TIMEOUT_MS });
  return {
    count: data.count ?? data.results?.length ?? 0,
    next: rewriteGutendexNext(data.next),
    previous: rewriteGutendexNext(data.previous),
    results: Array.isArray(data.results) ? data.results : [],
    source: "gutendex",
  };
}

export async function fetchGutendexReaderText(book: GutendexBook, signal?: AbortSignal): Promise<string> {
  const target = pickGutendexTextUrl(book.formats);
  if (!target) {
    throw new RemoteError("empty", "That title isn’t available as readable text.");
  }
  try {
    const raw = await fetchText(gutenbergFetchUrl(target), {
      signal,
      timeoutMs: GUTENBERG_TEXT_TIMEOUT_MS,
      retries: 0,
      accept: "text/plain, text/html;q=0.8, */*;q=0.1",
    });
    const stripped = stripGutenbergBoilerplate(raw);
    if (!stripped) throw new RemoteError("empty", "That file didn’t contain readable text.");
    return stripped.slice(0, 400_000);
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw asRemoteError(error, "Could not open that book.");
  }
}
