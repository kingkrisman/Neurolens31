-- Recall results, for readers who opted in to usage analytics.
--
-- One new event name, 'recall_done': how many questions a recall card or
-- understanding check asked, how many were right, and the reading mode and
-- layout it happened under. Counts are capped at "5+". No question, answer,
-- book or chapter — the fields are closed lists (SCHEMA in src/lib/analytics.ts)
-- and the endpoint drops anything else.
--
-- Until this runs, the endpoint stores these events separately and the old
-- check refuses only them, so nothing else is lost. Run once in the Supabase
-- SQL editor; running it again is harmless.

alter table public.analytics_events
  drop constraint if exists analytics_events_name_check;

alter table public.analytics_events
  add constraint analytics_events_name_check check (name in (
    'app_open','tab_view','file_opened','file_failed','highlight_added',
    'ink_stroke','setting_changed','tour','auth','avatar_changed',
    'preferred_source_click','web_vital','recall_done'
  ));
