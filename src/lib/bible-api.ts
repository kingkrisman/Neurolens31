import { BIBLE_BOOKS, type BibleBook } from "./bible.ts";
import { asRemoteError, fetchJson, isAbortError, RemoteError } from "./remote.ts";

export const BIBLE_API_ORIGIN = "https://bible-api.com";
export const HELLOAO_ORIGIN = "https://bible.helloao.org";

export interface BibleRef {
  book: string;
  chapter: number;
  verse?: string | number;
}

export interface BibleApiVerse {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

export interface BiblePassage {
  reference: string;
  text: string;
  verses: BibleApiVerse[];
  translationId: string;
  translationName: string;
  source: "bible-api" | "helloao";
}

export interface BibleTranslation {
  id: string;
  name: string;
  short: string;
  bibleApi?: string;
  helloao?: string;
}

/** Public-domain / openly licensed English texts from bible-api.com, with HelloAO as fallback. */
export const BIBLE_TRANSLATIONS: BibleTranslation[] = [
  { id: "web", name: "World English Bible", short: "WEB", bibleApi: "web", helloao: "ENGWEBP" },
  { id: "kjv", name: "King James Version", short: "KJV", bibleApi: "kjv" },
  { id: "asv", name: "American Standard Version", short: "ASV", bibleApi: "asv" },
  { id: "bbe", name: "Bible in Basic English", short: "BBE", bibleApi: "bbe" },
  { id: "dra", name: "Douay-Rheims", short: "DRA", bibleApi: "dra" },
  { id: "ylt", name: "Young's Literal", short: "YLT", bibleApi: "ylt" },
  { id: "oeb-us", name: "Open English Bible", short: "OEB", bibleApi: "oeb-us" },
  { id: "bsb", name: "Berean Standard Bible", short: "BSB", helloao: "BSB" },
];

export const DEFAULT_TRANSLATION = BIBLE_TRANSLATIONS[0]!;

/** USFM-style ids used by bible.helloao.org/api/{id}/{Book}/{chapter}.json */
export const HELLOAO_BOOK_IDS: Record<string, string> = {
  Genesis: "GEN",
  Exodus: "EXO",
  Leviticus: "LEV",
  Numbers: "NUM",
  Deuteronomy: "DEU",
  Joshua: "JOS",
  Judges: "JDG",
  Ruth: "RUT",
  "1 Samuel": "1SA",
  "2 Samuel": "2SA",
  "1 Kings": "1KI",
  "2 Kings": "2KI",
  "1 Chronicles": "1CH",
  "2 Chronicles": "2CH",
  Ezra: "EZR",
  Nehemiah: "NEH",
  Esther: "EST",
  Job: "JOB",
  Psalms: "PSA",
  Proverbs: "PRO",
  Ecclesiastes: "ECC",
  "Song of Solomon": "SNG",
  Isaiah: "ISA",
  Jeremiah: "JER",
  Lamentations: "LAM",
  Ezekiel: "EZK",
  Daniel: "DAN",
  Hosea: "HOS",
  Joel: "JOL",
  Amos: "AMO",
  Obadiah: "OBA",
  Jonah: "JON",
  Micah: "MIC",
  Nahum: "NAM",
  Habakkuk: "HAB",
  Zephaniah: "ZEP",
  Haggai: "HAG",
  Zechariah: "ZEC",
  Malachi: "MAL",
  Matthew: "MAT",
  Mark: "MRK",
  Luke: "LUK",
  John: "JHN",
  Acts: "ACT",
  Romans: "ROM",
  "1 Corinthians": "1CO",
  "2 Corinthians": "2CO",
  Galatians: "GAL",
  Ephesians: "EPH",
  Philippians: "PHP",
  Colossians: "COL",
  "1 Thessalonians": "1TH",
  "2 Thessalonians": "2TH",
  "1 Timothy": "1TI",
  "2 Timothy": "2TI",
  Titus: "TIT",
  Philemon: "PHM",
  Hebrews: "HEB",
  James: "JAS",
  "1 Peter": "1PE",
  "2 Peter": "2PE",
  "1 John": "1JN",
  "2 John": "2JN",
  "3 John": "3JN",
  Jude: "JUD",
  Revelation: "REV",
};

const cache = new Map<string, BiblePassage>();

const ALIASES: Record<string, string> = {
  gn: "Genesis",
  gen: "Genesis",
  ex: "Exodus",
  exo: "Exodus",
  lev: "Leviticus",
  num: "Numbers",
  dt: "Deuteronomy",
  deut: "Deuteronomy",
  jos: "Joshua",
  jdg: "Judges",
  ru: "Ruth",
  "1sam": "1 Samuel",
  "2sam": "2 Samuel",
  "1kgs": "1 Kings",
  "2kgs": "2 Kings",
  "1chr": "1 Chronicles",
  "2chr": "2 Chronicles",
  ezr: "Ezra",
  neh: "Nehemiah",
  est: "Esther",
  job: "Job",
  ps: "Psalms",
  psa: "Psalms",
  psalm: "Psalms",
  pr: "Proverbs",
  prov: "Proverbs",
  ec: "Ecclesiastes",
  ecc: "Ecclesiastes",
  sos: "Song of Solomon",
  "song of songs": "Song of Solomon",
  "song of solomon": "Song of Solomon",
  is: "Isaiah",
  isa: "Isaiah",
  jer: "Jeremiah",
  lam: "Lamentations",
  eze: "Ezekiel",
  da: "Daniel",
  dan: "Daniel",
  hos: "Hosea",
  joe: "Joel",
  am: "Amos",
  ob: "Obadiah",
  jon: "Jonah",
  mic: "Micah",
  nah: "Nahum",
  hab: "Habakkuk",
  zep: "Zephaniah",
  hag: "Haggai",
  zec: "Zechariah",
  mal: "Malachi",
  mt: "Matthew",
  matt: "Matthew",
  mk: "Mark",
  lk: "Luke",
  jn: "John",
  ac: "Acts",
  ro: "Romans",
  rom: "Romans",
  "1cor": "1 Corinthians",
  "2cor": "2 Corinthians",
  gal: "Galatians",
  eph: "Ephesians",
  php: "Philippians",
  col: "Colossians",
  "1th": "1 Thessalonians",
  "1thess": "1 Thessalonians",
  "2th": "2 Thessalonians",
  "2thess": "2 Thessalonians",
  "1ti": "1 Timothy",
  "1tim": "1 Timothy",
  "2ti": "2 Timothy",
  "2tim": "2 Timothy",
  tit: "Titus",
  phm: "Philemon",
  heb: "Hebrews",
  jas: "James",
  "1pe": "1 Peter",
  "1pet": "1 Peter",
  "2pe": "2 Peter",
  "2pet": "2 Peter",
  "1jn": "1 John",
  "2jn": "2 John",
  "3jn": "3 John",
  jud: "Jude",
  rev: "Revelation",
};

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ").replace(/\./g, "");
}

