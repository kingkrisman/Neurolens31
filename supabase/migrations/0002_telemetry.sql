-- Usage analytics and crash reports.
--
-- Both are shaped so the database enforces the privacy claim rather than
-- trusting the application to. Neither table has a user_id, an IP column or a
-- free-text field that is not normalised first: an event cannot be attached to
-- a person here because there is nowhere to put one.
--
-- Applied to the hosted project on 2026-09-18. Kept here so the schema is in
-- version control rather than only in a dashboard, and so a fresh project can
-- be brought up from this directory alone.

create table if not exists public.analytics_events (
  id bigserial primary key,
  -- Checked by the database, not only by the app. The endpoint validates every
  -- event, but the anon key is public and can insert directly, so the list of
  -- what may be recorded lives here too. Must match SCHEMA in src/lib/analytics.ts.
  name text not null check (name in (
    'app_open','tab_view','file_opened','file_failed','highlight_added',
    'ink_stroke','setting_changed','tour','auth','avatar_changed',
    'preferred_source_click','web_vital'
  )),
  props jsonb not null default '{}'::jsonb,
  hour timestamptz not null,
  day date not null,
  received_at timestamptz not null default now()
);

create index if not exists analytics_events_day_idx on public.analytics_events (day desc);
create index if not exists analytics_events_name_day_idx on public.analytics_events (name, day desc);

-- Crash reports: what broke, where, and nothing about who.
create table if not exists public.error_reports (
  id bigserial primary key,
  -- Normalised on the device and again on arrival — see scrubMessage in
  -- src/lib/telemetry/errors.ts. Quoted fragments, URLs, addresses and numbers
  -- are gone before this column sees them.
  message text not null,
  -- Where in the app, as one of a short list rather than a URL: a path can
  -- carry a query string, and a query string can carry anything. Must match
  -- AREAS in src/lib/telemetry/errors.ts.
  area text not null check (area in (
    'home','reader','library','insights','settings','document','auth','unknown'
  )),
  -- Kept short, and origin-stripped. A stack is for finding a bug, and a long
  -- one is mostly noise.
  stack text,
  release text,
  received_at timestamptz not null default now()
);

create index if not exists error_reports_received_idx on public.error_reports (received_at desc);

alter table public.analytics_events enable row level security;
alter table public.error_reports enable row level security;

-- Insert-only, for everyone, including the anonymous key the browser holds.
-- Deliberately no select policy: nothing can read these back through the API,
-- so a leaked anon key cannot be used to read what anyone did. Verified — an
-- authenticated select returns [] for rows that were just written.
drop policy if exists "analytics_insert" on public.analytics_events;
create policy "analytics_insert" on public.analytics_events
  for insert to anon, authenticated with check (true);

drop policy if exists "errors_insert" on public.error_reports;
create policy "errors_insert" on public.error_reports
  for insert to anon, authenticated with check (true);

grant usage on schema public to anon, authenticated;
grant insert on public.analytics_events to anon, authenticated;
grant insert on public.error_reports to anon, authenticated;
grant usage, select on sequence public.analytics_events_id_seq to anon, authenticated;
grant usage, select on sequence public.error_reports_id_seq to anon, authenticated;

-- Retention. Analytics answers "how is the app used", which nothing older than
-- three months contributes to, and a crash report is worthless once the release
-- it came from is gone.
create or replace function public.prune_telemetry()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.analytics_events where day < current_date - interval '90 days';
  delete from public.error_reports where received_at < now() - interval '30 days';
$$;

-- And it has to run itself. A retention policy that depends on somebody
-- remembering to call a function is a promise that gets broken in about a month.
create extension if not exists pg_cron with schema pg_catalog;

select cron.unschedule('prune-telemetry')
where exists (select 1 from cron.job where jobname = 'prune-telemetry');

select cron.schedule('prune-telemetry', '17 3 * * *', 'select public.prune_telemetry()');
