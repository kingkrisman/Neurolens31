import { Link, createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/public-layout";
import { formatDate, publishedPosts } from "@/lib/blog";
import { SITE, breadcrumbJsonLd, jsonLd, seo } from "@/lib/seo";

export const Route = createFileRoute("/blog/")({
  loader: () => publishedPosts(),
  head: ({ loaderData }) => ({
    ...seo({
      title: "Blog",
      description:
        "Notes from NeuroLens on reading with ADHD and dyslexia, focus, cognitive fatigue, and the tools that make long pages easier.",
      path: "/blog",
    }),
    scripts: [
      jsonLd(
        breadcrumbJsonLd([
          { name: "NeuroLens", path: "/" },
          { name: "Blog", path: "/blog" },
        ]),
      ),
      jsonLd({
        "@context": "https://schema.org",
        "@type": "Blog",
        name: "NeuroLens Blog",
        url: `${SITE.url}/blog`,
        publisher: { "@type": "Organization", name: SITE.name, url: SITE.url },
        blogPost: (loaderData ?? []).slice(0, 20).map((post) => ({
          "@type": "BlogPosting",
          headline: post.title,
          url: `${SITE.url}/blog/${post.slug}`,
          datePublished: post.published_at,
        })),
      }),
    ],
  }),
  component: BlogIndex,
});

function BlogIndex() {
  const posts = Route.useLoaderData();
  return (
    <PublicLayout
      eyebrow="Blog"
      title="Notes on reading, attention and focus."
      lead="What we are learning about reading with ADHD, dyslexia and tired eyes, and how NeuroLens is changing because of it."
      wide
      mobileToc={false}
    >
      {posts.length === 0 ? (
        <p className="text-muted">The first posts are on their way.</p>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2">
          {posts.map((post, index) => (
            <li key={post.id} className={index === 0 ? "sm:col-span-2" : undefined}>
              <Link
                to="/blog/$slug"
                params={{ slug: post.slug }}
                className="group block h-full overflow-hidden rounded-2xl bg-surface shadow-border transition-[box-shadow,transform] duration-200 ease-out hover:shadow-border-hover active:scale-[0.99]"
              >
                {post.cover_url ? (
                  <img
                    src={post.cover_url}
                    alt={post.cover_alt}
                    loading={index < 2 ? "eager" : "lazy"}
                    decoding="async"
                    className={index === 0 ? "aspect-[2/1] w-full object-cover" : "aspect-[16/9] w-full object-cover"}
                  />
                ) : null}
                <div className="p-5 sm:p-6">
                  <p className="text-xs tracking-wide text-muted">{formatDate(post.published_at)}</p>
                  <h2
                    className={
                      index === 0
                        ? "mt-2 font-serif text-2xl leading-tight tracking-[-0.01em] text-fg sm:text-3xl"
                        : "mt-2 font-serif text-xl leading-snug tracking-[-0.01em] text-fg"
                    }
                  >
                    {post.title}
                  </h2>
                  {post.excerpt ? (
                    <p className="mt-2 text-sm leading-relaxed text-pretty text-muted">{post.excerpt}</p>
                  ) : null}
                  <p className="mt-4 text-sm font-medium text-fg underline decoration-fg/25 underline-offset-4 group-hover:decoration-fg">
                    Read the post
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PublicLayout>
  );
}
