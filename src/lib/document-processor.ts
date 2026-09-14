import { joinPdfPages } from "./pdf-pages.ts";
import { textFromItems } from "./pdf-text.ts";
import { rememberPdfDocument } from "./pdf-session.ts";

export interface ProcessedDocument {
  content: string;
  title: string;
  metadata: {
    format: string;
    pageCount?: number;
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

function isTextFile(name: string, mime: string): boolean {
  const ext = extensionOf(name);
  if (ext === "txt" || ext === "md" || ext === "markdown") return true;
  if (mime.startsWith("text/")) return true;
  if (mime === "application/markdown" || mime === "text/markdown") return true;
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
      // Construction succeeding is the signal — the pdf.js worker sends nothing
      // until it is spoken to, so there is no message to wait for.
      setTimeout(() => finish(true), 250);
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
      throw new Error("Could not read that PDF. Try a text file, or paste the contents.");
    }

    // Every page. A book is not less of a book past some page number, and a
    // reader who uploads one and silently gets two hundred pages of it has
    // been given a worse thing than an error.
    const pages = pdf.numPages;
    const pageTexts: string[] = [];
    let textlessPages = 0;
    onProgress?.(0, pages);
    try {
      for (let i = 1; i <= pages; i += 1) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        // Rebuilt from the runs' own geometry. Joining them with a space and
        // flattening the whitespace put spaces inside words and ran headings
        // into the paragraph beneath them.
        // `items` also carries marked-content markers, which hold no text.
        pageTexts.push(textFromItems(content.items.flatMap((item) => ("str" in item ? [item] : []))));
        // Hand back the page's parsed operators and fonts now that its text
        // has been taken. Without this pdf.js holds every page it has touched,
        // so memory climbs with the length of the book — which is the thing
        // that actually decides whether a long one can be opened on a phone.
        if (!pageTexts[pageTexts.length - 1]!.trim()) textlessPages += 1;
        page.cleanup();
        // Every few pages, hand the thread back so the progress label can
        // actually draw. A three-hundred-page book otherwise parses behind a
        // frozen screen, which reads as a broken upload rather than a slow one.
        if (i % 5 === 0 || i === pages) {
          onProgress?.(i, pages);
          await nextFrame();
        }
      }
    } catch {
      throw new Error("Could not read that PDF. Try a text file, or paste the contents.");
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
        wordCount: words,
        estimatedReadTime: Math.max(1, Math.ceil((words || pages * 80) / 200)),
      },
    };
  });
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

    throw new Error(`Unsupported file format: ${extensionOf(name) || mime || "unknown"}. Use PDF, .txt, or .md.`);
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error("Could not read that file. Paste the text instead.");
  }
}
