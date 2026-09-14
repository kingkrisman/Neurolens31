import { unzipSync, strFromU8 } from "fflate";
import { joinPdfPages } from "./pdf-pages.ts";
import {
  epubTitle,
  opfPathFrom,
  resolveHref,
  spineOrder,
  textFromDocxXml,
  textFromHtml,
  textFromRtf,
  tidy,
} from "./formats.ts";
import { textFromItems } from "./pdf-text.ts";
import { rememberPdfDocument } from "./pdf-session.ts";

export interface ProcessedDocument {
  content: string;
  title: string;
  metadata: {
    format: string;
    pageCount?: number;
    /** Pages that could not be parsed at all, so the reader can be told. */
    unreadablePages?: number;
    wordCount: number;
    estimatedReadTime: number;
  };
}

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
/**
 * Ceiling for a pasted or uploaded text file.
 *
 * PDFs are no longer held to it — they are read in full. This remains for
 * plain text, where the whole document arrives as one string with no page
 * structure to fall back on.
 */
export const MAX_EXTRACT_CHARS = 400_000;

function summarize(content: string, title: string, format: string, pageCount?: number): ProcessedDocument {
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  return {
    content: content.trim(),
    title,
    metadata: {
      format,
      pageCount,
      wordCount,
      estimatedReadTime: Math.max(1, Math.ceil(wordCount / 200)),
    },
  };
}

function fileMime(file: File): string {
  return typeof file.type === "string" ? file.type.toLowerCase() : "";
}

function fileName(file: File): string {
  return (file.name || "untitled").trim() || "untitled";
}

function extensionOf(name: string): string {
  const parts = name.split(".");
  if (parts.length < 2) return "";
  return (parts.pop() ?? "").toLowerCase();
}

function isPdfFile(name: string, mime: string): boolean {
  return extensionOf(name) === "pdf" || mime === "application/pdf" || mime === "application/x-pdf";
}

/**
 * Plain-text-ish extensions.
 *
 * Listed rather than inferred because a phone often reports no MIME type at
 * all for a file picked out of Files, so the extension is the only thing left
 * to go on.
 */
const TEXT_EXTENSIONS = new Set([
  "txt", "text", "md", "markdown", "mdown", "mkd", "rst", "org", "tex",
  "log", "csv", "tsv", "json", "yaml", "yml", "toml", "ini", "srt", "vtt",
  "adoc", "asciidoc", "nfo", "me", "readme",
]);

function isEpubFile(name: string, mime: string): boolean {
  return extensionOf(name) === "epub" || mime === "application/epub+zip";
}

function isDocxFile(name: string, mime: string): boolean {
  return (
    extensionOf(name) === "docx" ||
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
}

function isHtmlFile(name: string, mime: string): boolean {
  const ext = extensionOf(name);
  return ext === "html" || ext === "htm" || ext === "xhtml" || mime === "text/html" || mime === "application/xhtml+xml";
}

function isRtfFile(name: string, mime: string): boolean {
  return extensionOf(name) === "rtf" || mime === "application/rtf" || mime === "text/rtf";
}

function isTextFile(name: string, mime: string): boolean {
  if (TEXT_EXTENSIONS.has(extensionOf(name))) return true;
  if (mime.startsWith("text/")) return true;
  if (mime === "application/markdown" || mime === "application/json") return true;
  return false;
}

function titleFrom(name: string, pattern: RegExp): string {
  return name.replace(pattern, "") || name;
}

function isPdfNoise(message: string, filename = ""): boolean {
  return /pdf\.worker|pdfjs|Setting up fake worker|Failed to fetch dynamically imported module/i.test(
    `${message} ${filename}`,
  );
}

async function withPdfErrorsSilenced<T>(work: () => Promise<T>): Promise<T> {
  if (typeof window === "undefined") return work();

  const onError = (event: ErrorEvent) => {
    if (isPdfNoise(event.message || "", event.filename || "")) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  const onReject = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason ?? "");
    if (isPdfNoise(message)) event.preventDefault();
  };

  window.addEventListener("error", onError, true);
  window.addEventListener("unhandledrejection", onReject);
  try {
    return await work();
  } finally {
    window.removeEventListener("error", onError, true);
    window.removeEventListener("unhandledrejection", onReject);
  }
}

/** How far into a long book the reader has got, for the progress label. */
export type ProgressFn = (done: number, total: number) => void;

const WORKER_SRC = "/pdf.worker.min.mjs";

