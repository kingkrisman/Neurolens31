import { asRemoteError, fetchJson, isAbortError, RemoteError } from "./remote.ts";

export const BNB_SPARQL = "https://bnb.data.bl.uk/sparql";
export const OPEN_LIBRARY_SEARCH = "https://openlibrary.org/search.json";
export const OPEN_LIBRARY_ORIGIN = "https://openlibrary.org";
export const OPEN_LIBRARY_COVERS = "https://covers.openlibrary.org";

/** Fail fast — the official BNB SPARQL host is often down. */
export const SPARQL_TIMEOUT_MS = 1500;
export const OPEN_LIBRARY_TIMEOUT_MS = 10_000;

export const OPEN_LIBRARY_FIELDS =
  "key,title,author_name,first_publish_year,cover_i,id_british_national_bibliography,number_of_pages_median";

export const FEATURED_BNB_QUERIES = ["Darwin", "Austen", "Shakespeare", "Dickens"] as const;

export interface BnbBook {
  id: string;
  title: string;
  authors: string[];
  bnbId: string;
  year?: number;
  subjects: string[];
  isbn?: string;
  cover?: string;
  firstSentence?: string;
  pages?: number;
  source: "bnb-sparql" | "open-library";
}

export interface BnbSearchResult {
  books: BnbBook[];
  source: BnbBook["source"];
  query: string;
}

function sparqlEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** SPARQL regex metacharacters — the BNB endpoint is SPARQL 1.0 (no subqueries). */
export function sparqlRegexEscape(value: string): string {
  return sparqlEscape(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

/**
 * Optimized SPARQL 1.0 title search:
 * 1. Bound `dcterms:title` before FILTER so the store can use a title index.
 * 2. Case-insensitive `regex` instead of `LCASE(CONTAINS(...))` (full scan).
 * 3. OPTIONAL joins only after the filter, then LIMIT 12 so contributor
 *    cartesian products stay small.
 */
export function bnbSparqlQuery(term: string): string {
  const needle = sparqlRegexEscape(term.trim());
  const filter = needle ? `FILTER regex(str(?title), "${needle}", "i")` : "";
  return `PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX bibo: <http://purl.org/ontology/bibo/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT ?book ?title ?isbn13 ?authorName WHERE {
  ?book dcterms:title ?title .
  ${filter}
  OPTIONAL { ?book bibo:isbn13 ?isbn13 }
  OPTIONAL { ?book dcterms:contributor ?contrib . ?contrib foaf:name ?authorName }
}
LIMIT 12`;
}

export function bnbSparqlUrl(term: string): string {
  const params = new URLSearchParams({
    query: bnbSparqlQuery(term),
    output: "json",
  });
  return `${BNB_SPARQL}?${params}`;
}

export function openLibrarySearchParams(term: string): URLSearchParams {
  const q = term.trim() || "subject:literature";
  return new URLSearchParams({
    q,
    limit: "12",
    lang: "en",
    fields: OPEN_LIBRARY_FIELDS,
  });
}

/** Public Open Library search URL (lean fields, relevance rank, no BNB gate). */
export function openLibrarySearchUrl(term: string): string {
  return `${OPEN_LIBRARY_SEARCH}?${openLibrarySearchParams(term)}`;
}

/** @deprecated Use openLibrarySearchUrl — BNB identifier filter was dropping most works. */
export function openLibraryBnbUrl(term: string): string {
  return openLibrarySearchUrl(term);
}

export function openLibraryWorkUrl(workKey: string): string {
  const path = workKey.startsWith("/") ? workKey : `/${workKey}`;
  return `${OPEN_LIBRARY_ORIGIN}${path}.json`;
}

export function openLibraryCoverUrl(coverId: number, size: "S" | "M" | "L" = "M"): string {
  return `${OPEN_LIBRARY_COVERS}/b/id/${coverId}-${size}.jpg`;
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

function openLibraryFetchUrl(term: string): string {
  const query = openLibrarySearchParams(term).toString();
  return shouldUseSameOriginProxy()
    ? `/api/openlibrary/search.json?${query}`
    : openLibrarySearchUrl(term);
}

function workFetchUrl(workKey: string): string {
  const path = workKey.startsWith("/") ? workKey : `/${workKey}`;
  const jsonPath = path.endsWith(".json") ? path : `${path}.json`;
  return shouldUseSameOriginProxy() ? `/api/openlibrary${jsonPath}` : `${OPEN_LIBRARY_ORIGIN}${jsonPath}`;
}

function bindingValue(row: Record<string, { value?: string } | undefined>, key: string): string {
  return row[key]?.value?.trim() ?? "";
}

function pickSentence(values?: string[]): string | undefined {
  if (!values?.length) return undefined;
  const english = values.filter((item) => /[A-Za-z]{12,}/.test(item) && !/[ăâîșțА-я]/.test(item));
  const pool = english.length ? english : values;
  const best = [...pool].sort((a, b) => b.length - a.length)[0]?.trim();
  return best || undefined;
}

function pickIsbn(values?: string[]): string | undefined {
  if (!values?.length) return undefined;
  return values.find((item) => item.replace(/-/g, "").length === 13) ?? values[0];
}

interface SparqlResponse {
  results?: {
    bindings?: Record<string, { value?: string }>[];
  };
}

function fromSparql(data: SparqlResponse): BnbBook[] {
  const grouped = new Map<string, BnbBook>();
  for (const row of data.results?.bindings ?? []) {
    const uri = bindingValue(row, "book");
    const title = bindingValue(row, "title");
    if (!uri || !title) continue;
    const existing = grouped.get(uri);
    const author = bindingValue(row, "authorName");
    const isbn = bindingValue(row, "isbn13");
    const bnbId = uri.replace(/^.*\//, "") || uri;
    if (existing) {
      if (author && !existing.authors.includes(author)) existing.authors.push(author);
      if (isbn && !existing.isbn) existing.isbn = isbn;
      continue;
    }
    grouped.set(uri, {
      id: uri,
      title,
      authors: author ? [author] : [],
      bnbId,
      isbn: isbn || undefined,
      subjects: [],
      source: "bnb-sparql",
    });
  }
  return [...grouped.values()];
}

interface OpenLibraryDoc {
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  isbn?: string[];
  id_british_national_bibliography?: string[];
  subject?: string[];
  first_sentence?: string[];
  number_of_pages_median?: number;
}

export function fromOpenLibrary(docs: OpenLibraryDoc[]): BnbBook[] {
  const books: BnbBook[] = [];
  const seen = new Set<string>();
  const ranked = [...docs].sort((a, b) => Number(Boolean(b.cover_i)) - Number(Boolean(a.cover_i)));
  for (const doc of ranked) {
    if (!doc.title) continue;
    const id = doc.key || doc.id_british_national_bibliography?.[0] || doc.title;
    if (seen.has(id)) continue;
    seen.add(id);
    const bnbId = doc.id_british_national_bibliography?.[0] ?? "";
    books.push({
      id,
      title: doc.title,
      authors: doc.author_name ?? [],
      bnbId,
      year: doc.first_publish_year,
      subjects: (doc.subject ?? []).slice(0, 4),
      isbn: pickIsbn(doc.isbn),
      cover: doc.cover_i ? openLibraryCoverUrl(doc.cover_i, "L") : undefined,
      firstSentence: pickSentence(doc.first_sentence),
      pages: doc.number_of_pages_median,
      source: "open-library",
    });
    if (books.length >= 12) break;
  }
  return books;
}

async function searchSparql(term: string, signal?: AbortSignal): Promise<BnbBook[]> {
  const data = await fetchJson<SparqlResponse>(bnbSparqlUrl(term), {
    signal,
    timeoutMs: SPARQL_TIMEOUT_MS,
    accept: "application/sparql-results+json, application/json",
  });
  return fromSparql(data);
}

async function searchOpenLibrary(term: string, signal?: AbortSignal): Promise<BnbBook[]> {
  const options = { signal, timeoutMs: OPEN_LIBRARY_TIMEOUT_MS };
  try {
    const data = await fetchJson<{ docs?: OpenLibraryDoc[] }>(openLibraryFetchUrl(term), options);
    return fromOpenLibrary(data.docs ?? []);
  } catch (error) {
    if (isAbortError(error) || !shouldUseSameOriginProxy()) throw error;
    const data = await fetchJson<{ docs?: OpenLibraryDoc[] }>(openLibrarySearchUrl(term), options);
    return fromOpenLibrary(data.docs ?? []);
  }
}

export async function searchBnb(term: string, signal?: AbortSignal): Promise<BnbSearchResult> {
  const query = term.trim();

  const sparqlAttempt = query
    ? searchSparql(query, signal).catch((error) => {
        if (isAbortError(error)) throw asRemoteError(error);
        return null;
      })
    : Promise.resolve(null);

  let openLibraryError: unknown;
  const openLibraryAttempt = searchOpenLibrary(query, signal).catch((error) => {
    if (isAbortError(error)) throw asRemoteError(error);
    openLibraryError = error;
    return [] as BnbBook[];
  });

  const [sparqlBooks, openLibraryBooks] = await Promise.all([sparqlAttempt, openLibraryAttempt]);

  if (sparqlBooks?.length) return { books: sparqlBooks, source: "bnb-sparql", query };
  if (openLibraryBooks.length) return { books: openLibraryBooks, source: "open-library", query };

  if (openLibraryError) {
    throw asRemoteError(openLibraryError, "The catalog could not be reached.");
  }

  throw new RemoteError(
    "empty",
    query
      ? `No catalog records for “${query}”. Try Austen, Darwin, or Shakespeare.`
      : "No catalog records were returned.",
  );
}

export function bnbToReaderText(book: BnbBook): string {
  const authors = book.authors.length ? `By ${book.authors.join(", ")}` : "Author unrecorded";
  const meta = [
    book.bnbId ? `British National Bibliography ${book.bnbId}` : "Open Library catalog",
    book.year ? `First published ${book.year}` : "",
    book.pages ? `${book.pages} pages` : "",
    book.isbn ? `ISBN ${book.isbn}` : "",
  ].filter(Boolean);
  const subjects = book.subjects.length ? `Subjects: ${book.subjects.join(", ")}` : "";
  const opening = book.firstSentence ?? "";
  return [book.title, authors, meta.join(" · "), subjects, opening]
    .filter(Boolean)
    .join("\n\n");
}

function workDescription(data: { description?: string | { value?: string } }): string {
  const raw = data.description;
  if (typeof raw === "string") return raw.trim();
  if (raw && typeof raw === "object" && typeof raw.value === "string") return raw.value.trim();
  return "";
}

/** Bibliographic record plus Open Library work notes when the work key is available. */
export async function fetchBnbReaderText(book: BnbBook, signal?: AbortSignal): Promise<string> {
  const base = bnbToReaderText(book);
  if (!book.id.includes("/works/")) return base;
  try {
    const data = await fetchJson<{ description?: string | { value?: string } }>(workFetchUrl(book.id), {
      signal,
    });
    const description = workDescription(data);
    if (!description) return base;
    return `${base}\n\n${description}`;
  } catch (error) {
    if (isAbortError(error)) throw asRemoteError(error);
    return base;
  }
}
