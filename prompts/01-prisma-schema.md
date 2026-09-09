# 01 — Prisma Schema & Initial Migration

## Goal
Add Prisma orm with the six-model schema from claude.md Section 6 (SQLite dev DB) and run the initial migration.

## Files to create/modify
- `prisma/schema.prisma` (new)
- `.env` (new) — `DATABASE_URL="file:./dev.db"`
- `src/lib/prisma.ts` (new) — Prisma client singleton
- `package.json` — add `prisma`, `@prisma/client` deps + `db:*` scripts
- `.gitignore` — ensure `/prisma/dev.db` and `.env` are ignored

## Plan
1. Install `prisma` (dev dep) and `@prisma/client` (dep) via bun.
2. `bunx prisma init --datasource-provider sqlite` to scaffold `prisma/schema.prisma` and `.env`.
3. Replace generated schema with the 6 models from AGENT.md Section 6 verbatim: `Medication`, `Schedule`, `DispenseLog` (+ `DispenseStatus` enum), `StockLevel`, `EnvironmentLog`, `Alert` (+ `AlertType` enum).
4. Add `src/lib/prisma.ts` exporting a singleton `PrismaClient` (guarded against hot-reload creating multiple instances).
5. Run `bunx prisma migrate dev --name init` to create the SQLite DB and migration.
6. Add `package.json` scripts: `db:studio` (`prisma studio`), `db:migrate` (`prisma migrate dev`), `db:generate` (`prisma generate`).
7. Confirm `.gitignore` covers `prisma/dev.db*` and `.env`.

## Assumptions
- **Stack deviation**: actual scaffold is Bun + React (`bun-react-template`), not Next.js App Router as AGENT.md Section 4/5 describe. Prisma itself is framework-agnostic, so this phase is unaffected — but Prompt 02 (API routes) will need to target Bun's `Bun.serve` route handlers in `src/index.ts` instead of `src/app/api/*/route.ts`. Flagging now per AGENT.md's instruction to call out structural deviations explicitly.
- **Version pin (discovered mid-implementation)**: `bun add prisma @prisma/client` installed `8.0.0-rc.13` (npm's current `latest` tag), a pre-release with a reworked CLI — `prisma init` no longer scaffolds a datasource/schema, instead it wires up a `prisma.config.ts` and an "agent skills" postinstall hook, neither of which AGENT.md's workflow expects. Re-pinned both packages to `7.10.0` (the last stable release, npm `prev` tag), which keeps the classic `schema.prisma` + `prisma migrate dev` + `prisma studio` flow the rest of this prompt (and AGENT.md Section 6) assumes.
- Using SQLite file `dev.db` at project root via Prisma's default dev setup (matches AGENT.md Section 4: "SQLite (dev)").
- `cuid()` default ID strategy as specified in the schema — no change.
- No seed script requested yet; skipping unless asked in a later prompt.

## Verification
- `bunx prisma validate` passes with no errors. ✅
- ~~`bunx prisma studio` opens and shows 6 tables~~ — **not possible on 7.10.0**: Prisma Studio in this version refuses local SQLite `file:` URLs outright ("Prisma Studio is not supported for the `file:./dev.db` protocol"), and `@prisma/config`'s type definitions confirm there's no adapter hook to work around it. Confirmed by user to skip Studio and verify by other means instead (see below).
- `prisma/migrations/*/migration.sql` contains `CREATE TABLE` for all 6 models: Medication, Schedule, DispenseLog, StockLevel, EnvironmentLog, Alert. ✅ (verified directly)
- `dev.db` file exists at project root. ✅
- `bun run db:generate` completes without error, confirming the client is generated to `src/generated/prisma`. ✅
- A script importing `src/lib/prisma.ts` and calling `.count()` on all 6 models runs successfully under Bun. ✅ (proves the generated client + `@prisma/adapter-libsql` driver adapter work end-to-end, not just that migration SQL applied)

## Deviations from original plan (discovered mid-implementation)
1. **Prisma version**: `bun add prisma @prisma/client` installs npm's `latest` tag, which is `8.0.0-rc.13` — a pre-release of Prisma's new "Developer Platform" CLI (contract/branch/deploy model). It removes `prisma migrate dev`, `prisma studio`, `prisma generate`, and `prisma validate` entirely. User confirmed pinning to `7.10.0` (last stable, npm `prev` tag) instead, which keeps the classic schema.prisma workflow this prompt assumes.
2. **Driver adapter required**: Prisma 7's `prisma-client` generator has no built-in query engine for direct connections — `new PrismaClient()` throws `PrismaClientInitializationError` demanding an explicit driver adapter, even for local SQLite. Added `@prisma/adapter-libsql` (not `@prisma/adapter-better-sqlite3`, which depends on a native binding Bun can't `dlopen`) and wired it into `src/lib/prisma.ts`. Also added `dotenv` as a dev dependency, required by the generated `prisma7.config.ts` to load `.env`.
3. **Config file name**: `prisma init` scaffolded `prisma7.config.ts` (not `prisma.config.ts`) — kept as generated since that's what the installed CLI reads by default.
4. **Prisma Studio unsupported for SQLite** on 7.10.0 — see Verification above.

## Files actually created/modified (final)
- `prisma/schema.prisma`, `prisma7.config.ts`, `.env` (new)
- `src/lib/prisma.ts` (new) — singleton using `@prisma/adapter-libsql`
- `package.json` — added `prisma`, `@prisma/client`, `@prisma/adapter-libsql` deps, `dotenv` dev dep, `db:generate`/`db:migrate`/`db:studio` scripts
- `.gitignore` — added `/dev.db`, `/dev.db-journal` (already had `.env` and `/src/generated/prisma`)
- `prisma/migrations/20260909140209_init/` (new)

✅ Completed — Prisma schema (6 models/2 enums from AGENT.md Section 6) added on SQLite via Prisma 7.10.0 with the `@prisma/adapter-libsql` driver adapter (Bun-compatible); initial migration applied; client singleton at `src/lib/prisma.ts` verified end-to-end. `prisma studio` is not usable with local SQLite on this Prisma version — flagged for awareness, not blocking.
