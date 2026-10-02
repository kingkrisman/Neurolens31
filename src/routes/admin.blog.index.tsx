import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, FilePlus2, LoaderCircle, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { allPosts, deletePost, formatDate, type BlogPost } from "@/lib/blog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/blog/")({
  component: PostList,
});

type Row = Omit<BlogPost, "body">;

function PostList() {
  const [posts, setPosts] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const refresh = () =>
    allPosts().then(setPosts, (failure: Error) =>
      setError(
        /relation .* does not exist|Could not find the table/i.test(failure.message)
          ? "The admin database update has not been run yet (supabase/migrations/0004_admin_blog.sql)."
          : failure.message,
      ),
    );

  useEffect(() => {
    void refresh();
  }, []);

  const remove = async (post: Row) => {
    try {
      await deletePost(post.id);
      toast("Post deleted", { description: post.title });
      setConfirming(null);
      await refresh();
    } catch (failure) {
      toast.error((failure as Error).message);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl tracking-[-0.01em]">Blog</h1>
          <p className="mt-1 text-sm text-muted">Drafts are only visible here. Published posts appear on /blog.</p>
        </div>
        <Link
          to="/admin/blog/$id"
          params={{ id: "new" }}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-fg px-4 text-sm font-semibold text-bg transition-[transform,opacity] duration-150 hover:opacity-90 active:scale-[0.97]"
        >
          <FilePlus2 size={16} aria-hidden /> New post
        </Link>
      </div>

      {error ? (
        <p role="alert" className="mt-8 rounded-2xl bg-danger-soft p-5 text-sm text-danger">
          {error}
        </p>
      ) : posts === null ? (
        <p className="mt-8 flex items-center gap-2 text-sm text-muted" role="status">
          <LoaderCircle size={16} className="animate-spin" aria-hidden /> Loading…
        </p>
      ) : posts.length === 0 ? (
        <div className="mt-8 rounded-2xl bg-surface p-8 text-center shadow-border">
          <p className="font-medium">No posts yet</p>
          <p className="mt-1 text-sm text-muted">Write the first one — it stays a draft until you publish it.</p>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-fg/8 overflow-hidden rounded-2xl bg-surface shadow-border">
          {posts.map((post) => {
            const live = post.status === "published" && post.published_at && new Date(post.published_at) <= new Date();
            return (
              <li key={post.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 sm:px-5">
                {post.cover_url ? (
                  <img src={post.cover_url} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="size-12 shrink-0 rounded-lg bg-fg/6" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <Link
                    to="/admin/blog/$id"
                    params={{ id: post.id }}
                    className="block truncate font-medium text-fg hover:underline"
                  >
                    {post.title}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted">
                    <span
                      className={cn(
                        "mr-2 inline-block rounded-md px-1.5 py-0.5 font-medium",
                        live ? "bg-success/12 text-success" : "bg-fg/6 text-muted",
                      )}
                    >
                      {live ? "Published" : post.status === "published" ? "Scheduled" : "Draft"}
                    </span>
                    {post.status === "published" ? formatDate(post.published_at) : `Edited ${formatDate(post.updated_at)}`}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {live ? (
                    <Link
                      to="/blog/$slug"
                      params={{ slug: post.slug }}
                      target="_blank"
                      className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-sm text-muted hover:bg-fg/6 hover:text-fg"
                    >
                      View <ArrowUpRight size={13} aria-hidden />
                    </Link>
                  ) : null}
                  <Link
                    to="/admin/blog/$id"
                    params={{ id: post.id }}
                    className="inline-flex h-9 items-center rounded-full px-3 text-sm text-fg hover:bg-fg/6"
                  >
                    Edit
                  </Link>
                  {confirming === post.id ? (
                    <span className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void remove(post)}
                        className="h-9 rounded-full bg-danger-soft px-3 text-sm font-medium text-danger hover:bg-danger/15"
                      >
                        Delete for good
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        className="h-9 rounded-full px-3 text-sm text-muted hover:bg-fg/6"
                      >
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(post.id)}
                      aria-label={`Delete ${post.title}`}
                      className="grid size-9 place-items-center rounded-full text-muted hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 size={15} aria-hidden />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