/**
 * Whether a real worker can be started.
 *
 * If it cannot, pdf.js quietly substitutes a "fake worker" that parses on the
 * main thread. On a desktop that is merely slow; on a phone, parsing a few
 * hundred pages with the main thread blocked means nothing paints, no progress
 * shows, and the tab is eventually killed — which is indistinguishable from
 * the upload not working, and is what this used to do. Worse, the fallback
 * announces itself through an error this module deliberately silences, so the
 * one clue was being thrown away.
 *
 * Checked up front instead, so the failure is a sentence rather than a freeze.
 */
async function workerUsable(): Promise<boolean> {
  if (typeof Worker === "undefined") return false;

  // Is the file even served, and served as JavaScript? A module worker is
  // refused outright for the wrong content type, and that refusal is
  // asynchronous — late enough that merely constructing one and waiting a
  // moment reports success for a worker that is already doomed.
  try {
    const head = await fetch(WORKER_SRC, { method: "GET", cache: "force-cache" });
    if (!head.ok) return false;
    const type = (head.headers.get("content-type") ?? "").toLowerCase();
    if (type && !/javascript|ecmascript|^text\/plain/.test(type)) return false;
  } catch {
    return false;
  }

  return new Promise<boolean>((resolve) => {
    let worker: Worker | null = null;
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        worker?.terminate();
      } catch {
        /* already gone */
      }
      resolve(ok);
    };
    // Long enough for a cold fetch of the worker on a phone, short enough not
    // to be its own hang.
    const timer = setTimeout(() => finish(false), 6000);
    try {
      worker = new Worker(WORKER_SRC, { type: "module" });
      worker.onerror = () => finish(false);
      // A module worker's import failure arrives asynchronously, so this waits
      // long enough for that error to land rather than declaring success the
      // instant the constructor returns.
      setTimeout(() => finish(true), 900);
    } catch {
      finish(false);
    }
  });
}