export function resolveBookName(input: string): string | null {
  const key = normalizeKey(input);
  if (!key) return null;
  const alias = ALIASES[key.replace(/\s+/g, "")];
  if (alias) return alias;
  const aliasSpaced = ALIASES[key];
  if (aliasSpaced) return aliasSpaced;
  const exact = BIBLE_BOOKS.find((book) => normalizeKey(book.name) === key);
  if (exact) return exact.name;
  const starts = BIBLE_BOOKS.filter((book) => normalizeKey(book.name).startsWith(key));
  if (starts.length === 1) return starts[0]!.name;
  return null;
}

export function findBook(name: string): BibleBook | undefined {
  const resolved = resolveBookName(name);
  return BIBLE_BOOKS.find((book) => book.name === resolved);
}

export function findTranslation(id: string | undefined | null): BibleTranslation {
  return BIBLE_TRANSLATIONS.find((item) => item.id === id) ?? DEFAULT_TRANSLATION;
}

/** `https://bible-api.com/BOOK+CHAPTER:VERSE` — omit verse for a whole chapter. */
export function bibleApiUrl(ref: BibleRef, translationId = "web"): string {
  const book = ref.book.trim().replace(/\s+/g, "+");
  const verse = ref.verse == null || ref.verse === "" ? "" : String(ref.verse);
  const path = verse ? `${book}+${ref.chapter}:${verse}` : `${book}+${ref.chapter}`;
  const spec = findTranslation(translationId);
  const query = spec.bibleApi && spec.bibleApi !== "web" ? `?translation=${spec.bibleApi}` : "";
  return `${BIBLE_API_ORIGIN}/${path}${query}`;
}

