#!/usr/bin/env node
/**
 * Apply the schema to a live Supabase project, and check it landed.
 *
 * Exists so the migration does not have to be pasted by hand into the
 * dashboard, and — more to the point — so the token that authorises it never
 * has to be pasted into a chat window. The token is read from
 * `.supabase-token` (gitignored) or `$SUPABASE_ACCESS_TOKEN`, used, and never
 * printed; only the last four characters are ever shown, so a run can be told
 * apart from a run with the wrong token.
 *
 * Make a token at https://supabase.com/dashboard/account/tokens
 *
 *   node scripts/supabase-apply.mjs            # apply, then verify
 *   node scripts/supabase-apply.mjs --verify   # verify only, change nothing
 *
 * A personal access token can do anything to any of your projects, which is
 * why this only ever sends the one migration file and the read-only checks
 * below, and why it refuses to run against a project ref it was not given.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = join(ROOT, "supabase/migrations/0001_neurolens_schema.sql");
const TOKEN_FILE = join(ROOT, ".supabase-token");
const API = "https://api.supabase.com";

const EXPECTED_TABLES = ["bookmarks", "books", "highlights", "ink_strokes", "reading_settings"];

function fail(message, hint) {
  console.error(`\n  ${message}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

/** The token, from a file or the environment. Never logged. */
function token() {
  const fromEnv = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  if (existsSync(TOKEN_FILE)) {
    const raw = readFileSync(TOKEN_FILE, "utf8").trim();
    // Tolerate `SUPABASE_ACCESS_TOKEN=sbp_…` as well as a bare token.
    const line = raw.split(/\r?\n/).find((l) => l.trim() && !l.trim().startsWith("#")) ?? "";
    return line.includes("=") ? line.slice(line.indexOf("=") + 1).trim() : line.trim();
  }
  return "";
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

async function runSql(ref, key, query) {
  const response = await fetch(`${API}/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await response.text();
  if (!response.ok) {
    // The body can echo the query; keep it, it is the app's own SQL, but never
    // let the token near a log line.
    throw new Error(`HTTP ${response.status} — ${text.slice(0, 400)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}

async function verify(ref, key) {
  const rls = await runSql(
    ref,
    key,
    `select tablename, rowsecurity from pg_tables
      where schemaname = 'public' order by tablename`,
  );
  const policies = await runSql(
    ref,
    key,
    `select tablename, count(*)::int as policies from pg_policies
      where schemaname = 'public' group by tablename order by tablename`,
  );

  const byTable = new Map(rls.map((row) => [row.tablename, row.rowsecurity]));
  const byPolicy = new Map(policies.map((row) => [row.tablename, row.policies]));

  console.log("\n  table               RLS     policies");
  console.log("  ─────────────────────────────────────");
  let ok = true;
  for (const table of EXPECTED_TABLES) {
    const present = byTable.has(table);
    const secured = byTable.get(table) === true;
    const count = byPolicy.get(table) ?? 0;
    const good = present && secured && count === 4;
    if (!good) ok = false;
    console.log(
      `  ${table.padEnd(18)}  ${present ? (secured ? "on " : "OFF") : "—  "}     ${
        present ? String(count).padStart(2) : " —"
      }   ${good ? "" : "  <-- problem"}`,
    );
  }

  if (!ok) {
    fail(
      "Schema is not in the state the app needs.",
      "A missing table means the migration did not run. RLS off, or fewer than 4\n  policies, means the data is not protected — do not ship that.",
    );
  }
  console.log("\n  All five tables present, RLS on, 4 policies each.");
}

async function main() {
  const key = token();
  const ref = projectRef();

  if (!key) {
    fail(
      "No access token found.",
      `Create one at https://supabase.com/dashboard/account/tokens, then either:\n` +
        `    write it to ${TOKEN_FILE}\n` +
        `    or export SUPABASE_ACCESS_TOKEN=…\n\n` +
        `  The file is gitignored, and this script never prints the token.`,
    );
  }
  if (!ref) {
    fail("No project ref.", "Expected VITE_SUPABASE_URL in .env.local, or pass --ref=<ref>.");
  }

  console.log(`\n  project  ${ref}`);
  console.log(`  token    …${key.slice(-4)} (${key.length} chars)`);

  const verifyOnly = process.argv.includes("--verify");
  if (!verifyOnly) {
    const sql = readFileSync(MIGRATION, "utf8");
    console.log(`  applying supabase/migrations/0001_neurolens_schema.sql (${sql.split("\n").length} lines)`);
    try {
      await runSql(ref, key, sql);
      console.log("  applied.");
    } catch (err) {
      fail(`Could not apply the migration.`, String(err.message));
    }
  }

  try {
    await verify(ref, key);
  } catch (err) {
    fail("Could not read the schema back.", String(err.message));
  }

  console.log("");
}

await main();