/** Let the browser paint. Awaiting pdf.js alone never yields to rendering. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

async function processPdf(file: File, onProgress?: ProgressFn): Promise<ProcessedDocument> {
  if (typeof window === "undefined") {
    throw new Error("PDF parsing is only available in the reader.");
  }

  let pdfjs: typeof import("pdfjs-dist");
  try {
    pdfjs = await import("pdfjs-dist");
  } catch {
    throw new Error("Could not load the PDF reader. Paste the text instead.");
  }

  // Always the public worker — Vite `?url` paths 404 behind the preview proxy
  // and then pdf.js throws outside React's try/catch.
  pdfjs.GlobalWorkerOptions.workerSrc = WORKER_SRC;
  if (!(await workerUsable())) {
    throw new Error(
      "This browser could not start the PDF reader in the background. Reload the page and try again, or paste the text instead.",
    );
  }

  let raw: ArrayBuffer;
  try {
    raw = await file.arrayBuffer();
  } catch {
    // The common one on a phone: the file lives in iCloud and has not been
    // downloaded to the device, so reading it fails before any parsing starts.
    // Unwrapped, this surfaced as a raw NotReadableError with no advice in it.
    throw new Error("Could not open that file. If it is stored in the cloud, download it to this device first.");
  }
  // A view, not a copy. `slice(0)` duplicated the whole file, so a 20 MB book
  // needed 40 MB before pdf.js had allocated anything of its own — which is
  // how an upload dies on a phone rather than failing with a message. Nothing
  // reads `raw` afterwards, so pdf.js is free to take the buffer.
  const data = new Uint8Array(raw);

  return withPdfErrorsSilenced(async () => {
    let pdf: Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;
    try {
      pdf = await pdfjs.getDocument({
        data,
        // Nothing is rendered during extraction, so building real font objects
        // is pure cost — and font construction is one of the places a parse
        // fails on a phone.
        disableFontFace: true,
        useWasm: false,
        useWorkerFetch: false,
        isOffscreenCanvasSupported: false,
        verbosity: 0,
      }).promise;
    } catch (err) {
      const detail = err instanceof Error ? err.message : "";
      if (/password/i.test(detail)) {
        throw new Error("That PDF is password-protected. Paste the text instead.");
      }
      throw new Error("Could not open that PDF. It may be damaged. Try a text file, or paste the contents.");
    }

    // Every page. A book is not less of a book past some page number, and a
    // reader who uploads one and silently gets two hundred pages of it has
    // been given a worse thing than an error.
    const pages = pdf.numPages;
    const pageTexts: string[] = [];
    let textlessPages = 0;
    let unreadablePages = 0;
    /**
     * Why the first page failed.
     *
     * Kept because when *every* page fails the cause is one thing happening
     * repeatedly — a worker that died, a buffer that was detached — and a
     * message that describes the symptom without naming it cannot be acted on
     * by whoever reads it. This is the sentence that ends the guessing.
     */
    let firstFailure = "";
    onProgress?.(0, pages);

    for (let i = 1; i <= pages; i += 1) {
      let text = "";
      try {
        const page = await pdf.getPage(i);
        try {
          const content = await page.getTextContent();
          // Rebuilt from the runs' own geometry. Joining them with a space and
          // flattening the whitespace put spaces inside words and ran headings
          // into the paragraph beneath them.
          // `items` also carries marked-content markers, which hold no text.
          text = textFromItems(content.items.flatMap((item) => ("str" in item ? [item] : [])));
        } finally {
          // Hand back the page's parsed operators and fonts now that its text
          // has been taken. Without this pdf.js holds every page it has
          // touched, so memory climbs with the length of the book — which is
          // what actually decides whether a long one opens on a phone.
          page.cleanup();
        }
      } catch (err) {
        if (!firstFailure) {
          firstFailure = err instanceof Error ? err.message : String(err ?? "");
        }
        // One page that will not parse is one page, not the book.
        //
        // This whole loop used to sit inside a single try, so the first page
        // that failed threw away the other two hundred and seventy-four and
        // reported that the PDF could not be read. A long book on a phone will
        // occasionally lose a page to memory pressure or to a font the engine
        // cannot build, and that is not a reason to refuse the rest of it.
        unreadablePages += 1;
      }

      pageTexts.push(text);
      if (!text.trim()) textlessPages += 1;

      // Every few pages, hand the thread back so the progress label can
      // actually draw. A three-hundred-page book otherwise parses behind a
      // frozen screen, which reads as a broken upload rather than a slow one.
      if (i % 5 === 0 || i === pages) {
        onProgress?.(i, pages);
        await nextFrame();
      }
      // Document-level font and image caches grow across pages regardless of
      // per-page cleanup, so they are dropped periodically too.
      if (i % 40 === 0) {
        try {
          await pdf.cleanup();
        } catch {
          /* a cache that will not clear is not a reason to stop reading */
        }
      }
    }

    // Only a total loss is a failure. Anything less is a book with holes in
    // it, which is worth far more to the reader than a refusal.
    if (unreadablePages === pages) {
      const reason = firstFailure ? ` (${firstFailure.slice(0, 140)})` : "";
      throw new Error(
        `Could not read the pages of that PDF${reason}. Try a text file, or paste the contents.`,
      );
    }

    // The page images are only drawn for pages that yielded no text. When
    // every page has text — which is every ordinary book — nothing will ask
    // for them, and holding a parsed document of several hundred pages is the
    // single largest thing this app can keep in memory. Let it go.
    if (textlessPages > 0) {
      rememberPdfDocument(pdf);
    } else {
      // `loadingTask.destroy()` is the one that frees the worker's side too;
      // `cleanup()` on the proxy only releases per-page caches.
      void pdf.loadingTask.destroy();
    }

    const extracted = pageTexts.join("\n\n").trim();
    const name = fileName(file);
    const joined = joinPdfPages(pageTexts);
    const words = extracted ? extracted.split(/\s+/).length : 0;
    const summary = summarize(extracted || name, titleFrom(name, /\.pdf$/i), "PDF", pages);
    return {
      ...summary,
      content: joined,
      metadata: {
        ...summary.metadata,
        unreadablePages,
        wordCount: words,
        estimatedReadTime: Math.max(1, Math.ceil((words || pages * 80) / 200)),
      },
    };
  });
}

/** Unpack a zip in memory. EPUB and DOCX are both zips with a convention. */
function unzip(data: Uint8Array): Record<string, Uint8Array> {
  try {
    return unzipSync(data);
  } catch {
    throw new Error("That file could not be unpacked. It may be damaged.");
  }
}

function zipText(files: Record<string, Uint8Array>, path: string): string {
  const entry = files[path];
  return entry ? strFromU8(entry) : "";
}

async function bytesOf(file: File): Promise<Uint8Array> {
  try {
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    throw new Error(
      "Could not open that file. If it is stored in the cloud, download it to this device first.",
    );
  }
}

/**
 * An EPUB, in its own reading order.
 *
 * The spine decides the order; the zip's own listing is meaningless. A chapter
 * that will not parse is skipped rather than fatal, for the same reason a PDF
 * page is: losing one chapter is better than losing the book.
 */
