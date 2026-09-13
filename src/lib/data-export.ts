import type { Bookmark, Highlight, SavedProfile, Session } from "./types.ts";

/**
 * Getting your things out.
 *
 * Everything this app knows lives in one browser's localStorage, which is the
 * right default — no account, no server, no reading history leaving the device.
 * It has one cost, and it is a real one: clear site data, switch browsers, or
 * lose the machine, and it is all gone. Highlights especially, which someone
 * may have spent a term collecting.
 *
 * So the data can be taken out. Not as a sync feature, which would mean
 * accounts and a server and giving up the property that makes the local model
 * worth having — just a file, produced on demand, that belongs to the reader.
 */

export interface ExportBundle {
  app: "NeuroLens";
  version: 1;
  exportedAt: string;
  sessions: Session[];
  highlights: Record<string, Highlight[]>;
  bookmarks: Bookmark[];
  savedProfiles: SavedProfile[];
  profile: unknown;
  targetWpm: unknown;
}

/** Kick off a download. Blob-and-revoke, so nothing is left holding memory. */
export function downloadFile(name: string, body: string, type: string) {
  if (typeof document === "undefined") return;
  const blob = new Blob([body], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Deferred: revoking synchronously can cancel the download in some browsers
  // before it has actually started reading the blob.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Highlights as Markdown, grouped by book.
 *
 * Markdown rather than JSON, because these are the export someone actually
 * reads: they go into notes, an essay, a reading journal. A JSON dump of the
 * same passages would be technically complete and useless for the purpose.
 * Notes are quoted beneath their passage so the pairing survives the trip.
 */
export function highlightsAsMarkdown(
  highlights: Record<string, Highlight[]>,
  titleFor: (key: string) => string,
): string {
  const books = Object.entries(highlights).filter(([, marks]) => marks.length > 0);
  if (!books.length) return "# NeuroLens highlights\n\nNothing marked yet.\n";

  const lines: string[] = ["# NeuroLens highlights", "", `Exported ${stamp()}.`, ""];

  for (const [key, marks] of books) {
    lines.push(`## ${titleFor(key)}`, "");
    const ordered = [...marks].sort(
      (a, b) => a.section - b.section || a.lineIdx - b.lineIdx || a.start - b.start,
    );
    for (const mark of ordered) {
      lines.push(`> ${mark.text.replace(/\n+/g, " ").trim()}`);
      if (mark.note) lines.push("", `${mark.note.replace(/\n+/g, " ").trim()}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

export function exportHighlights(
  highlights: Record<string, Highlight[]>,
  titleFor: (key: string) => string,
) {
  downloadFile(`neurolens-highlights-${stamp()}.md`, highlightsAsMarkdown(highlights, titleFor), "text/markdown");
}

/**
 * Everything, as JSON.
 *
 * Session text is included. It makes the file large — a shelf of novels is
 * megabytes — but a backup that cannot restore what you were reading is not a
 * backup, and this is the file someone reaches for after losing a machine.
 */
export function buildBundle(state: {
  sessions: Session[];
  highlights: Record<string, Highlight[]>;
  bookmarks: Bookmark[];
  savedProfiles: SavedProfile[];
  profile: unknown;
  targetWpm: unknown;
}): ExportBundle {
  return {
    app: "NeuroLens",
    version: 1,
    exportedAt: new Date().toISOString(),
    ...state,
  };
}

export function exportEverything(state: Parameters<typeof buildBundle>[0]) {
  downloadFile(
    `neurolens-backup-${stamp()}.json`,
    JSON.stringify(buildBundle(state), null, 2),
    "application/json",
  );
}
