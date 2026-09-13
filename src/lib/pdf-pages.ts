/** Sentinel that survives String.trim() (form-feed does not). */
export const PDF_PAGE_BREAK = "\n\n<!--page-->\n\n";

export function joinPdfPages(pages: string[]): string {
  if (pages.length <= 1) return pages[0] ?? "";
  return pages.join(PDF_PAGE_BREAK);
}

export function splitPdfPages(content: string): string[] {
  if (!content) return [];
  if (!content.includes("<!--page-->")) return [content];
  return content.split("<!--page-->").map((page) => page.replace(/^\s+|\s+$/g, ""));
}

export function isPdfPagedContent(content: string): boolean {
  return content.includes("<!--page-->");
}
