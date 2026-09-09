# 05 — Migrate Prisma + SQLite → Drizzle ORM + Postgres

## Goal
Replace Prisma ORM/SQLite with Drizzle ORM on Postgres, keeping every API response shape byte-identical so the dashboard frontend needs no changes.

> **Queue note**: schedule CRUD renumbered to `06-schedule-crud.md` (it was drafted but never approved). Doing the ORM swap first so CRUD gets written once, on Drizzle, instead of twice.

## ⚠ This contradicts AGENT.md
AGENT.md Section 4 mandates **Prisma + SQLite**, Section 6 is a Prisma schema, Section 9 says "one Prisma client singleton". After this prompt all three are wrong. **AGENT.md needs updating** — I'm not editing it unprompted since it's the governing document. Section 7's firmware endpoint contract is unaffected.

## Decisions already made (confirmed)
- **Local Postgres in Docker**, not cloud Prisma Postgres — no account needed, works offline. The Prisma Postgres doc's setup is identical either way; only `DATABASE_URL` differs, so pointing at Prisma Postgres later is a one-line env change.
- **Prisma removed entirely** — Drizzle + drizzle-kit owns schema, queries, and migrations.

## Prerequisite (blocking)
**Docker Desktop is installed (v29.4.3) but its daemon is not running.** It must be started before the DB can come up. I can't reliably start a GUI app for you — start Docker Desktop, or tell me to try.

## Files to create/modify
**New**
- `docker-compose.yml` — postgres:17 service, port 5432, named volume
- `drizzle.config.ts` — schema path, out dir, `dialect: "postgresql"`
- `src/db/schema.ts` — 6 tables + 2 pg enums
- `src/lib/db.ts` — Drizzle client singleton (replaces `src/lib/prisma.ts`)

**Rewrite (Prisma calls → Drizzle queries, responses unchanged)**
- `src/api/dispenseLog.ts`, `confirmTaken.ts`, `schedule.ts`, `stockAlert.ts`, `environmentLog.ts`, `dashboard.ts`
- `deviceHeartbeat.ts` is untouched (no DB access)

**Delete**
- `prisma/` (schema + migrations), `prisma7.config.ts`, `src/generated/prisma/`, `src/lib/prisma.ts`, `dev.db`

**Modify**
- `package.json` — drop `prisma`, `@prisma/client`, `@prisma/adapter-libsql`, `dotenv`; add `drizzle-orm`, `pg`, `-D drizzle-kit`, `@types/pg`; repoint `db:*` scripts at drizzle-kit
- `.env` — `DATABASE_URL` → `postgres://postgres:postgres@localhost:5432/pilldispenser`
- `.gitignore` — drop `/dev.db`, `/src/generated/prisma` entries

## Plan
1. Add `docker-compose.yml`; bring Postgres up; confirm it accepts connections.
2. Swap dependencies; update `.env` and `db:*` scripts.
3. Write `src/db/schema.ts` mirroring AGENT.md Section 6 exactly (same table and column names, so the SQL shape is recognisable).
4. Write `src/lib/db.ts` using `drizzle-orm/node-postgres` + `pg` `Pool`, singleton-guarded like the old Prisma client.
5. `drizzle-kit generate` + `drizzle-kit migrate` → 6 tables in Postgres.
6. Rewrite the 6 handlers. `dashboard.ts` is the involved one: its `Promise.all` of 5 queries becomes Drizzle selects, with the adherence counts done as SQL aggregates rather than fetching rows and filtering in JS.
7. Delete all Prisma artifacts.
8. Re-seed the test data (Metformin 08:00 daily + a few logs/alerts) so the dashboard has something to show.
9. Verify every endpoint returns the same shape as before, and the home page renders identically to prompt 04's screenshot.

