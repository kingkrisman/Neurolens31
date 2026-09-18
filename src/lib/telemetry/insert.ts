/**
 * Writing rows to Supabase from the server, without the Supabase client.
 *
 * This is one POST to PostgREST. Pulling in `@supabase/supabase-js` for it
 * would add a session manager, a realtime socket and a token refresher to a
 * server handler that needs none of them and holds no session at all.
 *
 * It authenticates with the anon key, deliberately — not a service key. The
 * telemetry tables grant insert to `anon` and grant select to nobody, so this
 * endpoint can add a row and cannot read one back. A server that can only ever
 * append is a much smaller thing to get wrong than one holding a key that
 * bypasses every policy in the database.
 *
 * Why it goes through the server at all, when the browser could insert
 * directly: the browser is editable. The endpoint re-checks every event against
 * the schema, so the closed list of what may be recorded is enforced by code a
 * stranger cannot change — and the database's own CHECK constraint is the third
 * line, for anything that reaches PostgREST with the public key by other means.
 */

const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};

const URL_ = env.VITE_SUPABASE_URL ?? "";
const KEY = env.VITE_SUPABASE_ANON_KEY ?? "";

/** Whether rows can be written at all. False means the deploy is missing keys. */
export const telemetryConfigured = Boolean(URL_ && KEY);

/** Long enough for a slow insert, short enough that a hung request is not a hung page. */
const TIMEOUT_MS = 6_000;

export interface InsertResult {
  ok: boolean;
  /** Present on failure, for the server log — never for the response body. */
  reason?: string;
}

/**
 * Append rows to one table.
 *
 * `Prefer: return=minimal` because nothing here reads its own writes, and
 * asking PostgREST to send the inserted rows back would be a second
 * serialisation of a payload that is already on disk.
 */
export async function insertRows(
  table: string,
  rows: ReadonlyArray<Record<string, unknown>>,
): Promise<InsertResult> {
  if (!telemetryConfigured) return { ok: false, reason: "not configured" };
  if (rows.length === 0) return { ok: true };

  const timer = AbortSignal.timeout(TIMEOUT_MS);
  try {
    const response = await fetch(`${URL_}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        apikey: KEY,
        authorization: `Bearer ${KEY}`,
        "content-type": "application/json",
        prefer: "return=minimal",
      },
      body: JSON.stringify(rows),
      signal: timer,
    });

    if (!response.ok) {
      // Read the body: PostgREST explains itself, and the difference between a
      // dropped column and a policy refusal is the difference between a
      // five-minute fix and an afternoon.
      const detail = await response.text().catch(() => "");
      return { ok: false, reason: `${response.status} ${detail.slice(0, 400)}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "unknown" };
  }
}
