import { createFileRoute } from "@tanstack/react-router";
import { sanitize, type EventName } from "@/lib/analytics";
import { getSql } from "@/lib/db";

/**
 * Where usage events land, if the reader agreed to send them.
 *
 * The client already checks every event against the schema before queueing it.
 * This checks again, because the client is a thing a stranger can edit: the
 * request is re-run through the same `sanitize`, so an event the schema does
 * not name is rejected and a field it does not list is dropped before the
 * insert. Both sides using one schema is the point — there is no second list
 * here to drift from the first.
 *
 * What is deliberately not read: the IP address, the user agent, the referer,
 * and any account. None is touched, none is stored, and the table has no column
 * for any of them.
 */

/** A body bigger than this is not a queue flush, it is somebody probing. */
const MAX_BODY_BYTES = 128 * 1024;
const MAX_EVENTS = 500;

/** Hours, so a clock skewed by a bad device cannot write into next year. */
const MAX_FUTURE_MS = 2 * 60 * 60 * 1000;
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

type Incoming = { e?: unknown; p?: unknown; t?: unknown };

export const Route = createFileRoute("/api/analytics")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const length = Number(request.headers.get("content-length") ?? 0);
        if (length > MAX_BODY_BYTES) {
          return Response.json({ error: "Too large" }, { status: 413 });
        }

        let payload: unknown;
        try {
          const text = await request.text();
          if (text.length > MAX_BODY_BYTES) {
            return Response.json({ error: "Too large" }, { status: 413 });
          }
          payload = JSON.parse(text);
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        const events: Incoming[] = Array.isArray(payload)
          ? payload
          : Array.isArray((payload as { events?: unknown })?.events)
            ? ((payload as { events: Incoming[] }).events)
            : [];
        if (!events.length) return Response.json({ stored: 0 });
        if (events.length > MAX_EVENTS) {
          return Response.json({ error: "Too many events" }, { status: 413 });
        }

        const now = Date.now();
        const rows: Array<{ name: string; props: string; hour: string }> = [];
        for (const event of events.slice(0, MAX_EVENTS)) {
          if (typeof event?.e !== "string") continue;
          const props = sanitize(
            event.e,
            (event.p && typeof event.p === "object" ? event.p : {}) as Record<string, unknown>,
          );
          // Null means the schema does not have this event at all.
          if (!props) continue;

          const time = typeof event.t === "number" && Number.isFinite(event.t) ? event.t : now;
          // A timestamp from the future, or from before this app existed, is a
          // broken clock or a forgery; either way it is not evidence of
          // anything, so it is clamped rather than trusted or dropped.
          const clamped = Math.min(Math.max(time, now - MAX_AGE_MS), now + MAX_FUTURE_MS);
          rows.push({
            name: event.e as EventName,
            props: JSON.stringify(props),
            hour: new Date(clamped).toISOString(),
          });
        }

        if (!rows.length) return Response.json({ stored: 0 });

        try {
          const sql = await getSql();
          // One statement rather than a loop: a queue flush arriving after a
          // long offline stretch can be hundreds of rows, and hundreds of
          // round trips is how an analytics endpoint becomes the slowest thing
          // in the app.
          await sql.query(
            `insert into analytics_events (name, props, hour, day)
             select * from unnest(
               $1::text[],
               $2::jsonb[],
               $3::timestamptz[],
               $4::date[]
             )`,
            [
              rows.map((row) => row.name),
              rows.map((row) => row.props),
              rows.map((row) => row.hour),
              rows.map((row) => row.hour),
            ],
          );
        } catch {
          // The reader is not told, and nothing is retried into a loop: a
          // failure to record usage is our problem, never theirs.
          return Response.json({ error: "Could not store" }, { status: 503 });
        }

        return Response.json(
          { stored: rows.length },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
