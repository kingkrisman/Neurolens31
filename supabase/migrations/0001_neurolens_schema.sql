-- NeuroLens on Supabase: library, marks and settings, owned per person.
--
-- Run this in the Supabase SQL editor, or with `supabase db push`.
--
-- Two rules shape everything here:
--
--   1. Every table carries `user_id` referencing auth.users, and every table
--      has row-level security on with policies that compare it to auth.uid().
--      RLS is not a second line of defence in Supabase — the anon key is public
--      and ships in the browser, so these policies ARE the access control. A
--      table without them is a table anyone on the internet can read.
--
--   2. Deleting an account deletes the books. `on delete cascade` throughout,
--      so "erase everything" is one statement rather than a checklist someone
--      has to remember to keep in step with the schema.

-- ── Books ───────────────────────────────────────────────────────────────────
-- The extracted text a person reads, not the original upload. `content` is the
-- whole book, which is what the reader renders and what search runs over.
create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  content text not null,
  kind text not null default 'text' check (kind in ('text', 'pdf', 'bible', 'poem')),
  -- Where the text came from, when it came from one of the outside services:
  -- a Gutenberg id, an OpenLibrary key, a Bible reference.
  source_id text,
  word_count integer not null default 0,
  page_count integer,
  -- Reading position. `progress` is a fraction of the open section, not of the
  -- book, so `section` is what makes resuming meaningful.
  progress real not null default 0 check (progress >= 0 and progress <= 1),
  section integer,
  -- Everything the adaptive reader learns about this book, kept as one document
  -- rather than columns: it changes shape as the reader improves, and none of
  -- it is queried by field.
  reading_stats jsonb not null default '{}'::jsonb,
  opened_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Highlights ──────────────────────────────────────────────────────────────
-- A marked run inside a line, with an optional note. Anchored by section, line
-- and character offsets, which is how the mark survives a reflow.
create table if not exists public.highlights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  section integer not null default 0,
  line_idx integer not null,
  start_offset integer not null,
  end_offset integer not null,
  text text not null,
  note text,
  color text,
  created_at timestamptz not null default now()
);

-- ── Bookmarks ───────────────────────────────────────────────────────────────
create table if not exists public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  book_id uuid references public.books (id) on delete cascade,
  title text not null,
  excerpt text,
  progress real not null default 0,
  section integer,
  pdf_page integer,
  created_at timestamptz not null default now()
);

-- ── Ink ─────────────────────────────────────────────────────────────────────
-- Drawing over a page. One row per stroke would be thousands of rows for a
-- single annotated chapter, so strokes are grouped per book-and-section.
create table if not exists public.ink_strokes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  section integer not null default 0,
  strokes jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  unique (book_id, section)
);

-- ── Settings ────────────────────────────────────────────────────────────────
-- One row per person. The reading profile is the app's most personal artefact —
-- it is how someone has learned to read comfortably — so it follows the account
-- to every device. Kept as jsonb because the profile gains fields often and a
-- migration per slider would be absurd.
create table if not exists public.reading_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  profile jsonb not null default '{}'::jsonb,
  mode text,
  target_wpm integer,
  locks jsonb not null default '[]'::jsonb,
  saved_profiles jsonb not null default '[]'::jsonb,
  adaptive_memory jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ── Indexes ─────────────────────────────────────────────────────────────────
-- Every query this app makes starts "for this person", so every index does too.
create index if not exists books_user_opened_idx on public.books (user_id, opened_at desc);
create index if not exists highlights_user_book_idx on public.highlights (user_id, book_id);
create index if not exists bookmarks_user_idx on public.bookmarks (user_id, created_at desc);
create index if not exists ink_user_book_idx on public.ink_strokes (user_id, book_id);

-- ── Row-level security ──────────────────────────────────────────────────────
-- Enabled before any policy exists, so there is no window in which the tables
-- are readable. With RLS on and no policy, nothing is permitted at all.
alter table public.books enable row level security;
alter table public.highlights enable row level security;
alter table public.bookmarks enable row level security;
alter table public.ink_strokes enable row level security;
alter table public.reading_settings enable row level security;

-- `to authenticated` keeps the anon role out entirely rather than relying on
-- auth.uid() being null for it. `with check` is what stops a person inserting a
-- row that claims to belong to somebody else — a using clause alone would let
-- them write it and simply never see it again.
do $$
declare
  t text;
begin
  foreach t in array array['books', 'highlights', 'bookmarks', 'ink_strokes'] loop
    execute format('drop policy if exists "%1$s_select_own" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_insert_own" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_update_own" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_delete_own" on public.%1$I', t);

    execute format(
      'create policy "%1$s_select_own" on public.%1$I for select to authenticated using (auth.uid() = user_id)', t);
    execute format(
      'create policy "%1$s_insert_own" on public.%1$I for insert to authenticated with check (auth.uid() = user_id)', t);
    execute format(
      'create policy "%1$s_update_own" on public.%1$I for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format(
      'create policy "%1$s_delete_own" on public.%1$I for delete to authenticated using (auth.uid() = user_id)', t);
  end loop;
end $$;

drop policy if exists "settings_select_own" on public.reading_settings;
drop policy if exists "settings_insert_own" on public.reading_settings;
drop policy if exists "settings_update_own" on public.reading_settings;
drop policy if exists "settings_delete_own" on public.reading_settings;

create policy "settings_select_own" on public.reading_settings
  for select to authenticated using (auth.uid() = user_id);
create policy "settings_insert_own" on public.reading_settings
  for insert to authenticated with check (auth.uid() = user_id);
create policy "settings_update_own" on public.reading_settings
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "settings_delete_own" on public.reading_settings
  for delete to authenticated using (auth.uid() = user_id);

-- ── Keep updated_at honest ──────────────────────────────────────────────────
-- Sync compares timestamps to decide which side is newer, so a stale
-- updated_at is a lost edit. Set by the database rather than trusted from the
-- client, whose clock may be wrong and whose value can be forged.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists books_touch_updated_at on public.books;
create trigger books_touch_updated_at
  before update on public.books
  for each row execute function public.touch_updated_at();

drop trigger if exists ink_touch_updated_at on public.ink_strokes;
create trigger ink_touch_updated_at
  before update on public.ink_strokes
  for each row execute function public.touch_updated_at();

drop trigger if exists settings_touch_updated_at on public.reading_settings;
create trigger settings_touch_updated_at
  before update on public.reading_settings
  for each row execute function public.touch_updated_at();
