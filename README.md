# NeuroLens

Adaptive reading for ADHD, dyslexia and cognitive fatigue. NeuroLens takes dense
text — a PDF, an EPUB, a pasted chapter — and reshapes it into something calmer
to get through: bionic fixation, adjustable rhythm and spacing, a reading mask, a
word guide, and a set of palettes designed for low vision rather than for looks.

Live at **[neurolens.space](https://neurolens.space)**.

---

## Running it

```bash
npm install
cp .env.example .env.local   # then fill in the two Supabase values
npm run dev                  # http://localhost:8080
```

Two environment variables are required. Without them the app renders a single
screen saying so, rather than a sign-in page that cannot work:

| Variable | What it is |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | The project's anon key |
| `VITE_SITE_URL` | Optional. The canonical origin, for SEO and sitemaps. |

**The anon key belongs in the browser.** It is designed to be public, and it is
row-level security in the database — not the secrecy of that key — that decides
who can read what. Every table is `enable row level security` with policies
comparing `auth.uid()` to `user_id`; see [`supabase/migrations/`](supabase/migrations).
If those policies are ever dropped, the key becomes an open door.

`npm run check:env` confirms the project is reachable and the key is accepted.
Worth running when sign-in misbehaves — it exists because a one-letter typo in a
deployed environment variable (`superbase.co`) broke authentication in production
while every local check passed.

## The commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 8080 |
| `npm run build` | Production build |
| `npm test` | Unit tests — Node's own runner, no framework |
| `npm run test:a11y` | Accessibility audit in a real browser (axe + Playwright) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run check:env` | Is Supabase reachable, and is the key accepted? |
| `node scripts/audit-themes.mjs` | Contrast check on all 15 palettes (`--fix` applies) |

## How it is put together

```
src/
  components/      UI. app-shell.tsx is the frame; reader.tsx is the reader.
  lib/
    store.ts       Zustand. One store, all reading state.
    sync/          Offline-first Supabase sync — see below.
    telemetry/     Analytics and crash reports, both schema-locked.
    adaptive/      The engine that adjusts pace and spacing while you read.
    seo.ts         Per-route metadata and structured data.
  routes/          TanStack Start file routes. api/* are server handlers.
scripts/           Build steps, audits and one-off maintenance tools.
supabase/migrations/  The schema, including every RLS policy.
tests/             Browser tests. Accessibility only, on purpose.
```

**Stack.** React 19, TanStack Start/Router, Zustand, Tailwind v4, Vite 8,
Supabase (Postgres + Google OAuth), deployed on Vercel.

### Sync

Reading works offline and syncs when it can, so the data layer is not a thin
wrapper over the database. Worth knowing before changing it:

- **Writes are queued, not sent.** `sync/queue.ts` collapses repeated writes to
  the same target, so dragging a slider is one row, not two hundred.
- **A pull happens before a flush.** The other order loses whichever device
  synced second.
- **A local book is keyed by the first 48 characters of its text; the account
  keys it by a uuid.** `sync/identity.ts` maps between them. Two books that open
  with the same licence header collide under the local scheme, which is the whole
  reason the second scheme exists.
- **`localStorage` is namespaced per account** (`sync/../storage-scope.ts`).
  Without it, two people on one device saw each other's library. Note that
  signing out does *not* clear it: somebody who declined to upload their books
  keeps them only there.
- **A queued write reports `sent`, `gone` or `defer`.** It used to return
  nothing on failure, which read as success and dequeued the write — highlights
  were being destroyed silently.

### Privacy, as code

The privacy policy is meant to be checkable against the source rather than taken
on trust, so most of its claims are enforced somewhere specific:

- [`src/lib/analytics.ts`](src/lib/analytics.ts) — every event is checked against
  a fixed schema and each field accepts only values from a closed list. There is
  no free-text field, so a book's contents cannot be recorded even by mistake.
- [`src/lib/telemetry/errors.ts`](src/lib/telemetry/errors.ts) — crash messages
  are rewritten before sending: quoted text, URLs, addresses and numbers are
  replaced. [The tests](src/lib/telemetry/errors.test.ts) are mostly hostile
  inputs, because they *are* the privacy claim.
- [`supabase/migrations/0002_telemetry.sql`](supabase/migrations/0002_telemetry.sql) —
  the telemetry tables grant `insert` and nothing else. Not even the app can read
  them back through the API. Retention is a `pg_cron` job, not a promise.

### Accessibility

This is the product, not a checklist. `npm run test:a11y` runs axe against every
public page at WCAG 2.2 AA on each push, and `scripts/audit-themes.mjs` checks
all fifteen palettes arithmetically — a browser test only ever measures whichever
one happened to be loaded.

Both found real faults when first written: eight palettes whose small print sat
between 3.88:1 and 4.34:1, and a reduced-motion rule that left text at
`opacity: 0` until an observer fired, so a reader who asked for less motion got
invisible paragraphs.

## Notes for Windows

- `npm install` prunes `@rolldown/binding-win32-x64-msvc`, and the build then
  fails. Restore it with `npm install --no-save @rolldown/binding-win32-x64-msvc`.
  Do not add it to `package.json` — it is the wrong platform for CI.
- Git Bash rewrites arguments that look like paths. Prefix with
  `MSYS_NO_PATHCONV=1` when passing something like `/auth/v1/settings`.

## Licence

[MIT](LICENSE).
