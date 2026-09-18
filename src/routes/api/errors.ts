import { createFileRoute } from "@tanstack/react-router";
import { AREAS, scrubMessage, scrubStack } from "@/lib/telemetry/errors";
import { insertRows, telemetryConfigured } from "@/lib/telemetry/insert";

/**
 * Where crashes land.
 *
 * The client already scrubs the message and the stack. This scrubs them again,
 * with the same functions, because the client is editable and a crash reporter
 * that trusts its input is a free-text field with extra steps — exactly the
 * thing this app has none of. An `area` that is not one of the eight is stored
 * as `unknown` rather than refused, so a request from an older build still
 * reports its crash.
 *
 * Nothing about who: no account, no IP, no user agent, no URL. The table has no
 * column for any of them, and this handler reads none of them.
 */

const MAX_BODY_BYTES = 16 * 1024;

export const Route = createFileRoute("/api/errors")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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

        const body = (payload ?? {}) as Record<string, unknown>;
        const message = typeof body.message === "string" ? scrubMessage(body.message) : "";
        if (!message) return Response.json({ error: "No message" }, { status: 400 });

        const area =
          typeof body.area === "string" && (AREAS as readonly string[]).includes(body.area)
            ? body.area
            : "unknown";

        const stack = typeof body.stack === "string" ? scrubStack(body.stack) : undefined;
        // A release is a git sha or a version string; anything longer is not one.
        const release =
          typeof body.release === "string" && body.release.length <= 64 ? body.release : null;

        if (!telemetryConfigured) {
          return Response.json({ stored: 0 }, { headers: { "cache-control": "no-store" } });
        }

        const result = await insertRows("error_reports", [
          { message, area, stack: stack ?? null, release },
        ]);
        if (!result.ok) {
          console.error("[errors] insert failed:", result.reason);
          // 204, not 503. The client does not retry crash reports and must not
          // start: a server that is down while the app is crashing would get a
          // retry storm on top of an outage.
          return new Response(null, { status: 204 });
        }

        return Response.json({ stored: 1 }, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
