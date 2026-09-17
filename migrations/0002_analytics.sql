-- Usage analytics.
--
-- The table is shaped to make the privacy claim structural rather than a
-- promise. There is no user_id column, no IP column, no free-text column and no
-- foreign key to "user": an event cannot be attached to a person here because
-- there is nowhere to put the person.
--
--   name     the event, checked against the schema in src/lib/analytics.ts
--   props    the closed-list fields for that event, re-validated server-side
--   hour     when it happened, rounded to the hour on the device
--   day      the date, for cheap grouping
--
-- `props` is jsonb rather than columns because each event has different fields;
-- what keeps it honest is that the server drops any key the schema does not
-- name before the insert, so a client that invents a field cannot store it.
--
-- Deliberately absent: the per-device id the client generates. It is useful for
-- de-duplicating a queue in the browser and useless here, and storing it would
-- turn a pile of events into a per-device history.

create table if not exists analytics_events (
  id bigserial primary key,
  name text not null,
  props jsonb not null default '{}'::jsonb,
  hour timestamptz not null,
  day date not null,
  received_at timestamptz not null default now()
);

-- The two questions actually asked of this table: what happened recently, and
-- how often did each thing happen.
create index if not exists analytics_events_day_idx on analytics_events (day desc);
create index if not exists analytics_events_name_day_idx on analytics_events (name, day desc);