## Assumptions
- **IDs change from `cuid()` to `gen_random_uuid()`.** Prisma's `cuid()` is a Prisma runtime feature with no Drizzle equivalent; Postgres 13+ has `gen_random_uuid()` built in. Ids become UUIDs instead of `cmtu6gy5o...` strings. Nothing external depends on them yet (the ESP32 sends ids it got from `GET /api/schedule`), so this is safe *now* but would be a breaking change once firmware stores ids.
- **All existing `dev.db` data is lost.** A fresh Postgres database starts empty; the prompt-02/04 test rows are re-seeded, not migrated. Not writing a SQLite→Postgres data migration for throwaway test data.
- **Enums become real Postgres enum types** (`pgEnum`). SQLite stored them as plain TEXT. Values are unchanged, so JSON responses are identical.
- **Types map as**: `String`→`text`, `Int`→`integer`, `Float`→`doublePrecision`, `Boolean`→`boolean`, `DateTime`→`timestamp with time zone` + `defaultNow()`.
- **Timestamps may serialise differently.** Prisma returned ISO strings; `pg` returns JS `Date`s, which `Response.json` also serialises to ISO — expected to match, but this is exactly the kind of thing to verify rather than assume, so it's an explicit check below.
- **`prisma studio` is replaced by `drizzle-kit studio`** — which, unlike Prisma's, does work against Postgres. This incidentally fixes the "no DB browser" gap from prompt 01.
- Postgres credentials are the throwaway `postgres:postgres` — fine for a local dev container, must not be reused anywhere real.
- `dotenv` is dropped because it only existed for `prisma7.config.ts`; Bun loads `.env` natively.

## Verification
- `docker compose up -d` → Postgres healthy, accepting connections.
- `bun run db:migrate` → 6 tables + 2 enum types exist (checked via `drizzle-kit studio` or `psql \dt`).
- Every endpoint returns the **same JSON shape** as before the migration:
  - `GET /api/schedule` → array with nested `medication`
  - `POST /api/dispense-log` / `/api/confirm-taken` → 201; 404 on unknown id; 400 on bad body
  - `POST /api/stock-alert` → updates the same compartment row rather than duplicating
  - `POST /api/environment-log` → `alert` false in range / true out of range
  - `GET /api/dashboard` → all 4 keys, adherence maths correct
- Timestamps still serialise as ISO strings.
- Home page renders identically to prompt 04 (screenshot comparison), no console errors.

## Results
| Check | Result |
|---|---|
| Postgres container | `pill-dispenser-db` up and healthy on 5432 ✅ |
| Migration | 6 tables + 2 enum types (`AlertType`, `DispenseStatus`) created ✅ |
| `GET /api/schedule` | 200, array with nested `medication` — same shape ✅ |
| `POST /api/dispense-log` / `confirm-taken` | 201 ✅ |
| `POST /api/stock-alert` | Same `stockLevel.id` on repeat call — updates, doesn't duplicate ✅ |
| `POST /api/environment-log` | `alert:false` in range, `alert:true` out of range ✅ |
| `GET /api/dashboard` | All 4 keys, adherence maths correct ✅ |
| Timestamps | Still ISO strings (`2026-09-09T14:58:49.306Z`) — `pg` Dates serialise identically ✅ |
| Home page | Renders identically to prompt 04, zero frontend changes needed ✅ |
| Leftover Prisma refs | None in `src/` or any config file ✅ |
| `drizzle-kit studio` | Runs on port 4983 ✅ (this is the DB browser Prisma Studio couldn't provide) |

## Deviation from plan
**UUID validation added to `src/lib/validators.ts`** (not in the planned file list). With `text` ids, an unknown id like `"does-not-exist"` returned a clean 404. Against a Postgres `uuid` column it instead makes Postgres throw `invalid input syntax for type uuid` → a 500, silently regressing prompt 03's error contract. Changing `z.string().min(1)` → `z.uuid()` restores the intended split:
- malformed id → **400** "Invalid UUID"
- well-formed but absent id → **404** "Schedule not found"

## Still outstanding
**AGENT.md is now out of date** — Section 4 (ORM/DB table), Section 6 (Prisma schema), and Section 9 ("one Prisma client singleton") all describe the removed stack. Not edited unprompted; it's the governing document.

✅ Completed — Prisma + SQLite fully replaced by Drizzle ORM + Postgres (Docker). All endpoints return byte-identical shapes, dashboard renders unchanged, `drizzle-kit studio` gives the DB browser that was missing since prompt 01.
