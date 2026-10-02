/**
 * The one address the site calls itself.
 *
 * The site is served from www.neurolens.space; the bare domain answers with a
 * permanent redirect to it. Every canonical link, sitemap entry and robots
 * line must name the address that actually answers. Naming the bare domain
 * told Google "this page lives at an address that redirects elsewhere", which
 * is a contradiction it resolves by trusting neither and indexing slowly.
 *
 * Shared by the page tags (src/lib/seo.ts) and the sitemap and robots.txt
 * (scripts/build-seo-files.mjs), so the two can never disagree again. A
 * VITE_SITE_URL set to the bare domain is corrected rather than obeyed.
 *
 * @param {string | undefined} configured
 * @returns {string}
 */
export function siteOrigin(configured) {
  const raw = (configured || "https://www.neurolens.space").trim().replace(/\/+$/, "");
  try {
    const url = new URL(raw);
    if (url.hostname === "neurolens.space") url.hostname = "www.neurolens.space";
    if (url.hostname.endsWith("neurolens.space")) url.protocol = "https:";
    return url.origin;
  } catch {
    return "https://www.neurolens.space";
  }
}
