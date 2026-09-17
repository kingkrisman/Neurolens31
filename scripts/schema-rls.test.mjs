import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

/**
 * The row-level security policies, proved rather than trusted.
 *
 * In Supabase the anon key is public and ships inside the browser, so these
 * policies are not a second line of defence — they are the only thing standing
 * between one person's library and everybody else's. A dropped policy would not
 * break a single test elsewhere in this suite; it would silently publish every
 * book in the database. Hence this file.
 *
 * Runs against PGLite (real Postgres, compiled to WASM) with the two things
 * Supabase supplies stubbed to behave the same way: `auth.users`, and an
 * `auth.uid()` that reads the JWT subject out of a setting.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = join(ROOT, "supabase/migrations/0001_neurolens_schema.sql");

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";

let db;

/** Run a query as a signed-in person, the way PostgREST does. */
async function as(uid, sql, params) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role;");
  }
}

before(async () => {
  db = await new PGlite();
  await db.exec(`
    create schema if not exists auth;
    create table auth.users (id uuid primary key, email text, created_at timestamptz default now());
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    do $$ begin
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
    end $$;
  `);
  await db.exec(readFileSync(MIGRATION, "utf8"));
  await db.exec(`
    insert into auth.users (id, email) values ('${ALICE}','alice@example.com'), ('${BOB}','bob@example.com');
    grant usage on schema public to authenticated, anon;
    grant all on all tables in schema public to authenticated;
  `);
});

after(async () => {
  await db?.close();
});

test("the migration can be applied twice without failing", async () => {
  // People paste it again after editing it. It should not punish them.
  await db.exec(readFileSync(MIGRATION, "utf8"));
});

test("every table in public has row-level security enabled", async () => {
  const { rows } = await db.query(
    "select tablename, rowsecurity from pg_tables where schemaname = 'public'",
  );
  assert.ok(rows.length >= 5, "expected the app's tables to exist");
  for (const row of rows) {
    assert.equal(row.rowsecurity, true, `${row.tablename} has RLS off — it is world-readable`);
  }
});

test("every table has all four policies", async () => {
  const { rows } = await db.query(
    "select tablename, count(*)::int as n from pg_policies where schemaname='public' group by tablename",
  );
  for (const row of rows) {
    assert.equal(row.n, 4, `${row.tablename} has ${row.n} policies, expected select/insert/update/delete`);
  }
});

test("a reader sees their own book", async () => {
  await as(ALICE, "insert into public.books (user_id, title, content) values ($1,$2,$3)", [
    ALICE,
    "Alice's book",
    "text",
  ]);
  const { rows } = await as(ALICE, "select title from public.books");
  assert.equal(rows.length, 1);
});

test("a reader cannot see somebody else's book", async () => {
  const { rows } = await as(BOB, "select title from public.books");
  assert.equal(rows.length, 0, "one account can read another's library");
});

test("a reader cannot write a row that claims to belong to somebody else", async () => {
  await assert.rejects(
    () =>
      as(BOB, "insert into public.books (user_id, title, content) values ($1,$2,$3)", [
        ALICE,
        "Forged",
        "x",
      ]),
    /row-level security/,
    "the insert policy's `with check` is missing — rows can be planted in another account",
  );
});

test("a reader cannot update or delete somebody else's book", async () => {
  const updated = await as(BOB, "update public.books set title='hijacked' returning id");
  assert.equal(updated.rows.length, 0);
  const deleted = await as(BOB, "delete from public.books returning id");
  assert.equal(deleted.rows.length, 0);
});

test("an anonymous visitor reads nothing at all", async () => {
  // What the public anon key gets with no session attached.
  await db.exec("set role anon;");
  try {
    const { rows } = await db.query("select * from public.books");
    assert.equal(rows.length, 0, "the anon role can read the library");
  } catch {
    // Refused outright is also correct.
  } finally {
    await db.exec("reset role;");
  }
});

test("deleting an account deletes everything it owned", async () => {
  await as(ALICE, "insert into public.highlights (user_id, book_id, line_idx, start_offset, end_offset, text) select $1, id, 0, 0, 4, 'text' from public.books limit 1", [ALICE]);
  await db.exec(`delete from auth.users where id='${ALICE}'`);
  for (const table of ["books", "highlights", "bookmarks", "ink_strokes", "reading_settings"]) {
    const { rows } = await db.query(`select count(*)::int as n from public.${table}`);
    assert.equal(rows[0].n, 0, `${table} still holds rows for a deleted account`);
  }
});
