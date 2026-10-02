import { getSupabase } from "./supabase/client";

/**
 * The blog: reading posts (anyone, on the server or in the browser) and
 * writing them (the admin, in the browser).
 *
 * Reading goes straight to Supabase's REST API with the public key, because
 * the post pages render on the server for search engines and the database
 * itself only ever returns published posts to that key (see
 * supabase/migrations/0004_admin_blog.sql). Writing goes through the signed-in
 * client, and the same database rules refuse anyone but the admin.
 */

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  cover_url: string | null;
  cover_alt: string;
  tags: string[];
  author_name: string;
  status: "draft" | "published";
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export type BlogDraft = Omit<BlogPost, "id" | "created_at" | "updated_at"> & { id?: string };

const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
const URL_ = env.VITE_SUPABASE_URL ?? "";
const KEY = env.VITE_SUPABASE_ANON_KEY ?? "";

export const blogConfigured = Boolean(URL_ && KEY);

const LIST_FIELDS = "id,slug,title,excerpt,cover_url,cover_alt,tags,author_name,status,published_at,created_at,updated_at";

async function rest<T>(query: string): Promise<T> {
  if (!blogConfigured) return [] as T;
  const response = await fetch(`${URL_}/rest/v1/${query}`, {
    headers: { apikey: KEY, authorization: `Bearer ${KEY}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Blog request failed (${response.status})`);
  return (await response.json()) as T;
}

/** Published posts, newest first. Without their bodies: the list does not need them. */
export async function publishedPosts(limit = 50): Promise<Omit<BlogPost, "body">[]> {
  try {
    return await rest(`blog_posts?select=${LIST_FIELDS}&order=published_at.desc&limit=${limit}`);
  } catch {
    return [];
  }
}

/** One published post by its address, or null. */
export async function publishedPost(slug: string): Promise<BlogPost | null> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return null;
  try {
    const rows = await rest<BlogPost[]>(`blog_posts?select=*&slug=eq.${slug}&limit=1`);
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export { formatDate, readingMinutes, slugify } from "./blog-text";
import { slugify } from "./blog-text";

/* ------------------------------------------------------------------ admin */

function client() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase is not configured for this site.");
  return supabase;
}

/** Whether the signed-in person is the admin. The database decides. */
export async function amAdmin(): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("is_admin");
  return !error && data === true;
}

/** Every post, drafts included (the database only lets the admin see them). */
export async function allPosts(): Promise<Omit<BlogPost, "body">[]> {
  const { data, error } = await client()
    .from("blog_posts")
    .select(LIST_FIELDS)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Omit<BlogPost, "body">[];
}

export async function postById(id: string): Promise<BlogPost | null> {
  const { data, error } = await client().from("blog_posts").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as BlogPost | null) ?? null;
}

/** Create or update. Publishing for the first time stamps the date. */
export async function savePost(draft: BlogDraft): Promise<BlogPost> {
  const row = {
    ...draft,
    published_at:
      draft.status === "published" ? (draft.published_at ?? new Date().toISOString()) : draft.published_at,
  };
  const query = draft.id
    ? client().from("blog_posts").update(row).eq("id", draft.id)
    : client().from("blog_posts").insert(row);
  const { data, error } = await query.select("*").single();
  if (error) {
    if (/duplicate key|unique/i.test(error.message)) throw new Error("Another post already uses that web address.");
    throw new Error(error.message);
  }
  return data as BlogPost;
}

export async function deletePost(id: string): Promise<void> {
  const { error } = await client().from("blog_posts").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Upload a picture for a post and return its public address. */
export async function uploadImage(file: File): Promise<string> {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error("Pictures must be JPEG, PNG, WebP, GIF or AVIF.");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Pictures must be under 8 MB.");
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const base = slugify(file.name.replace(/\.[^.]+$/, "")) || "image";
  const path = `${new Date().toISOString().slice(0, 7)}/${base}-${crypto.randomUUID().slice(0, 8)}.${extension}`;
  const supabase = client();
  const { error } = await supabase.storage.from("blog").upload(path, file, {
    contentType: file.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return supabase.storage.from("blog").getPublicUrl(path).data.publicUrl;
}
