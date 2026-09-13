import { asRemoteError, fetchJson, isAbortError, RemoteError } from "./remote.ts";

export const POETRYDB_ORIGIN = "https://poetrydb.org";
/** Exact endpoint requested for the featured poem. */
export const OZYMANDIAS_LINES_URL = `${POETRYDB_ORIGIN}/title/Ozymandias/lines.json`;

export interface Poem {
  title: string;
  author: string;
  lines: string[];
}

export const FEATURED_POEMS: { title: string; author: string; url?: string }[] = [
  { title: "Ozymandias", author: "Percy Bysshe Shelley", url: OZYMANDIAS_LINES_URL },
  { title: "Sonnet 18: Shall I compare thee to a summer's day?", author: "William Shakespeare" },
  { title: "The Raven", author: "Edgar Allan Poe" },
  { title: '"Hope" is the thing with feathers', author: "Emily Dickinson" },
];

export function poetryTitleUrl(title: string): string {
  return `${POETRYDB_ORIGIN}/title/${encodeURIComponent(title.trim())}`;
}

export function poetryAuthorUrl(author: string): string {
  return `${POETRYDB_ORIGIN}/author/${encodeURIComponent(author.trim())}`;
}

export function poetryRandomUrl(count = 6): string {
  return `${POETRYDB_ORIGIN}/random/${count}`;
}

interface PoetryRecord {
  title?: string;
  author?: string;
  lines?: string[];
  status?: number;
  reason?: string;
}

function isMiss(data: unknown): boolean {
  return Boolean(
    data && typeof data === "object" && "status" in data && (data as PoetryRecord).status === 404,
  );
}

function normalize(record: PoetryRecord, fallback?: { title?: string; author?: string }): Poem | null {
  const lines = (record.lines ?? []).map((line) => line.trimEnd()).filter((line) => line !== undefined);
  if (!lines.length) return null;
  const title = (record.title ?? fallback?.title ?? "Untitled").trim();
  const author = (record.author ?? fallback?.author ?? "Unknown").trim();
  return { title, author, lines };
}

function asList(data: PoetryRecord[] | PoetryRecord): PoetryRecord[] {
  if (isMiss(data)) return [];
  return Array.isArray(data) ? data : [data];
}

async function getPoems(
  url: string,
  signal: AbortSignal | undefined,
  fallback?: { title?: string; author?: string },
): Promise<Poem[]> {
  const data = await fetchJson<PoetryRecord[] | PoetryRecord>(url, { signal });
  return asList(data)
    .map((item) => normalize(item, fallback))
    .filter((item): item is Poem => item !== null);
}

export async function fetchOzymandias(signal?: AbortSignal): Promise<Poem> {
  const poems = await getPoems(OZYMANDIAS_LINES_URL, signal, {
    title: "Ozymandias",
    author: "Percy Bysshe Shelley",
  });
  const poem = poems[0];
  if (!poem) throw new RemoteError("empty", "Ozymandias could not be loaded from PoetryDB.");
  return poem;
}

export async function fetchPoemByTitle(title: string, signal?: AbortSignal): Promise<Poem[]> {
  const poems = await getPoems(poetryTitleUrl(title), signal, { title });
  if (!poems.length) {
    throw new RemoteError("not-found", `No poem titled “${title}” in PoetryDB.`);
  }
  return poems;
}

export async function fetchFeaturedPoem(
  featured: (typeof FEATURED_POEMS)[number],
  signal?: AbortSignal,
): Promise<Poem> {
  if (featured.url === OZYMANDIAS_LINES_URL) return fetchOzymandias(signal);
  const poems = await fetchPoemByTitle(featured.title, signal);
  const poem = poems[0];
  if (!poem) throw new RemoteError("not-found", `No poem titled “${featured.title}” in PoetryDB.`);
  return {
    ...poem,
    author: poem.author === "Unknown" ? featured.author : poem.author,
  };
}

export async function searchPoems(query: string, signal?: AbortSignal): Promise<Poem[]> {
  const term = query.trim();
  if (!term) throw new RemoteError("empty", "Type a title or author.");

  try {
    const byTitle = await getPoems(poetryTitleUrl(term), signal);
    if (byTitle.length) return byTitle.slice(0, 12);
  } catch (error) {
    if (isAbortError(error)) throw asRemoteError(error);
  }

  try {
    const byAuthor = await getPoems(poetryAuthorUrl(term), signal);
    if (byAuthor.length) return byAuthor.slice(0, 12);
  } catch (error) {
    if (isAbortError(error)) throw asRemoteError(error);
    throw asRemoteError(error, "PoetryDB could not be reached.");
  }

  throw new RemoteError("not-found", `No poems matching “${term}”. Try Ozymandias, Dickinson, or Keats.`);
}

export async function fetchRandomPoems(signal?: AbortSignal): Promise<Poem[]> {
  const poems = await getPoems(poetryRandomUrl(6), signal);
  if (!poems.length) throw new RemoteError("empty", "PoetryDB returned no poems.");
  return poems;
}

export function poemToReaderText(poem: Poem): string {
  return `${poem.title}\n${poem.author}\n\n${poem.lines.join("\n")}`.trim();
}
