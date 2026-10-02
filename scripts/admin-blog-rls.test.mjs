import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

/**
 * The admin page and the blog, proved against real Postgres.
 *
 * The anon key ships in every browser, so these rules are the whole of the
 * protection: whether a stranger can read the analytics, publish a post, or
 * upload a picture is decided here and nowhere else. Same approach as
 * schema-rls.test.mjs — PGLite, with Supabase's auth and storage stubbed.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => readFileSync(join(ROOT, "supabase/migrations", name), "utf8");

const ADMIN = "33333333-3333-3333-3333-333333333333";
const READER = "44444444-4444-4444-4444-444444444444";

let db;

/** Run as a signed-in person, or as a visitor with no account, the way PostgREST does. */
async function as(uid, sql, params) {
  if (uid) await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);`);
  else await db.exec(`set role anon; select set_config('request.jwt.claim.sub','',false);`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role;");
  }
}

async function refused(promise) {
  await assert.rejects(promise, (error) => /42501|permission|policy|Only the NeuroLens admin/i.test(String(error?.message ?? error)));
}

before(async () => {
  db = await new PGlite();
  await db.exec(`
    create schema if not exists auth;
    create table auth.users (id uuid primary key, email text, created_at timestamptz default now());
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    do $$ begin
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
    end $$;
    create schema if not exists storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated;
    grant select, insert, update, delete on storage.objects to anon, authenticated;
  `);
  await db.exec(read("0001_neurolens_schema.sql"));
  // pg_cron is a Supabase extension; the scheduling lines are not what is under test.
  await db.exec(read("0002_telemetry.sql").replace(/create extension if not exists pg_cron[\s\S]*$/, ""));
  await db.exec(read("0004_admin_blog.sql"));
  await db.exec(`
    insert into auth.users (id, email) values ('${ADMIN}','admin@example.com'), ('${READER}','reader@example.com');
    insert into public.app_admins (user_id) values ('${ADMIN}');
    insert into public.analytics_events (name, props, hour, day)
      values ('tab_view', '{"tab":"read"}', now(), current_date), ('app_open', '{}', now(), current_date);
  `);
});

after(async () => {
  await db?.close();
});

test("the migration can be run again without failing", async () => {
  await db.exec(read("0004_admin_blog.sql"));
});

test("only the admin can read the analytics", async () => {
  await refused(as(READER, "select * from public.admin_daily(30)"));
  await refused(as(READER, "select public.admin_accounts(30)"));
  await refused(as(null, "select * from public.admin_errors(10)"));
  const { rows } = await as(ADMIN, "select * from public.admin_breakdown('tab_view', 'tab', 30)");
  assert.deepEqual(rows.map((row) => [row.value, Number(row.count)]), [["read", 1]]);
  const accounts = await as(ADMIN, "select public.admin_accounts(30) as a");
  assert.equal(Number(accounts.rows[0].a.total), 2);
});

test("the raw analytics stay unreadable, even to the admin's account directly", async () => {
  await refused(as(ADMIN, "select * from public.analytics_events"));
});

test("is_admin answers for the person asking, and nobody can make themselves one", async () => {
  assert.equal((await as(ADMIN, "select public.is_admin() as ok")).rows[0].ok, true);
  assert.equal((await as(READER, "select public.is_admin() as ok")).rows[0].ok, false);
  await refused(as(READER, `insert into public.app_admins (user_id) values ('${READER}')`));
});

test("only the admin can write posts", async () => {
  await refused(as(READER, "insert into public.blog_posts (slug, title) values ('sneaky', 'Sneaky')"));
  await refused(as(null, "insert into public.blog_posts (slug, title) values ('sneaky', 'Sneaky')"));
  await as(
    ADMIN,
    `insert into public.blog_posts (slug, title, status, published_at) values
      ('hello-world', 'Hello', 'published', now() - interval '1 day'),
      ('still-a-draft', 'Draft', 'draft', null),
      ('next-week', 'Later', 'published', now() + interval '7 days')`,
  );
  const changed = await as(READER, "update public.blog_posts set title = 'Defaced' returning id");
  assert.equal(changed.rows.length, 0, "a reader's update must touch nothing");
  const removed = await as(READER, "delete from public.blog_posts returning id");
  assert.equal(removed.rows.length, 0, "a reader's delete must touch nothing");
});

test("visitors see published posts only — not drafts, not ones scheduled for later", async () => {
  for (const who of [null, READER]) {
    const { rows } = await as(who, "select slug from public.blog_posts order by slug");
    assert.deepEqual(rows.map((row) => row.slug), ["hello-world"]);
  }
  const all = await as(ADMIN, "select slug from public.blog_posts order by slug");
  assert.equal(all.rows.length, 3, "the admin sees drafts and scheduled posts too");
});

test("a slug must be a clean web address", async () => {
  await assert.rejects(as(ADMIN, "insert into public.blog_posts (slug, title) values ('Bad Slug!', 'x')"));
});

test("only the admin can upload pictures for posts", async () => {
  await refused(as(READER, "insert into storage.objects (bucket_id, name) values ('blog', 'x.png')"));
  await as(ADMIN, "insert into storage.objects (bucket_id, name) values ('blog', 'cover.png')");
  const seen = await as(null, "select name from storage.objects where bucket_id = 'blog'");
  assert.deepEqual(seen.rows.map((row) => row.name), ["cover.png"]);
});
