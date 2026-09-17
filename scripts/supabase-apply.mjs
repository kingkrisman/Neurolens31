#!/usr/bin/env node
/**
 * Set a live Supabase project up for NeuroLens: schema, then sign-in.
 *
 * Exists so none of this has to be pasted by hand, and — more to the point —
 * so the credentials that authorise it never have to be pasted into a chat
 * window. Everything is read from `.supabase-credentials` (gitignored), used,
 * and never printed; only the last four characters of any secret are shown, so
 * a run with the wrong value is still diagnosable.
 *
 *   node scripts/supabase-apply.mjs            # schema, then verify
 *   node scripts/supabase-apply.mjs --auth     # sign-in config, then verify
 *   node scripts/supabase-apply.mjs --all      # both
 *   node scripts/supabase-apply.mjs --verify   # check only, change nothing
 *
 * The credentials file is KEY=VALUE lines:
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_…        from supabase.com/dashboard/account/tokens
 *   GOOGLE_CLIENT_ID=….apps.googleusercontent.com
 *   GOOGLE_CLIENT_SECRET=GOCSPX-…
 *   SITE_URL=https://your-domain           optional; defaults to localhost
 *
 * A personal access token can do anything to any of your projects, which is
 * why this only ever sends the one migration file, the auth settings below,
 * and read-only checks — and refuses to touch a project ref it was not given.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = join(ROOT, "supabase/migrations/0001_neurolens_schema.sql");
const API = "https://api.supabase.com";

/** Read in order; the first file that exists wins. The older name still works. */
const CREDENTIAL_FILES = [".supabase-credentials", ".supabase-token"];

const EXPECTED_TABLES = ["bookmarks", "books", "highlights", "ink_strokes", "reading_settings"];

const DEV_ORIGIN = "http://localhost:8080";

