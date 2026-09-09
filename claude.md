# AGENT.md — Smart Pill Dispenser Dashboard
Your are Principle-level seniour and embedded developer
This file governs how an AI coding agent (Claude Code or similar) builds this project.
Read this file in full before writing any code. Follow the workflow in Section 2 exactly —
it is not optional, and skipping it is treated as a failed run.

---

## 1. Project Context

Dashboard + API for a Smart Pill Dispenser for Elderly Care (IoT/embedded course project).
An ESP32-based device dispenses medication on a schedule, verified by an IR break-beam
sensor, and reports events (dispensed / confirmed taken / missed, low stock, storage
condition alerts) over WiFi via HTTP. This repo is the **server + dashboard** side only —
it does not include the ESP32 firmware, but its API contract must match what the firmware
sends (see Section 6).

**Primary users:** a caregiver, viewing dose history, stock levels, and alerts, and editing
the medication schedule from a browser.

---

## 2. Mandatory Workflow — Plan → Approve → Implement

This is the most important rule in this file. For **every** task (a feature, a file, a
schema change, anything beyond a one-line fix), the agent MUST follow this loop:

1. **Draft a prompt file.** Before writing or editing any code, create a new file at
   `/prompts/NN-<short-task-name>.md` (zero-padded, e.g. `07-history-page.md`). It must
   contain:
   - **Goal** — one sentence.
   - **Files to create/modify** — exact paths.
   - **Plan** — a short numbered list of what will be done, not prose.
   - **Assumptions** — anything the agent is guessing rather than confirming.
   - **Verification** — how to check it worked (e.g. "run `bun run db:studio`, confirm the
     6 tables exist"). Prefer checks that exercise the real thing — hit the endpoint, render
     the page — over asserting the code looks right.
2. **Stop and wait.** After writing the prompt file, output only:
   `Prompt NN-<task-name>.md ready for review. Reply "approve NN" to proceed, or give
   feedback to revise.`
   Do not write, edit, or run any implementation code for this task until the user replies
   with explicit approval for that specific number.
3. **Revise, don't duplicate.** If the user gives feedback instead of approval, update the
   *same* prompt file and ask again. Never create `01b-...` or a second file for the same
   task.
4. **Implement only what was approved.** Once approved, implement exactly what that prompt
   describes — nothing extra "while I'm in there." If you discover mid-implementation that
   the plan needs to change, stop, update the prompt file with the change, and get
   re-approval before continuing.
5. **Close it out.** After implementation, append `✅ Completed — <one-line summary>` to the
   bottom of that prompt file. Then draft the next prompt and repeat.

Never batch two unapproved tasks into one prompt. Never move to the next prompt without a
fresh approval for it, even if the previous one went smoothly.

---

## 3. Token Efficiency Rules

- Read only files relevant to the **current approved prompt** — don't re-read the whole repo
  each turn.
- Prefer targeted edits over rewriting whole files when a small change will do.
- Keep prompt files short and bulleted — they're working documents, not reports.
- Don't restate full code in the chat reply after writing a file; a one-line summary is
  enough (the prompt file + git diff are the durable record).
- Batch genuinely related small changes into one prompt (e.g., all schema tables together)
  rather than one prompt per trivial file.
- Don't create speculative scaffolding — only what the current approved prompt needs.
- When resuming later on a task, re-read that task's prompt file instead of re-deriving the
  plan from conversation history.

---

## 4. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Runtime + server | **Bun** with `Bun.serve({ routes })` | One process serves the API and bundles/serves the React frontend (with HMR). Native router gives per-method handlers and typed `:params` — no Express layer needed |
| Frontend | **React 19 SPA** + **react-router-dom** | Client-side routing over the same Bun server |
| Language | **TypeScript** (strict mode) | Type safety across frontend, API routes, and DB layer |
| ORM | **Drizzle ORM** + `drizzle-kit` | Type-safe SQL-shaped queries, migrations, and `drizzle-kit studio` as a DB browser |
| Database | **PostgreSQL 17** in Docker (`docker-compose.yml`) | Same engine locally and in prod; swap `DATABASE_URL` to point at hosted/Prisma Postgres with no code change |
| DB driver | **`pg`** (node-postgres) | Standard Postgres driver Drizzle connects through |
| Styling | **Tailwind CSS v4** + shadcn/ui primitives | Fast, no separate CSS files to maintain |
| Data fetching | **Client-side `fetch` in `useEffect`** | This is an SPA, not Next.js — there are no Server Components or Server Actions available. Aggregate endpoints (e.g. `/api/dashboard`) keep it to one round trip per page |
| Validation | **Zod** | Shared validation between API routes and forms |
| Charts | **Recharts** | Adherence trend and stock depletion charts (not yet installed) |

> **History:** this project began on Next.js + Prisma + SQLite as originally specified. The
> scaffold was actually created as a Bun + React template, and prompt 05 migrated Prisma +
> SQLite → Drizzle + Postgres. The table above is the current, authoritative stack.

---

## 5. Project Structure

There is **no file-system routing** — Bun's router is one explicit `routes` object in
`src/index.ts`. API handlers live in `src/api/` as plain modules exporting `GET`/`POST`/etc.
and are registered there by hand.

```
pill-dispenser-dashboard/
├── prompts/                        # workflow: see Section 2
│   ├── 01-prisma-schema.md         # (historical — superseded by 05)
│   └── ...
├── drizzle/                        # generated SQL migrations — commit these
│   └── 0000_*.sql
├── src/
│   ├── index.ts                    # Bun.serve — ALL routes registered here
│   ├── frontend.tsx                # React entry
│   ├── index.html                  # HTML shell (bundled by Bun)
│   ├── index.css                   # Tailwind entry
│   ├── App.tsx                     # <BrowserRouter> + <Routes>
│   ├── api/                        # one module per endpoint
│   │   ├── dispenseLog.ts          # POST /api/dispense-log
│   │   ├── confirmTaken.ts         # POST /api/confirm-taken
│   │   ├── schedule.ts             # GET/POST /api/schedule, PATCH/DELETE /api/schedule/:id (time fields only)
│   │   ├── medications.ts          # GET /api/medications, PATCH /api/medications/:id, POST /api/medications/:id/schedules
│   │   ├── stockAlert.ts           # POST /api/stock-alert (writes StockLevel + StockLog)
│   │   ├── stock.ts                # GET /api/stock (current + history, dashboard-only)
│   │   ├── environmentLog.ts       # POST /api/environment-log
│   │   ├── deviceHeartbeat.ts      # POST /api/device-heartbeat (persisted to Device table)
│   │   ├── dashboard.ts            # GET /api/dashboard (aggregate, dashboard-only)
│   │   ├── history.ts              # GET /api/history (filters + pagination)
│   │   └── alerts.ts               # GET /api/alerts, PATCH /api/alerts/:id (resolve/reopen)
│   ├── jobs/
│   │   └── monitor.ts              # periodic MISSED/DEVICE_OFFLINE check — see Section 6
│   ├── db/
│   │   └── schema.ts               # Drizzle schema — source of truth (Section 6)
│   ├── pages/
│   │   ├── Home.tsx
│   │   ├── SchedulePage.tsx
│   │   ├── HistoryPage.tsx
│   │   ├── StockPage.tsx
│   │   └── AlertsPage.tsx
│   ├── components/
│   │   ├── ui/                     # shadcn primitives
│   │   ├── Layout.tsx              # nav shell + <Outlet />
│   │   ├── AlertBanner.tsx
│   │   ├── DashboardStats.tsx
│   │   ├── TodaySchedule.tsx
│   │   ├── ScheduleTable.tsx       # groups dose times by medication
│   │   ├── ScheduleForm.tsx        # create a new medication + its first time
│   │   ├── TimeForm.tsx            # add/edit a dose time on an existing medication
│   │   ├── MedicationEditForm.tsx  # edit name/dosage/compartment (one path, one row)
│   │   ├── DoseHistoryTable.tsx / HistoryFilters.tsx
│   │   ├── AlertList.tsx
│   │   └── StockChart.tsx          # Recharts — single-series small multiples, see Section 6
│   ├── lib/
│   │   ├── db.ts                   # Drizzle client singleton + exported pgPool (see Section 6)
│   │   ├── time.ts                 # APP_TIMEZONE-aware date/weekday helpers — Section 6
│   │   ├── alerts.ts               # raiseAlert()/resolveAlerts() — dedup via DB constraint
│   │   ├── apiHandler.ts           # withErrorHandling — JSON error boundary
│   │   └── validators.ts           # Zod schemas
│   └── types/
│       └── index.ts
├── docker-compose.yml              # postgres:17-alpine
├── drizzle.config.ts
├── .env                            # DATABASE_URL, APP_TIMEZONE
├── package.json
├── tsconfig.json
└── claude.md                       # this file (referred to throughout as AGENT.md)
```

### Running it

```bash
bun run db:up        # start Postgres (docker compose up -d)
bun run db:migrate   # apply migrations in drizzle/
bun dev              # http://localhost:3000
bun run db:studio    # browse the DB at https://local.drizzle.studio
bun run db:generate  # after editing src/db/schema.ts — writes a new migration
bun run db:down      # stop Postgres
```

Postgres must be running before `bun dev`, or every DB-backed endpoint returns a JSON 500.

`APP_TIMEZONE` (IANA name, e.g. `Asia/Kolkata`) is the **care location's** timezone, not the
server's — it drives every "is this dose due today" / "was this dose missed" decision
(`src/lib/time.ts`). Defaults to the server's own zone if unset. Get this right before relying
on missed-dose detection; getting it wrong doesn't error, it just quietly evaluates doses
against the wrong clock.

---

## 6. Database Schema (Drizzle + Postgres)

**`src/db/schema.ts` is the source of truth.** The snippet below is the shape, not a copy to
edit — change the real file, then `bun run db:generate && bun run db:migrate`.

Table and column names are quoted PascalCase/camelCase (carried over from the original Prisma
schema), so raw SQL needs double quotes: `SELECT * FROM "Medication";`

```ts
export const dispenseStatus = pgEnum("DispenseStatus", [
  "DISPENSED", "CONFIRMED_TAKEN", "MISSED",
]);
export const alertType = pgEnum("AlertType", [
  "LOW_STOCK", "MISSED_DOSE", "STORAGE_CONDITION", "DEVICE_OFFLINE",
]);

Medication      id uuid PK · name text · dosage text · compartmentNo integer · createdAt timestamptz
Schedule        id uuid PK · medicationId uuid → Medication.id · time text "HH:mm" · frequency text · createdAt timestamptz
DispenseLog     id uuid PK · scheduleId uuid → Schedule.id · status DispenseStatus · timestamp timestamptz
StockLevel      id uuid PK · compartmentNo integer · weight double · lastUpdated timestamptz  (upserted — current value only)
StockLog        id uuid PK · compartmentNo integer · weight double · timestamp timestamptz    (append-only — the depletion history StockLevel can't provide)
EnvironmentLog  id uuid PK · temperature double · humidity double · alert boolean=false · timestamp timestamptz
Alert           id uuid PK · type AlertType · message text · resolved boolean=false · createdAt timestamptz
```

Relations (`relations(...)` in the same file) let `db.query.schedule.findMany({ with: { medication: true } })` work.

**Notes that matter when writing queries:**
- **Ids are `uuid`, not cuid strings.** Passing a non-UUID string into a `WHERE id = ...`
  makes Postgres throw (→ 500), so **any route taking an id must validate it with `z.uuid()`**
  — that's what keeps "malformed id" a 400 and "unknown id" a 404.
- Enum values are unchanged from the original spec, so JSON responses match the firmware contract.
- Timestamps come back as JS `Date`s and serialise to ISO strings via `Response.json`.

### Tables added since the original spec (prompts 08/09/11/13)
- **`Schedule.active`** (boolean) — deleting a schedule with dose history archives it
  (`active = false`, excluded from `GET /api/schedule`) instead of destroying the adherence
  record. `?includeArchived=1` opts back in (used by the history page's medication filter).
- **`Schedule.dayOfWeek`** (0=Sun..6=Sat, nullable) — only meaningful when `frequency = "weekly"`.
  Null means unconfigured and is treated as due every day (fail open — see prompt 08).
- **`Device`** (singleton row, id `"default"`) — persists heartbeat `lastSeenAt` across restarts.
- **`JobState`** (key/value) — holds the missed-dose monitor's back-fill watermark.
- **`Alert.dedupeKey`** + a partial unique index (`WHERE resolved = false`) — the *database*
  enforces "only one unresolved alert per condition", not application code. See prompt 09/11
  for why a read-then-write check isn't safe here.
- **`StockLog`** (append-only) — `StockLevel` is upserted per compartment (current value
  only), so it never had any depletion history to chart. `StockLog` gets one row per
  `POST /api/stock-alert` call and starts empty from prompt 13 onward; readings before that
  prompt are gone, they were never kept anywhere.
- **Medication as active isn't a stored flag** — a medication counts as "active" only if at
  least one of its `Schedule` rows is (`schedule.active`). Any query that needs "current"
  medications (e.g. `/api/stock`) must join through `Schedule`, not just read `Medication` —
  a medication whose only schedule was archived otherwise still looks live (caught in prompt 13).

### Fixed (was listed here as a gap through prompt 12)
- ~~One medication : one schedule row~~ — fixed in prompt 12. `PATCH /api/medications/:id`
  is the one edit path for name/dosage/compartment; `POST /api/medications/:id/schedules`
  adds another time to an existing medication instead of creating a duplicate row.

### Still-known gaps (deliberate, need their own prompt)
- **No auth** on any endpoint, including the six firmware ones — deferred at user request.
- **Monitor job runs `setInterval` in the web process** rather than an external scheduler —
  correct with multiple instances now (the advisory lock holds), just wasteful.

---

## 7. API Contract (must match ESP32 firmware)

| Endpoint | Method | Called by | Purpose |
|---|---|---|---|
| `/api/dispense-log` | POST | ESP32 | Log a confirmed dispense (IR sensor triggered) |
| `/api/confirm-taken` | POST | ESP32 | Log patient's push-button confirmation |
| `/api/schedule` | GET | ESP32 | Fetch current dosing schedule |
| `/api/stock-alert` | POST | ESP32 | Report low-stock reading from load cell |
| `/api/environment-log` | POST | ESP32 | Report temperature/humidity reading |
| `/api/device-heartbeat` | POST | ESP32 | Periodic "I'm alive" ping for device-status display |

Do not rename these without updating the firmware side — the agent should flag this
explicitly in the relevant prompt file if a rename is ever proposed.

### Dashboard-only endpoints (additive — firmware never calls these)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/dashboard` | GET | Aggregate for the home page: today's doses, adherence, active alerts, device status |
| `/api/schedule` | POST | Create a new medication + its first dose time |
| `/api/schedule/:id` | PATCH | Update a dose time's `time`/`frequency`/`dayOfWeek` **only** — not medication fields (prompt 12) |
| `/api/schedule/:id` | DELETE | Archives (not deletes) if dose history exists; otherwise hard-deletes, cleaning up an orphaned medication |
| `/api/medications` | GET | List medications, for the "add another time" picker |
| `/api/medications/:id` | PATCH | Edit name/dosage/compartment — the one true edit path, applies to every dose time at once |
| `/api/medications/:id/schedules` | POST | Add another dose time to an existing medication |
| `/api/history` | GET | Filterable, paginated dose history |
| `/api/alerts` | GET | Filterable, paginated alert list |
| `/api/alerts/:id` | PATCH | Resolve/reopen an alert (`{resolved: boolean}`) |
| `/api/stock` | GET | Current weight + depletion history per compartment |

Adding methods to `/api/schedule` is additive, not a rename — the firmware's `GET` shape is untouched.

### Response conventions (all `/api/*`)

Every route is wrapped in `withErrorHandling` (`src/lib/apiHandler.ts`) so responses are
**always JSON, never an HTML error page** — an ESP32 parsing JSON must never receive markup.

| Status | When |
|---|---|
| 200 / 201 / 204 | Success (201 on create, 204 on delete) |
| 400 | Zod validation failure — body carries `error.fieldErrors` |
| 404 | Well-formed id that doesn't exist |
| 409 | Refused for a business reason (e.g. deleting a dose with history) |
| 500 | Unexpected throw — generic `{"error":"Internal server error"}`; details are logged server-side only, never leaked to the device |

---

## 8. Dashboard Features

- **Home** — today's schedule, adherence %, quick alert banner, device online/offline status
- **Schedule** — CRUD for medications and their dose times/frequency
- **History** — filterable table of dispense/confirm/missed events
- **Stock** — current weight per compartment, low-stock badge, depletion trend chart
- **Alerts** — unified feed of missed doses, low stock, storage condition, device offline
- **Environment log** — temperature/humidity history with out-of-range highlighting

---

## 9. Coding Standards

- Strict TypeScript, no `any`.
- Functional components with hooks. Everything is a client component — there are no Server
  Components in this stack.
- All API route inputs validated with Zod before touching the database. Ids use `z.uuid()`
  (see Section 6 for why this is load-bearing, not cosmetic).
- One Drizzle client singleton (`src/lib/db.ts`) over a single `pg` `Pool` — never construct
  a Pool per request.
- Every route registered in `src/index.ts` must be wrapped in `withErrorHandling`.
- Multi-table writes go in `db.transaction()` (e.g. creating a Medication + Schedule together).
- Keep API response shapes stable — the frontend and the ESP32 both depend on them. Changing
  a shape is a flagged decision, not a detail.
- Commit messages reference the prompt number, e.g. `feat: schedule CRUD (prompt 06)`.

---

## 10. Prompt Log & Remaining Queue

Project setup (`00`) was done by hand, outside this workflow.

**Done** — each file carries its own verification results and deviations:

| # | Prompt | Outcome |
|---|---|---|
| 01 | `01-prisma-schema.md` | Prisma + SQLite schema. **Superseded by 05** — kept for the record |
| 02 | `02-api-routes.md` | All six Section 7 endpoints on Bun's native router (Express evaluated and rejected) |
| 03 | `03-api-error-handling.md` | `withErrorHandling` JSON boundary + 404s; fixed a 500-returns-HTML bug |
| 04 | `04-dashboard-home.md` | Home page + aggregate `/api/dashboard` |
| 05 | `05-drizzle-postgres-migration.md` | Prisma + SQLite → Drizzle + Postgres, response shapes unchanged |
| 06 | `06-schedule-crud.md` | Schedule CRUD + react-router; UI flows verified over CDP |
| 07 | `07-history-page.md` | Dose history: server-side filters + pagination |
| 08 | `08-outstanding-fixes.md` | Device persistence, archive-on-delete, weekly frequency, storage alerts, favicon |
| 09 | `09-missed-doses-and-alerts.md` | Monitor job: `MISSED` detection, `DEVICE_OFFLINE`, alert dedup (fixed a real race) |
| 10 | `10-alerts-page.md` | Alert centre + resolve action (unblocks low-stock re-alerting) |
| 11 | `11-monitor-hardening.md` | Timezone-aware "due today"/missed-dose logic (`APP_TIMEZONE`), overnight back-fill with a 14-day cap, single-runner via Postgres advisory lock (fixed a real lock-leak bug) |
| 12 | `12-multi-time-medications.md` | One medication, many dose times — `PATCH /api/medications/:id` is now the one true edit path; `PATCH /api/schedule/:id` narrowed to time fields only |
| 13 | `13-stock-page.md` | Stock page + first Recharts chart; added `StockLog` (append-only) since `StockLevel` overwrote in place and there was never any depletion history to plot |

**Deferred at user request**: authentication (device API key + dashboard access) — no auth on
any endpoint yet, including the six firmware ones. Slot in whenever it's wanted; not on the
numbered queue below until then.

**Remaining** — one at a time, approval each:

14. `14-environment-page.md` — temp/humidity history with out-of-range highlighting (Section 8, never built)
15. `15-polish.md` — responsive styling, empty/loading states

**Known follow-ups not yet queued**: no auth (above); the monitor job runs `setInterval` in
the web process rather than a proper external scheduler — safe now that the advisory lock
holds correctly (prompt 11), just wasteful with multiple instances.