export function helloaoUrl(ref: BibleRef, translationCode: string): string {
  const id = HELLOAO_BOOK_IDS[ref.book] ?? ref.book;
  return `${HELLOAO_ORIGIN}/api/${encodeURIComponent(translationCode)}/${encodeURIComponent(id)}/${ref.chapter}.json`;
}

export function parseReference(input: string): BibleRef | null {
  const raw = input.trim().replace(/\s+/g, " ");
  if (!raw) return null;
  const match = raw.match(/^(.*?)\s+(\d+)(?::(\d+(?:\s*-\s*\d+)?))?$/);
  if (!match) return null;
  const book = resolveBookName(match[1] ?? "");
  const chapter = Number(match[2]);
  const verse = match[3]?.replace(/\s+/g, "");
  if (!book || !Number.isInteger(chapter) || chapter < 1) return null;
  const meta = findBook(book);
  if (meta && chapter > meta.chapters) return null;
  return verse ? { book, chapter, verse } : { book, chapter };
}

function cleanVerse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function parseVerseRange(verse?: string | number): { start?: number; end?: number } {
  if (verse == null || verse === "") return {};
  const match = String(verse).match(/^(\d+)(?:-(\d+))?$/);
  if (!match) return {};
  const start = Number(match[1]);
  const end = Number(match[2] ?? match[1]);
  return { start, end };
}

function formatReference(ref: BibleRef): string {
  const verse = ref.verse == null || ref.verse === "" ? "" : `:${ref.verse}`;
  return `${ref.book} ${ref.chapter}${verse}`;
}

function asPassage(data: {
  reference?: string;
  text?: string;
  verses?: { book_name?: string; chapter?: number; verse?: number; text?: string }[];
  translation_id?: string;
  translation_name?: string;
}): BiblePassage {
  const verses = (data.verses ?? [])
    .map((verse) => ({
      book: verse.book_name ?? "",
      chapter: verse.chapter ?? 0,
      verse: verse.verse ?? 0,
      text: cleanVerse(verse.text ?? ""),
    }))
    .filter((verse) => verse.text && verse.verse > 0);
  return {
    reference: data.reference ?? "",
    text: cleanVerse(data.text ?? ""),
    verses,
    translationId: data.translation_id ?? "web",
    translationName: data.translation_name ?? "World English Bible",
    source: "bible-api",
  };
}

export function passageToReaderText(passage: BiblePassage): string {
  const body = passage.verses.map((verse) => `${verse.verse}  ${verse.text}`).join("\n\n");
  return `${passage.reference}\n${passage.translationName}\n\n${body}`.trim();
}

function flattenHelloaoContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(flattenHelloaoContent).join("");
  if (content && typeof content === "object" && "text" in content) {
    return String((content as { text?: unknown }).text ?? "");
  }
  return "";
}

interface HelloaoChapter {
  translation?: { id?: string; name?: string; englishName?: string };
  book?: { id?: string; name?: string };
  chapter?: {
    number?: number;
    content?: { type?: string; number?: number; content?: unknown }[];
  };
}

