import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bold,
  Heading2,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  LoaderCircle,
  Quote,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Markdown } from "@/components/blog/markdown";
import {
  deletePost,
  postById,
  readingMinutes,
  savePost,
  slugify,
  uploadImage,
  type BlogDraft,
} from "@/lib/blog";
import { SITE } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/blog/$id")({
  component: Editor,
});

const EMPTY: BlogDraft = {
  slug: "",
  title: "",
  excerpt: "",
  body: "",
  cover_url: null,
  cover_alt: "",
  tags: [],
  author_name: "NeuroLens",
  status: "draft",
  published_at: null,
};

/** A date for `<input type="datetime-local">`, in the admin's own time zone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function Editor() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const isNew = id === "new";
  const [draft, setDraft] = useState<BlogDraft | null>(isNew ? EMPTY : null);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [tagsText, setTagsText] = useState("");
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"cover" | "body" | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const body = useRef<HTMLTextAreaElement>(null);
  const bodyFile = useRef<HTMLInputElement>(null);
  const coverFile = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isNew) return;
    postById(id).then(
      (post) => {
        if (!post) return setError("That post no longer exists.");
        setDraft(post);
        setTagsText(post.tags.join(", "));
      },
      (failure: Error) => setError(failure.message),
    );
  }, [id, isNew]);

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const update = useCallback((patch: Partial<BlogDraft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setDirty(true);
  }, []);

  const save = useCallback(
    async (status?: BlogDraft["status"]) => {
      if (!draft) return;
      const next: BlogDraft = {
        ...draft,
        status: status ?? draft.status,
        slug: slugify(draft.slug) || slugify(draft.title),
        tags: tagsText
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 12),
      };
      if (!next.title.trim()) return toast.error("Give the post a title first.");
      if (!next.slug) return toast.error("The web address cannot be empty.");
      if (next.status === "draft") next.published_at = draft.status === "published" ? null : draft.published_at;
      setSaving(true);
      try {
        const saved = await savePost(next);
        setDraft(saved);
        setDirty(false);
        setSlugTouched(true);
        toast(
          saved.status === "published"
            ? new Date(saved.published_at ?? 0) > new Date()
              ? "Scheduled"
              : "Published"
            : "Draft saved",
          { description: saved.title },
        );
        if (isNew) void navigate({ to: "/admin/blog/$id", params: { id: saved.id }, replace: true });
      } catch (failure) {
        toast.error((failure as Error).message);
      } finally {
        setSaving(false);
      }
    },
    [draft, tagsText, isNew, navigate],
  );

  // Ctrl/Cmd+S saves without changing whether it is published.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  /** Wrap the selection, or insert at the cursor, and keep the cursor sensible. */
  const insert = (before: string, after = "", placeholder = "") => {
    const area = body.current;
    if (!area || !draft) return;
    const { selectionStart: start, selectionEnd: end, value } = area;
    const chosen = value.slice(start, end) || placeholder;
    const next = value.slice(0, start) + before + chosen + after + value.slice(end);
    update({ body: next });
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(start + before.length, start + before.length + chosen.length);
    });
  };

  const linePrefix = (prefix: string) => {
    const area = body.current;
    if (!area || !draft) return;
    const { selectionStart: start, selectionEnd: end, value } = area;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const chunk = value.slice(lineStart, end);
    const prefixed = chunk
      .split("\n")
      .map((line, index) => (prefix === "1. " ? `${index + 1}. ` : prefix) + line)
      .join("\n");
    update({ body: value.slice(0, lineStart) + prefixed + value.slice(end) });
    requestAnimationFrame(() => area.focus());
  };

  const upload = async (file: File | undefined, where: "cover" | "body") => {
    if (!file) return;
    setUploading(where);
    try {
      const url = await uploadImage(file);
      if (where === "cover") update({ cover_url: url, cover_alt: draft?.cover_alt || "" });
      else {
        const alt = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
        insert(`\n![${alt}](${url})\n`, "", "");
      }
      toast("Picture uploaded");
    } catch (failure) {
      toast.error((failure as Error).message);
    } finally {
      setUploading(null);
    }
  };

  if (error) {
    return (
      <div>
        <BackLink />
        <p role="alert" className="mt-6 rounded-2xl bg-danger-soft p-5 text-sm text-danger">
          {error}
        </p>
      </div>
    );
  }
  if (!draft) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted" role="status">
        <LoaderCircle size={16} className="animate-spin" aria-hidden /> Loading…
      </p>
    );
  }

  const published = draft.status === "published";
  const description = draft.excerpt || draft.body.replace(/[#*_>`[\]()!]/g, "").slice(0, 155);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackLink />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">{dirty ? "Unsaved changes" : draft.id ? "Saved" : ""}</span>
          {published ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void save("draft")}
              className="h-10 rounded-full px-4 text-sm text-fg shadow-border hover:bg-fg/5 disabled:opacity-60"
            >
              Unpublish
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={() => void save("draft")}
              className="h-10 rounded-full px-4 text-sm text-fg shadow-border hover:bg-fg/5 disabled:opacity-60"
            >
              Save draft
            </button>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={() => void save("published")}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-fg px-5 text-sm font-semibold text-bg transition-[transform,opacity] duration-150 hover:opacity-90 active:scale-[0.97] disabled:opacity-60"
          >
            {saving ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : null}
            {published ? "Update" : "Publish"}
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0">
          <label className="sr-only" htmlFor="post-title">
            Title
          </label>
          <textarea
            id="post-title"
            rows={1}
            value={draft.title}
            placeholder="Title"
            onChange={(event) => {
              const title = event.target.value.replace(/\n/g, " ");
              update(slugTouched ? { title } : { title, slug: slugify(title) });
            }}
            className="w-full resize-none bg-transparent font-serif text-3xl leading-tight tracking-[-0.01em] text-fg outline-none placeholder:text-fg/30 sm:text-4xl [field-sizing:content]"
          />

          <div className="mt-6 flex items-center justify-between gap-3">
            <div role="tablist" aria-label="Editor" className="inline-flex rounded-full bg-fg/6 p-1">
              {(["write", "preview"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={tab === value}
                  onClick={() => setTab(value)}
                  className={cn(
                    "h-8 rounded-full px-4 text-sm capitalize",
                    tab === value ? "bg-surface font-medium shadow-border" : "text-muted hover:text-fg",
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted">
              {draft.body.split(/\s+/).filter(Boolean).length} words · {readingMinutes(draft.body)} min read
            </span>
          </div>

          {tab === "write" ? (
            <div className="mt-3 overflow-hidden rounded-2xl bg-surface shadow-border">
              <div className="flex flex-wrap items-center gap-0.5 border-b border-fg/8 p-1.5" role="toolbar" aria-label="Formatting">
                <Tool label="Heading" onClick={() => linePrefix("## ")}>
                  <Heading2 size={16} />
                </Tool>
                <Tool label="Bold" onClick={() => insert("**", "**", "bold text")}>
                  <Bold size={16} />
                </Tool>
                <Tool label="Italic" onClick={() => insert("_", "_", "italic text")}>
                  <Italic size={16} />
                </Tool>
                <Tool label="Link" onClick={() => insert("[", "](https://)", "link text")}>
                  <Link2 size={16} />
                </Tool>
                <Tool label="Bulleted list" onClick={() => linePrefix("- ")}>
                  <List size={16} />
                </Tool>
                <Tool label="Numbered list" onClick={() => linePrefix("1. ")}>
                  <ListOrdered size={16} />
                </Tool>
                <Tool label="Quote" onClick={() => linePrefix("> ")}>
                  <Quote size={16} />
                </Tool>
                <Tool label="Add a picture" onClick={() => bodyFile.current?.click()} busy={uploading === "body"}>
                  <ImagePlus size={16} />
                </Tool>
                <input
                  ref={bodyFile}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                  className="hidden"
                  onChange={(event) => {
                    void upload(event.target.files?.[0], "body");
                    event.target.value = "";
                  }}
                />
              </div>
              <label className="sr-only" htmlFor="post-body">
                Post
              </label>
              <textarea
                id="post-body"
                ref={body}
                value={draft.body}
                onChange={(event) => update({ body: event.target.value })}
                onDrop={(event) => {
                  const file = event.dataTransfer.files?.[0];
                  if (file?.type.startsWith("image/")) {
                    event.preventDefault();
                    void upload(file, "body");
                  }
                }}
                onPaste={(event) => {
                  const file = event.clipboardData.files?.[0];
                  if (file?.type.startsWith("image/")) {
                    event.preventDefault();
                    void upload(file, "body");
                  }
                }}
                placeholder={"Write in Markdown.\n\n## A heading\n\nA paragraph with **bold** and a [link](https://example.com).\n\nDrop or paste a picture here to add it."}
                className="min-h-[28rem] w-full resize-y bg-transparent p-5 font-mono text-[14px] leading-relaxed text-fg outline-none placeholder:text-fg/30"
              />
            </div>
          ) : (
            <div className="doc-prose blog-prose mt-3 min-h-[28rem] max-w-none rounded-2xl bg-surface p-6 shadow-border sm:p-8">
              {draft.body.trim() ? <Markdown>{draft.body}</Markdown> : <p className="text-muted">Nothing to preview yet.</p>}
            </div>
          )}
        </div>

        <aside className="grid content-start gap-5">
          <Field label="Summary" hint={`${draft.excerpt.length}/400 · shown in lists and search results (about 155 characters fit)`}>
            <textarea
              value={draft.excerpt}
              maxLength={400}
              rows={4}
              onChange={(event) => update({ excerpt: event.target.value })}
              className="w-full resize-y rounded-xl bg-surface p-3 text-sm shadow-border outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            />
          </Field>

          <Field label="Cover picture">
            {draft.cover_url ? (
              <div className="relative overflow-hidden rounded-xl shadow-border">
                <img src={draft.cover_url} alt="" className="aspect-[16/9] w-full object-cover" />
                <button
                  type="button"
                  onClick={() => update({ cover_url: null })}
                  aria-label="Remove cover picture"
                  className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-bg/90 text-fg shadow-border hover:bg-bg"
                >
                  <X size={15} aria-hidden />
                </button>
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => coverFile.current?.click()}
              disabled={uploading === "cover"}
              className="mt-2 inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm text-fg shadow-border hover:bg-fg/5 disabled:opacity-60"
            >
              {uploading === "cover" ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : <ImagePlus size={15} aria-hidden />}
              {draft.cover_url ? "Replace" : "Upload a picture"}
            </button>
            <input
              ref={coverFile}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
              className="hidden"
              onChange={(event) => {
                void upload(event.target.files?.[0], "cover");
                event.target.value = "";
              }}
            />
            {draft.cover_url ? (
              <input
                value={draft.cover_alt}
                maxLength={300}
                onChange={(event) => update({ cover_alt: event.target.value })}
                placeholder="Describe the picture, for screen readers"
                aria-label="Cover picture description"
                className="mt-2 h-10 w-full rounded-xl bg-surface px-3 text-sm shadow-border outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              />
            ) : null}
          </Field>

          <Field label="Web address" hint={`${SITE.url}/blog/${draft.slug || "…"}`}>
            <input
              value={draft.slug}
              onChange={(event) => {
                setSlugTouched(true);
                // Loosely while typing, so a hyphen can be typed; tidied on save.
                update({
                  slug: event.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9-]+/g, "-")
                    .replace(/-{2,}/g, "-")
                    .replace(/^-+/, ""),
                });
              }}
              className="h-10 w-full rounded-xl bg-surface px-3 font-mono text-sm shadow-border outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            />
          </Field>

          <Field label="Tags" hint="Separated by commas">
            <input
              value={tagsText}
              onChange={(event) => {
                setTagsText(event.target.value);
                setDirty(true);
              }}
              placeholder="ADHD, dyslexia, focus"
              className="h-10 w-full rounded-xl bg-surface px-3 text-sm shadow-border outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            />
          </Field>

          <Field label="Author">
            <input
              value={draft.author_name}
              maxLength={80}
              onChange={(event) => update({ author_name: event.target.value })}
              className="h-10 w-full rounded-xl bg-surface px-3 text-sm shadow-border outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            />
          </Field>

          <Field label="Publish date" hint="Set a future time to schedule it">
            <input
              type="datetime-local"
              value={toLocalInput(draft.published_at)}
              onChange={(event) =>
                update({ published_at: event.target.value ? new Date(event.target.value).toISOString() : null })
              }
              className="h-10 w-full rounded-xl bg-surface px-3 text-sm shadow-border outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            />
          </Field>

          <Field label="In Google">
            <div className="rounded-xl bg-surface p-3 shadow-border">
              <p className="truncate text-xs text-muted">{`${SITE.url.replace(/^https?:\/\//, "")} › blog › ${draft.slug || "…"}`}</p>
              <p className="mt-0.5 line-clamp-1 text-[15px] text-[#1a0dab] dark:text-[#8ab4f8]">
                {draft.title || "Title"} · NeuroLens
              </p>
              <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted">{description || "Summary"}</p>
            </div>
          </Field>

          {draft.id ? (
            confirmDelete ? (
              <div className="rounded-xl bg-danger-soft p-3 text-sm text-danger">
                <p>Delete this post for good? This cannot be undone.</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await deletePost(draft.id!);
                        setDirty(false);
                        toast("Post deleted");
                        void navigate({ to: "/admin/blog" });
                      } catch (failure) {
                        toast.error((failure as Error).message);
                      }
                    }}
                    className="h-9 rounded-full bg-danger px-3 text-sm font-medium text-white"
                  >
                    Delete
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(false)} className="h-9 rounded-full px-3 text-sm">
                    Keep it
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex h-9 items-center gap-2 justify-self-start rounded-full px-3 text-sm text-danger hover:bg-danger-soft"
              >
                <Trash2 size={15} aria-hidden /> Delete post
              </button>
            )
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/admin/blog" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
      <ArrowLeft size={15} aria-hidden /> All posts
    </Link>
  );
}

function Tool({ label, onClick, busy, children }: { label: string; onClick: () => void; busy?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={busy}
      className="grid size-9 place-items-center rounded-lg text-muted transition-colors hover:bg-fg/6 hover:text-fg disabled:opacity-50"
    >
      {busy ? <LoaderCircle size={16} className="animate-spin" /> : children}
    </button>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      {hint ? <p className="mt-0.5 text-xs break-all text-muted">{hint}</p> : null}
      <div className="mt-2">{children}</div>
    </div>
  );
}
