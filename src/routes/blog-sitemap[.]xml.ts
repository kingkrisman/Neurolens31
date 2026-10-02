import { createFileRoute } from "@tanstack/react-router";
import { publishedPosts } from "@/lib/blog";
import { SITE } from "@/lib/seo";

/**
 * The blog's sitemap, built on request from the published posts.
 *
 * The main sitemap is written at build time from the page files, which know
 * nothing about posts. This one asks the database, so a post published from
 * the admin page is listed for search engines straight away, with no
 * redeploy. Cached for an hour at the edge.
 */
export const Route = createFileRoute("/blog-sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const posts = await publishedPosts(1000);
        const escape = (value: string) =>
          value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const urls = [
          `  <url>\n    <loc>${SITE.url}/blog</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`,
          ...posts.map((post) =>
            [
              "  <url>",
              `    <loc>${escape(`${SITE.url}/blog/${post.slug}`)}</loc>`,
              `    <lastmod>${(post.updated_at ?? post.published_at ?? "").slice(0, 10)}</lastmod>`,
              "    <changefreq>monthly</changefreq>",
              "    <priority>0.7</priority>",
              post.cover_url
                ? `    <image:image><image:loc>${escape(post.cover_url)}</image:loc></image:image>`
                : "",
              "  </url>",
            ]
              .filter(Boolean)
              .join("\n"),
          ),
        ].join("\n");
        const xml =
          `<?xml version="1.0" encoding="UTF-8"?>\n` +
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n` +
          `${urls}\n</urlset>\n`;
        return new Response(xml, {
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
          },
        });
      },
    },
  },
});
