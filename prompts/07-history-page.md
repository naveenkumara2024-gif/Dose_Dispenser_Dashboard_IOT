# 07 — Dose History Page

## Goal
A filterable, paginated table of dispense / confirm / missed events (AGENT.md Section 8, "History").

## ⚠ Nothing currently writes `MISSED`
`DispenseStatus` has three values, but only two are ever written: `/api/dispense-log` writes
`DISPENSED` and `/api/confirm-taken` writes `CONFIRMED_TAKEN`. **No code path produces `MISSED`.**

So the "Missed" filter will render, and correctly return zero rows, forever. That's not a bug
in this page — it's a missing feature elsewhere: something has to notice "this dose's time
passed and nobody confirmed it". That needs a periodic server-side check plus a decision about
the grace period, and it should also raise a `MISSED_DOSE` alert (also never currently created).

**Not building that here** — it's a background-job feature, not a table. Recommend it as
prompt 08. This page is written so it lights up automatically once `MISSED` rows exist.

## Files to create/modify
- `src/api/history.ts` (new) — `GET /api/history`
- `src/lib/validators.ts` — query-param schema
- `src/index.ts` — register the route
- `src/types/index.ts` — history types
- `src/components/DoseHistoryTable.tsx` (new)
- `src/components/HistoryFilters.tsx` (new)
- `src/pages/HistoryPage.tsx` (new)
- `src/components/Layout.tsx` — add "History" nav link
- `src/App.tsx` — add `/history` route

## Plan
1. `GET /api/history` with query params, all optional:
   - `status` — `DISPENSED | CONFIRMED_TAKEN | MISSED`
   - `medicationId` — uuid
   - `from` / `to` — ISO dates
   - `limit` (default 25, max 100) / `offset` (default 0)
   Returns `{ logs, total, limit, offset }`, newest first, each log joined to its schedule +
   medication so the table can show drug name and dose time without a second request.
2. Validate query params with Zod, coercing numbers/dates from strings; invalid params → 400.
3. `DoseHistoryTable` — timestamp, medication, dosage, scheduled time, status badge (reusing
   the colour language already used on the home page).
4. `HistoryFilters` — status dropdown, medication dropdown (populated from `/api/schedule`),
   from/to date inputs, and a Clear button.
5. `HistoryPage` — holds filter state, refetches on change, resets to page 0 when filters
   change, prev/next pagination showing "X–Y of Z".
6. Add the nav link and route.
7. Verify: API filter combinations by curl, then drive the real page over CDP.

## Assumptions
- **Server-side filtering and pagination**, not client-side. A dispenser logging several doses
  a day grows this table unbounded; fetching everything and filtering in the browser would
  quietly degrade. Costs more query code, but it's the correct shape.
- **Filter by medication, not by schedule.** A caregiver thinks "show me the Metformin
  history", not "schedule 3ed23b82…". Filtering joins through `Schedule.medicationId`.
- **`from`/`to` are inclusive whole days**, interpreted in the server's local timezone —
  `to` is expanded to the end of that day so picking the same date twice shows that day.
  Timezone handling is naive on purpose; a real deployment with the device and caregiver in
  different zones would need explicit handling, which the schema doesn't currently support.
- **Default view is unfiltered, newest first, 25 per page** — the "what just happened" view a
  caregiver most likely wants on open.
- Statuses keep the home page's colour language (green = taken, blue = dispensed, red =
  missed) so the two pages read consistently.
- No CSV export — not requested, and it'd be scope creep.

## Verification
- `GET /api/history` unfiltered → newest-first rows with medication joined, correct `total`.
- `?status=CONFIRMED_TAKEN` → only confirmed rows.
- `?medicationId=<id>` → only that medication's rows.
- `?from=&to=` covering a single day → only that day's rows; a range with no data → empty, `total: 0`.
- `?limit=2&offset=2` → correct slice, `total` unchanged.
- Bad params (`status=NOPE`, `limit=500`, malformed uuid) → 400, not 500.
- In the browser: filters change results, pagination moves between pages, clearing filters
  restores the full list, empty result shows an empty state rather than a blank table.
- Seed enough varied history first (multiple medications, statuses, and dates) that the
  filters are actually exercised — the DB currently has 2 log rows, which proves nothing.
- No console errors; home and schedule pages still work.

## Results
Seeded 50 varied logs first (3 medications, 10 days, all three statuses) so filters were
actually exercised rather than trivially passing on 2 rows.

API (curl):

| Check | Result |
|---|---|
| Unfiltered | 52 total, newest-first (verified descending), medication joined ✅ |
| `?status=CONFIRMED_TAKEN` | 11 rows, only that status ✅ |
| `?status=MISSED` | 10 rows, only that status ✅ |
| `?medicationId=` | 16 rows, single medication ✅ |
| Single-day `from=to=today` | 2 rows, only that date ✅ |
| 4-day range | 17 rows spanning exactly those 4 dates — both ends inclusive ✅ |
| Range with no data | `{"logs":[],"total":0}` ✅ |
| `limit=2&offset=0` vs `offset=2` | Different, non-overlapping slices; `total` stays 52 ✅ |
| `status=NOPE`, `limit=500`, `limit=0`, `offset=-1`, bad uuid | All **400** with field errors, no 500s ✅ |

UI (driven over CDP, not just screenshotted):

| Flow | Result |
|---|---|
| Default load | 25 rows, "1–25 of 52" ✅ |
| Status → Missed | 10 rows, all badges "Missed", range updates to "1–10 of 10" ✅ |
| Status → Taken | 11 rows, all "Taken" ✅ |
| Taken **+** Amlodipine | 3 rows, single medication + single status — filters compose ✅ |
| Clear | Back to 52, filters reset ✅ |
| Next / Previous | "26–50 of 52" then back to "1–25 of 52"; Previous disabled on page 1 ✅ |
| Filter with no matches | Table replaced by "No dose events match these filters.", range shows "No results" ✅ |
| Console errors | None ✅ |

Home and schedule pages re-checked afterwards — all routes and APIs 200.

## Note on the seeded `MISSED` rows
The 10 `MISSED` rows exist **only because the seed script inserted them directly**. No
application code path creates them, exactly as flagged at the top of this prompt. The filter
and red badge are proven to work; what's missing is the job that would generate such rows in
production.

✅ Completed — History page live at `/history`: server-side filtering by status/medication/date-range, 25-per-page pagination, empty state. All flows verified against the real UI.
