/** Text helpers for the blog, kept apart from the database code so they can be tested alone. */

/** A web address from a title: "Reading with ADHD, part 2" → "reading-with-adhd-part-2". */
export function slugify(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/** Minutes to read, at an unhurried 200 words a minute. */
export function readingMinutes(markdown: string): number {
  const words = markdown.replace(/!\[[^\]]*\]\([^)]*\)/g, "").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** A date as readers say it: 2 October 2026. */
export function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

