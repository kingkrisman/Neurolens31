import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { Markdown } from "@/components/blog/markdown";
import { PublicLayout } from "@/components/public-layout";
import { formatDate, publishedPost, readingMinutes } from "@/lib/blog";
import { SITE, breadcrumbJsonLd, jsonLd, seo } from "@/lib/seo";

export const Route = createFileRoute("/blog/$slug")({
  loader: async ({ params }) => {
    const post = await publishedPost(params.slug);
    if (!post) throw notFound();
    return post;
  },
  head: ({ loaderData: post }) => {
    if (!post) return seo({ title: "Post not found", noindex: true });
    const path = `/blog/${post.slug}`;
    return {
      ...seo({
        title: post.title,
        description: post.excerpt || post.body.replace(/[#*_>`[\]()!]/g, "").slice(0, 155),
        path,
        image: post.cover_url ?? undefined,
        imageAlt: post.cover_alt || post.title,
        type: "article",
        modified: post.updated_at,
      }),
      scripts: [
        jsonLd(
          breadcrumbJsonLd([
            { name: "NeuroLens", path: "/" },
            { name: "Blog", path: "/blog" },
            { name: post.title, path },
          ]),
        ),
        jsonLd({
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: post.title,
          description: post.excerpt,
          image: post.cover_url ? [post.cover_url] : undefined,
          datePublished: post.published_at,
          dateModified: post.updated_at,
          author: { "@type": "Organization", name: post.author_name || SITE.name, url: SITE.url },
          publisher: {
            "@type": "Organization",
            name: SITE.name,
            logo: { "@type": "ImageObject", url: `${SITE.url}/logo-512.png` },
          },
          mainEntityOfPage: `${SITE.url}${path}`,
          keywords: post.tags.join(", ") || undefined,
        }),
      ],
    };
  },
  component: BlogPostPage,
  notFoundComponent: MissingPost,
});

function BlogPostPage() {
  const post = Route.useLoaderData();
  return (
    <PublicLayout
      eyebrow="Blog"
      title={post.title}
      lead={post.excerpt || undefined}
      image={post.cover_url ?? undefined}
      imageAlt={post.cover_alt}
      meta={
        <>
          <span>{formatDate(post.published_at)}</span>
          <span aria-hidden className="size-1 rounded-full bg-fg/20" />
          <span>{readingMinutes(post.body)} minute read</span>
        </>
      }
    >
      <article className="doc-prose blog-prose">
        <Markdown>{post.body}</Markdown>
      </article>

      <aside className="mt-14 rounded-2xl bg-surface p-6 shadow-border sm:p-7">
        <p className="text-lg font-semibold tracking-[-0.01em] text-fg">Read anything the way that suits you</p>
        <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-muted">
          NeuroLens is a free reader for ADHD, dyslexia and tired eyes: bold word starts, calmer spacing,
          and colours you choose, for any text, PDF or ebook.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
          <Link
            to="/"
            className="inline-flex h-11 items-center rounded-full bg-fg px-5 text-sm font-semibold text-bg transition-[transform,opacity] duration-150 ease-out hover:opacity-90 active:scale-[0.97]"
          >
            Try NeuroLens free
          </Link>
          <Link to="/blog" className="text-sm text-fg underline decoration-fg/30 underline-offset-4 hover:decoration-fg">
            More from the blog
          </Link>
        </div>
      </aside>
    </PublicLayout>
  );
}

function MissingPost() {
  return (
    <PublicLayout eyebrow="Blog" title="That post is not here." lead="It may have moved, or not be published yet.">
      <Link to="/blog" className="text-fg underline decoration-fg/30 underline-offset-4">
        See all posts
      </Link>
    </PublicLayout>
  );
}