async function processEpub(file: File, onProgress?: ProgressFn): Promise<ProcessedDocument> {
  const files = unzip(await bytesOf(file));

  const opfPath = opfPathFrom(zipText(files, "META-INF/container.xml"));
  const opf = opfPath ? zipText(files, opfPath) : "";
  const chapters = opf
    ? spineOrder(opf).map((href) => resolveHref(opfPath!, href))
    : // No package document is not necessarily a broken book — some are built
      // badly. Fall back to every document in the zip, sorted, which at least
      // reads in a stable order.
      Object.keys(files)
        .filter((name) => /\.x?html?$/i.test(name))
        .sort();

  if (!chapters.length) {
    throw new Error("That EPUB has no readable chapters. Try a PDF or paste the text.");
  }

  const parts: string[] = [];
  for (let i = 0; i < chapters.length; i += 1) {
    const raw = zipText(files, chapters[i]!);
    if (raw) {
      const text = textFromHtml(raw);
      if (text) parts.push(text);
    }
    if (i % 5 === 0 || i === chapters.length - 1) {
      onProgress?.(i + 1, chapters.length);
      await nextFrame();
    }
  }

  const content = tidy(parts.join("\n\n"));
  if (!content) throw new Error("That EPUB had no text in it.");

  const name = fileName(file);
  const title = epubTitle(opf) ?? titleFrom(name, /\.epub$/i);
  return summarize(content, title, "EPUB", chapters.length);
}

/** A Word document. Only the body: headers, footers and notes are not the text. */
async function processDocx(file: File): Promise<ProcessedDocument> {
  const files = unzip(await bytesOf(file));
  const xml = zipText(files, "word/document.xml");
  if (!xml) throw new Error("That Word file has no document in it. Try saving it again.");
  const content = textFromDocxXml(xml);
  if (!content) throw new Error("That Word file had no text in it.");
  return summarize(content, titleFrom(fileName(file), /\.docx$/i), "DOCX");
}

async function processHtml(file: File): Promise<ProcessedDocument> {
  let raw: string;
  try {
    raw = await file.text();
  } catch {
    throw new Error("Could not read that page.");
  }
  const content = textFromHtml(raw);
  if (!content) throw new Error("That page had no text in it.");
  // A page's own <title> beats its filename, which is often a slug.
  const titled = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(raw)?.[1];
  const title = (titled ? tidy(titled) : "") || titleFrom(fileName(file), /\.(x?html?)$/i);
  return summarize(content, title, "HTML");
}

async function processRtf(file: File): Promise<ProcessedDocument> {
  let raw: string;
  try {
    raw = await file.text();
  } catch {
    throw new Error("Could not read that file.");
  }
  const content = textFromRtf(raw);
  if (!content) throw new Error("That file had no text in it.");
  return summarize(content, titleFrom(fileName(file), /\.rtf$/i), "RTF");
}

export async function processDocument(file: File, onProgress?: ProgressFn): Promise<ProcessedDocument> {
  if (!file) throw new Error("No file selected.");
  if (typeof file.size === "number" && file.size > MAX_UPLOAD_BYTES) {
    throw new Error("That file is larger than 20 MB. Try a shorter document, or paste the text.");
  }

  const name = fileName(file);
  const mime = fileMime(file);

  try {
    if (isPdfFile(name, mime)) return await processPdf(file, onProgress);
    if (isEpubFile(name, mime)) return await processEpub(file, onProgress);
    if (isDocxFile(name, mime)) return await processDocx(file);
    if (isRtfFile(name, mime)) return await processRtf(file);
    if (isHtmlFile(name, mime)) return await processHtml(file);

    if (isTextFile(name, mime)) {
      let content: string;
      try {
        content = await file.text();
      } catch {
        throw new Error("Could not read that text file.");
      }
      const trimmed = content.trim();
      if (!trimmed) throw new Error("That file was empty.");
      const ext = extensionOf(name);
      const format = ext === "md" || ext === "markdown" ? "MD" : "TXT";
      return summarize(trimmed.slice(0, MAX_EXTRACT_CHARS), titleFrom(name, /\.(txt|md|markdown)$/i), format);
    }

    // Last resort before refusing: a great many things are text with an
    // unfamiliar extension, and reading one is harmless — it either produces
    // prose or it produces nothing, and nothing is caught just below.
    try {
      const guess = tidy(await file.text());
      // Binary read as text is mostly control characters and replacement
      // marks; prose is not.
      let junk = 0;
      for (let i = 0; i < guess.length; i += 1) {
        const code = guess.charCodeAt(i);
        // C0 controls other than tab/newline/carriage return, plus the
        // replacement character a failed decode leaves behind.
        if ((code < 9 || (code > 13 && code < 32)) || code === 0xfffd) junk += 1;
      }
      if (guess.length > 40 && junk / guess.length < 0.02) {
        return summarize(guess.slice(0, MAX_EXTRACT_CHARS), titleFrom(name, /\.[^.]+$/), "TEXT");
      }
    } catch {
      /* fall through to the refusal below */
    }

    throw new Error(
      `NeuroLens cannot read a ${extensionOf(name) || mime || "file"} yet. It reads PDF, EPUB, Word, HTML, RTF, Markdown and plain text — or paste the contents.`,
    );
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error("Could not read that file. Paste the text instead.");
  }
}