function helloaoToPassage(data: HelloaoChapter, ref: BibleRef, spec: BibleTranslation): BiblePassage {
  const range = parseVerseRange(ref.verse);
  const bookName = data.book?.name ?? ref.book;
  const chapter = data.chapter?.number ?? ref.chapter;
  const verses = (data.chapter?.content ?? [])
    .filter((item) => item.type === "verse" && typeof item.number === "number")
    .map((item) => ({
      book: bookName,
      chapter,
      verse: item.number ?? 0,
      text: cleanVerse(flattenHelloaoContent(item.content)),
    }))
    .filter((item) => {
      if (!item.text || item.verse < 1) return false;
      if (range.start != null && item.verse < range.start) return false;
      if (range.end != null && item.verse > range.end) return false;
      return true;
    });
  const name = data.translation?.englishName ?? data.translation?.name ?? spec.name;
  return {
    reference: formatReference(ref),
    text: verses.map((verse) => verse.text).join(" "),
    verses,
    translationId: spec.id,
    translationName: name,
    source: "helloao",
  };
}

export interface FetchPassageOptions {
  signal?: AbortSignal;
  translation?: string;
}

async function fetchFromBibleApi(
  ref: BibleRef,
  spec: BibleTranslation,
  signal?: AbortSignal,
): Promise<BiblePassage> {
  const url = bibleApiUrl(ref, spec.id);
  const data = await fetchJson<{
    reference?: string;
    text?: string;
    verses?: { book_name?: string; chapter?: number; verse?: number; text?: string }[];
    translation_id?: string;
    translation_name?: string;
    error?: string;
  }>(url, { signal });
  if (data.error || !data.verses?.length) {
    throw new RemoteError("not-found", "That reference was not found.");
  }
  const passage = asPassage(data);
  return {
    ...passage,
    translationId: spec.id,
    translationName: data.translation_name ?? spec.name,
  };
}

async function fetchFromHelloao(
  ref: BibleRef,
  spec: BibleTranslation,
  signal?: AbortSignal,
): Promise<BiblePassage> {
  if (!spec.helloao) {
    throw new RemoteError("not-found", "That translation is not available here.");
  }
  const url = helloaoUrl(ref, spec.helloao);
  const data = await fetchJson<HelloaoChapter>(url, { signal });
  const passage = helloaoToPassage(data, ref, spec);
  if (!passage.verses.length) {
    throw new RemoteError("not-found", "That reference was not found.");
  }
  return passage;
}

export async function fetchPassage(
  ref: BibleRef,
  options: FetchPassageOptions | AbortSignal = {},
): Promise<BiblePassage> {
  const opts: FetchPassageOptions =
    options instanceof AbortSignal ? { signal: options } : options;
  const spec = findTranslation(opts.translation);
  const cacheKey = `${spec.id}:${ref.book}:${ref.chapter}:${ref.verse ?? ""}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const errors: RemoteError[] = [];

  if (spec.bibleApi) {
    try {
      const passage = await fetchFromBibleApi(ref, spec, opts.signal);
      cache.set(cacheKey, passage);
      return passage;
    } catch (error) {
      if (isAbortError(error)) throw asRemoteError(error);
      const remote = asRemoteError(error, "Could not load that passage.");
      if (remote.kind === "not-found" && !spec.helloao) throw remote;
      errors.push(remote);
    }
  }

  if (spec.helloao) {
    try {
      const passage = await fetchFromHelloao(ref, spec, opts.signal);
      cache.set(cacheKey, passage);
      return passage;
    } catch (error) {
      if (isAbortError(error)) throw asRemoteError(error);
      errors.push(asRemoteError(error, "Could not load that passage."));
    }
  }

  throw errors[errors.length - 1] ?? new RemoteError("http", "Could not load that passage.");
}