function fail(message, hint) {
  console.error(`\n  ${message}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

/** Last four characters only — enough to tell two values apart, useless alone. */
const tail = (value) => (value ? `…${value.slice(-4)} (${value.length} chars)` : "(not set)");

/**
 * Credentials, from the file or the environment.
 *
 * A bare token on its own line is accepted too, because that is what the first
 * version of this script asked for and telling somebody their file is now the
 * wrong shape is a worse experience than reading both.
 */
function credentials() {
  const values = {
    SUPABASE_ACCESS_TOKEN: process.env.SUPABASE_ACCESS_TOKEN?.trim() ?? "",
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID?.trim() ?? "",
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "",
    SITE_URL: process.env.SITE_URL?.trim() ?? "",
  };

  for (const name of CREDENTIAL_FILES) {
    const path = join(ROOT, name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const text = line.trim();
      if (!text || text.startsWith("#")) continue;
      if (text.includes("=")) {
        const key = text.slice(0, text.indexOf("=")).trim();
        const value = text.slice(text.indexOf("=") + 1).trim();
        if (key in values && !values[key]) values[key] = value;
      } else if (!values.SUPABASE_ACCESS_TOKEN) {
        values.SUPABASE_ACCESS_TOKEN = text;
      }
    }
    break;
  }
  return values;
}

/** The project ref, from the app's own env file — one source of truth. */
function projectRef() {
  const explicit = process.argv.find((a) => a.startsWith("--ref="));
  if (explicit) return explicit.slice(6);
  for (const name of [".env.local", ".env"]) {
    const path = join(ROOT, name);
    if (!existsSync(path)) continue;
    const match = readFileSync(path, "utf8").match(
      /VITE_SUPABASE_URL\s*=\s*https:\/\/([a-z0-9-]+)\.supabase\.(?:co|in)/i,
    );
    if (match) return match[1];
  }
  return "";
}

async function api(path, key, init = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...init.headers },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status} — ${text.slice(0, 400)}`);
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

const runSql = (ref, key, query) =>
  api(`/v1/projects/${ref}/database/query`, key, { method: "POST", body: JSON.stringify({ query }) });

async function applySchema(ref, key) {
  const sql = readFileSync(MIGRATION, "utf8");
  console.log(`\n  applying supabase/migrations/0001_neurolens_schema.sql (${sql.split("\n").length} lines)`);
  await runSql(ref, key, sql);
  console.log("  applied.");
}

/**
 * Turn Google sign-in on, and allow the app back in afterwards.
 *
 * `uri_allow_list` is the setting people miss. Without the app's own address in
 * it Supabase completes the round trip with Google and then refuses to hand the
 * session back, which presents as "OAuth does not work" with nothing in any log
 * to say why.
 */
async function applyAuth(ref, key, creds) {
  const site = (creds.SITE_URL || DEV_ORIGIN).replace(/\/+$/, "");
  // Both, always: a project configured only for production cannot be developed
  // against, and one configured only for localhost breaks the moment it ships.
  const allow = [...new Set([`${DEV_ORIGIN}/**`, `${site}/**`])].join(",");

  console.log(`\n  site URL        ${site}`);
  console.log(`  redirect allow  ${allow}`);

  /**
   * The settings email sign-in actually needs.
   *
   * `site_url` is what every confirmation and reset link is built from, and a
   * project left on the default points them at a port this app does not run on.
   * `uri_allow_list` is what lets the app be returned to afterwards — miss it
   * and the round trip completes and then the session is refused, with nothing
   * in any log to say why.
   */
  const settings = {
    site_url: site,
    uri_allow_list: allow,
    external_email_enabled: true,
  };

  // Google is optional now that sign-in is email and password. Configured only
  // if somebody has put the credentials in the file, never demanded.
  if (creds.GOOGLE_CLIENT_ID && creds.GOOGLE_CLIENT_SECRET) {
    settings.external_google_enabled = true;
    settings.external_google_client_id = creds.GOOGLE_CLIENT_ID;
    settings.external_google_secret = creds.GOOGLE_CLIENT_SECRET;
  }

  await api(`/v1/projects/${ref}/config/auth`, key, {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
  console.log(
    settings.external_google_enabled
      ? "  email and google sign-in enabled."
      : "  email sign-in enabled.",
  );
}

async function verify(ref, key) {
  /* ── schema ── */
  const rls = await runSql(
    ref,
    key,
    `select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename`,
  );
  const policies = await runSql(
    ref,
    key,
    `select tablename, count(*)::int as policies from pg_policies
      where schemaname = 'public' group by tablename order by tablename`,
  );
  const secured = new Map(rls.map((r) => [r.tablename, r.rowsecurity]));
  const counted = new Map(policies.map((r) => [r.tablename, r.policies]));

  console.log("\n  table               RLS   policies");
  console.log("  ──────────────────────────────────");
  let schemaOk = true;
  for (const table of EXPECTED_TABLES) {
    const present = secured.has(table);
    const on = secured.get(table) === true;
    const count = counted.get(table) ?? 0;
    const good = present && on && count === 4;
    if (!good) schemaOk = false;
    console.log(
      `  ${table.padEnd(18)}  ${present ? (on ? "on " : "OFF") : "—  "}    ${
        present ? String(count).padStart(2) : " —"
      }${good ? "" : "   <-- problem"}`,
    );
  }

  /* ── sign-in ── */
  const auth = await api(`/v1/projects/${ref}/config/auth`, key);
  console.log("\n  email sign-in   " + (auth.external_email_enabled ? "enabled" : "DISABLED"));
  console.log("  confirm email   " + (auth.mailer_autoconfirm ? "not required" : "required"));
  console.log("  site url        " + (auth.site_url || "(not set)"));
  console.log("  redirect allow  " + (auth.uri_allow_list || "(not set)"));
  if (auth.external_google_enabled) {
    console.log("  google sign-in  enabled (" + (auth.external_google_client_id || "no client id") + ")");
  }

  // Email on, and the app's own address reachable. Those two are what a reader
  // needs; anything else here is optional.
  const authOk =
    Boolean(auth.external_email_enabled) &&
    String(auth.uri_allow_list || "").includes(DEV_ORIGIN);

  console.log("");
  if (!schemaOk) {
    fail(
      "Schema is not in the state the app needs.",
      "A missing table means the migration has not run. RLS off, or fewer than four\n  policies, means the data is not protected — do not ship that.",
    );
  }
  if (!authOk) {
    fail(
      "Sign-in is not ready.",
      "Email sign-in must be enabled, and the redirect allow list must include the\n  address the app actually runs on.",
    );
  }
  console.log("  Ready: five tables, RLS on, four policies each, email sign-in live.\n");
}

async function main() {
  const creds = credentials();
  const key = creds.SUPABASE_ACCESS_TOKEN;
  const ref = projectRef();

  if (!key) {
    fail(
      "No Supabase access token found.",
      `Create one at https://supabase.com/dashboard/account/tokens, then write\n` +
        `  ${join(ROOT, CREDENTIAL_FILES[0])} as:\n\n` +
        `    SUPABASE_ACCESS_TOKEN=sbp_…\n` +
        `    GOOGLE_CLIENT_ID=….apps.googleusercontent.com\n` +
        `    GOOGLE_CLIENT_SECRET=GOCSPX-…\n\n` +
        `  The file is gitignored, and nothing here prints its contents.`,
    );
  }
  if (!ref) fail("No project ref.", "Expected VITE_SUPABASE_URL in .env.local, or pass --ref=<ref>.");

  console.log(`\n  project   ${ref}`);
  console.log(`  token     ${tail(key)}`);
  console.log(`  client id ${creds.GOOGLE_CLIENT_ID || "(not set)"}`);
  console.log(`  secret    ${tail(creds.GOOGLE_CLIENT_SECRET)}`);

  const all = process.argv.includes("--all");
  const verifyOnly = process.argv.includes("--verify");
  const wantSchema = all || (!verifyOnly && !process.argv.includes("--auth"));
  const wantAuth = all || process.argv.includes("--auth");

  try {
    if (wantSchema) await applySchema(ref, key);
    if (wantAuth) await applyAuth(ref, key, creds);
  } catch (err) {
    fail("That did not go through.", String(err.message));
  }

  try {
    await verify(ref, key);
  } catch (err) {
    if (String(err.message).startsWith("HTTP")) fail("Could not read the settings back.", String(err.message));
    throw err;
  }
}

await main();
