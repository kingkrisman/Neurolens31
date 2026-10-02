-- Admin, analytics for the admin, and the blog.
--
-- Run once in the Supabase SQL editor. Safe to run again.
--
-- Nothing here needs a secret key in the app. Who is an admin is a row in
-- `app_admins`, which only someone with database access can add; every admin
-- query and every blog write is checked against it by the database itself, so
-- a stranger who edits the app in their browser gains nothing.
--
-- After running this, make yourself the admin (replace the address with the
-- one you sign in to NeuroLens with):
--
--   insert into public.app_admins (user_id)
--   select id from auth.users where email = 'you@example.com'
--   on conflict do nothing;

-- ---------------------------------------------------------------- admins

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);

alter table public.app_admins enable row level security;

-- An admin can see that they are one; nobody can add or remove rows from the app.
drop policy if exists "admins_read_self" on public.app_admins;
create policy "admins_read_self" on public.app_admins
  for select to authenticated using (user_id = auth.uid());

grant select on public.app_admins to authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;

grant execute on function public.is_admin() to anon, authenticated;

-- ------------------------------------------------------------------ blog

create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120),
  title text not null check (char_length(title) between 1 and 200),
  excerpt text not null default '' check (char_length(excerpt) <= 400),
  -- Markdown. Rendered without raw HTML, so a post can never carry a script.
  body text not null default '' check (char_length(body) <= 200000),
  cover_url text check (cover_url is null or cover_url ~ '^https://'),
  cover_alt text not null default '' check (char_length(cover_alt) <= 300),
  tags text[] not null default '{}',
  author_name text not null default 'NeuroLens' check (char_length(author_name) <= 80),
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists blog_posts_published_idx
  on public.blog_posts (published_at desc) where status = 'published';

drop trigger if exists blog_posts_touch on public.blog_posts;
create trigger blog_posts_touch before update on public.blog_posts
  for each row execute function public.touch_updated_at();

alter table public.blog_posts enable row level security;

-- Everyone reads what is published and due; the admin reads and writes everything.
drop policy if exists "blog_read_published" on public.blog_posts;
create policy "blog_read_published" on public.blog_posts
  for select to anon, authenticated
  using (status = 'published' and published_at is not null and published_at <= now());

drop policy if exists "blog_admin_all" on public.blog_posts;
create policy "blog_admin_all" on public.blog_posts
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on public.blog_posts to anon, authenticated;
grant insert, update, delete on public.blog_posts to authenticated;

-- Pictures for posts: anyone can view them, only the admin can add or remove.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('blog', 'blog', true, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "blog_images_read" on storage.objects;
create policy "blog_images_read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'blog');

drop policy if exists "blog_images_admin_insert" on storage.objects;
create policy "blog_images_admin_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'blog' and public.is_admin());

drop policy if exists "blog_images_admin_update" on storage.objects;
create policy "blog_images_admin_update" on storage.objects
  for update to authenticated using (bucket_id = 'blog' and public.is_admin());

drop policy if exists "blog_images_admin_delete" on storage.objects;
create policy "blog_images_admin_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'blog' and public.is_admin());

-- ------------------------------------------------------------- analytics
--
-- The telemetry tables still grant select to nobody. These functions read
-- them on the admin's behalf, after checking they are the admin, and return
-- counts only — the same anonymous, bucketed facts that were recorded.

create or replace function public.admin_require()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only the NeuroLens admin can see this.' using errcode = '42501';
  end if;
end;
$$;

-- How many of each event, per day.
create or replace function public.admin_daily(days integer default 30)
returns table (day date, name text, count bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.admin_require();
  return query
    select e.day, e.name, count(*)::bigint
    from public.analytics_events e
    where e.day >= current_date - greatest(1, least(days, 90))
    group by e.day, e.name
    order by e.day;
end;
$$;

-- One property of one event, counted by value: tabs viewed, formats opened, ...
create or replace function public.admin_breakdown(event text, prop text, days integer default 30)
returns table (value text, count bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.admin_require();
  return query
    select coalesce(e.props ->> prop, '(none)'), count(*)::bigint
    from public.analytics_events e
    where e.name = event
      and e.day >= current_date - greatest(1, least(days, 90))
    group by 1
    order by 2 desc
    limit 50;
end;
$$;

-- Page speed: each Core Web Vital by rating.
create or replace function public.admin_vitals(days integer default 30)
returns table (metric text, rating text, count bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.admin_require();
  return query
    select e.props ->> 'metric', e.props ->> 'rating', count(*)::bigint
    from public.analytics_events e
    where e.name = 'web_vital'
      and e.day >= current_date - greatest(1, least(days, 90))
    group by 1, 2;
end;
$$;

-- Accounts: how many, how many new each day, how many read in the period.
create or replace function public.admin_accounts(days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  since timestamptz := now() - make_interval(days => greatest(1, least(days, 365)));
begin
  perform public.admin_require();
  return jsonb_build_object(
    'total', (select count(*) from auth.users),
    'new', (select count(*) from auth.users where created_at >= since),
    'reading', (select count(distinct user_id) from public.books where updated_at >= since),
    'books', (select count(*) from public.books),
    'highlights', (select count(*) from public.highlights),
    'by_day', coalesce((
      select jsonb_agg(jsonb_build_object('day', d, 'count', c) order by d)
      from (
        select created_at::date as d, count(*) as c
        from auth.users where created_at >= since group by 1
      ) s
    ), '[]'::jsonb)
  );
end;
$$;

-- The latest crash reports, already scrubbed on the reader's device.
create or replace function public.admin_errors(max_rows integer default 50)
returns table (received_at timestamptz, area text, message text, release text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.admin_require();
  return query
    select r.received_at, r.area, r.message, r.release
    from public.error_reports r
    order by r.received_at desc
    limit greatest(1, least(max_rows, 200));
end;
$$;

revoke all on function public.admin_require() from public;
grant execute on function public.admin_daily(integer) to authenticated;
grant execute on function public.admin_breakdown(text, text, integer) to authenticated;
grant execute on function public.admin_vitals(integer) to authenticated;
grant execute on function public.admin_accounts(integer) to authenticated;
grant execute on function public.admin_errors(integer) to authenticated;
revoke execute on function public.admin_daily(integer) from anon;
revoke execute on function public.admin_breakdown(text, text, integer) from anon;
revoke execute on function public.admin_vitals(integer) from anon;
revoke execute on function public.admin_accounts(integer) from anon;
revoke execute on function public.admin_errors(integer) from anon;
