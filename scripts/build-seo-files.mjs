#!/usr/bin/env node
/**
 * Generate robots.txt and sitemap.xml from the routes that actually exist.
 *
 * Hand-written sitemaps rot: a page gets added, nobody remembers this file, and
 * six months later the sitemap advertises a 404 and omits the page that matters.
 * So the list is derived from `src/routes/` on every build, and the private
 * routes are excluded here by the same names the pages themselves mark
 * `noindex` — kept in one list so the two cannot disagree.
 *
 *   node scripts/build-seo-files.mjs
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROUTES_DIR = join(ROOT, "src", "routes");
const PUBLIC_DIR = join(ROOT, "public");

/** Kept out of the index: private, or a duplicate of somewhere else. */
export const PRIVATE_ROUTES = new Set(["account", "login", "signup"]);

const SITE_URL = (process.env.VITE_SITE_URL || "https://neurolens.space").replace(/\/+$/, "");

/**
 * Priority is a hint, and only a relative one — every page at 1.0 says nothing.
 * The app itself outranks the documents that describe it.
 */
const PRIORITY = {
  "/": "1.0",
  "/help": "0.8",
  "/accessibility": "0.7",
  "/whats-new": "0.7",
  "/support": "0.6",
  "/privacy": "0.5",
  "/terms": "0.5",
  "/thank-you": "0.3",
};

export function collectRoutes(dir = ROUTES_DIR) {
  const pages = [];
  for (const entry of readdirSync(dir)) {
    // `api/` serves data, `__root` is the shell, and neither is a page.
    if (entry === "api" || entry.startsWith("__") || entry.startsWith("-")) continue;
    if (!entry.endsWith(".tsx")) continue;
    const name = entry.replace(/\.tsx$/, "");
    if (PRIVATE_ROUTES.has(name)) continue;
    pages.push(name === "index" ? "/" : `/${name}`);
  }
  return pages.sort((a, b) => (a === "/" ? -1 : b === "/" ? 1 : a.localeCompare(b)));
}

/** The file's own last commit would be better, but its mtime needs no git. */
function lastModified(path) {
  try {
    return statSync(path).mtime.toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function buildSitemap(paths) {
  const entries = paths
    .map((path) => {
      const file = join(ROUTES_DIR, path === "/" ? "index.tsx" : `${path.slice(1)}.tsx`);
      return [
        "  <url>",
        `    <loc>${SITE_URL}${path === "/" ? "/" : path}</loc>`,
        `    <lastmod>${lastModified(file)}</lastmod>`,
        `    <changefreq>${path === "/" ? "weekly" : "monthly"}</changefreq>`,
        `    <priority>${PRIORITY[path] ?? "0.5"}</priority>`,
        "  </url>",
      ].join("\n");
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemap.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`.replace(
    "http://www.sitemap.org/schemas/sitemap/0.9",
    "http://www.sitemaps.org/schemas/sitemap/0.9",
  );
}

export function buildRobots() {
  return [
    "# NeuroLens",
    "",
    "User-agent: *",
    "Allow: /",
    "",
    "# Private, and nothing a search result could usefully offer.",
    ...[...PRIVATE_ROUTES].map((name) => `Disallow: /${name}`),
    "",
    "# Data endpoints, not pages.",
    "Disallow: /api/",
    "",
    "# Tab state is a query on the home page, not separate pages — indexing",
    "# them would put five near-identical results in front of one query.",
    "Disallow: /*?view=",
    "",
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    "",
  ].join("\n");
}

function main() {
  const paths = collectRoutes();
  writeFileSync(join(PUBLIC_DIR, "sitemap.xml"), buildSitemap(paths), "utf8");
  writeFileSync(join(PUBLIC_DIR, "robots.txt"), buildRobots(), "utf8");
  console.log(`[seo] sitemap.xml — ${paths.length} pages: ${paths.join(", ")}`);
  console.log(`[seo] robots.txt — sitemap at ${SITE_URL}/sitemap.xml`);
}

if (process.argv[1] && readFileSync(process.argv[1], "utf8").includes("build-seo-files")) {
  main();
}
