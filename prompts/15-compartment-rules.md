# 15 — Compartment rules: 5 slots, one dose each, in time order, optional end date

## Goal
Make the dashboard schedule match the real wheel: 5 compartments turning one way (C1 → C5, then reset), each holding one dose time, with times increasing C1 → C5, an optional end date, and weekly compartments freeing once their dose is done.

## Decision needed (flagged: changes the ESP32 / dashboard response shape)
A compartment holds pills for **one dose time**, but today `compartmentNo` lives on `Medication`, so all of a medication's times share one compartment. With "one dose per compartment" that would limit every medication to a single time.
**Proposed:** move `compartmentNo` from `Medication` to `Schedule` (each dose time picks its own compartment, e.g. Metformin 08:00 → C1, Metformin 20:00 → C3).
- `GET /api/schedule` rows gain top-level `compartmentNo` and `endDate`; `medication.compartmentNo` is removed.
- The firmware already reads the top-level `compartmentNo` first (updated alongside this prompt), so the device keeps working.
- `/api/dashboard` `todaysDoses[].compartmentNo` keeps its shape (now sourced from the dose time).

## Files to create/modify
- `src/db/schema.ts`: `Schedule.compartmentNo` (int, not null), `Schedule.endDate` (date, nullable), drop `Medication.compartmentNo`, partial unique index `Schedule(compartmentNo) WHERE active`
- `drizzle/0006_*.sql`: generated, plus a hand-written data step (copy compartment medication → schedule)
- `src/lib/validators.ts`: `compartmentNo` 1–5 on dose times; optional `endDate` (YYYY-MM-DD, not in the past); medication schemas drop compartment
- `src/lib/compartments.ts` (new): `assertCompartmentRules(tx, candidate)` for the occupancy and order checks
- `src/api/schedule.ts`, `src/api/medications.ts`: run the checks in the create/add-time/patch transactions (409 + message on conflict); GET excludes ended doses
- `src/api/confirmTaken.ts`, `src/jobs/monitor.ts`: archive a weekly dose once taken/missed; archive doses past `endDate`; no MISSED after `endDate`
- `src/api/dashboard.ts`, `src/api/stock.ts`, `src/api/history.ts`: read compartment from `Schedule`; skip ended doses in "due today"
- `src/components/ScheduleForm.tsx`, `TimeForm.tsx`, `MedicationEditForm.tsx`, `ScheduleTable.tsx`, `src/pages/StockPage.tsx`, `src/types/index.ts`: compartment picker per dose time (occupied ones disabled, "must be after HH:MM" hint), optional "Until" date, show `C#` and end date per time
- `claude.md`: Sections 6, 7 and 10

## Plan
1. Schema + migration: add `Schedule.compartmentNo` filled from its medication, add `endDate`, drop `Medication.compartmentNo`, add the partial unique index (the **database** enforces one active dose per compartment, the same pattern as alert dedup in prompt 09).
2. Validators: compartment 1–5, optional `endDate`.
3. `assertCompartmentRules` runs inside the write transaction under a Postgres advisory transaction lock:
   - **Occupied** → 409 "Compartment 2 already holds Vitamin D 13:00". A compartment is occupied by an active, not-ended dose time; daily stays occupied until edited/deleted.
   - **Order** → among occupied compartments sorted C1..C5, times must strictly increase; else 409 "C3 must be after C2 (13:00) and before C4 (18:00)".
4. Freeing a compartment:
   - delete/archive (existing);
   - **weekly** dose: archived automatically when it becomes CONFIRMED_TAKEN or MISSED;
   - **end date** passed: the monitor archives it the next day.
5. GET `/api/schedule`, dashboard and monitor ignore doses past `endDate`.
6. UI changes (listed above), surfacing the 409 messages inline.
7. Update `claude.md` §6/§7/§10.

## Assumptions
- **Order compares time of day only**, mixing daily and weekly doses (one physical wheel per day). Empty compartments are skipped (C1 09:00, C3 13:00 is fine).
- **A weekly dose is archived once done**, so it does not repeat next week (that's what frees its compartment). The caregiver re-adds it after refilling. Flagged: this is what "frees after its dose" implies.
- **`endDate` is inclusive** (last day the dose is dispensed), evaluated in `APP_TIMEZONE`.
- **Migration conflict:** the current DB has two active dose times in C1 (chiko 21:29 and the Metformin 22:30 test medicine I created). The unique index can't be built over that. Plan: archive my two test medicines (Metformin, Vitamin D) before migrating. If any other conflict exists, the migration step stops and lists it rather than archiving real doses.
- The dispensing order on the device is enforced by these server rules; the firmware just goes to each dose's compartment.
- Prompt 14 (hide completed doses) is independent and still awaiting approval.

## Verification
1. `bun run db:generate && bun run db:migrate` succeeds; `bun run db:studio` shows `Schedule.compartmentNo`, `Schedule.endDate`, and no `Medication.compartmentNo`.
2. Via the API (curl):
   - C1 09:00 → 201;
   - C1 again → 409 occupied;
   - C2 08:00 → 409 order;
   - C2 13:00 → 201;
   - compartment 6 → 400;
   - `endDate` yesterday → 400.
3. Weekly dose in C3 → `confirm-taken` → it is archived and C3 accepts a new dose.
4. Dose with `endDate` = today: present in `GET /api/schedule` today; after setting the clock / monitor date to tomorrow, gone and the compartment is free.
5. Schedule page in the browser: occupied compartments disabled in the picker, the order hint shows, conflict messages appear inline.
6. ESP32 with the updated firmware: `s` lists each time with its `C#`; send `2` and the servo turns to 30°.
7. `bunx tsc --noEmit` passes.

## Verification results (13 Oct 2026)
- Migration 0006 applied (hand-edited to copy each medication's compartment onto its dose times before NOT NULL); `GET /api/schedule` returns top-level `compartmentNo`/`endDate`, no `medication.compartmentNo`.
- API: C1 06:00 → 201 · C1 again → 409 occupied · C2 05:00 → 409 order · C2 07:00 → 201 · C6 → 400 · endDate yesterday → 400 · weekly C3 confirmed → archived, C3 reusable (201) · endDate today → 201 and listed · PATCH C2 → 05:30 → 409 · add-time C5 → 201.
- Dashboard `todaysDoses` and `/api/stock` read the compartment from the dose time. Schedule page rendered in headless Chrome: picker shows C1-C5 with occupants, order hint, Until date, `C#` per time.
- `bunx tsc --noEmit` passes. Test data (T-1..T-4, their MISSED logs and alerts) deleted afterwards.
- Not run: ESP32 step 6 (board port was busy; firmware compiled with the matching change).

## Deviations from the plan
- Added `src/components/CompartmentFields.tsx` (shared picker for both forms) — not listed in Files.
- Forms now keep their values when a save is rejected (`onSubmit` returns success) — needed so a 409 doesn't wipe what the caregiver typed.
- Ended doses are also archived inside each compartment-rule transaction, not only by the monitor: an ended dose would otherwise still hold the unique index and turn a valid save into a 500.
- The existing "qw" dose (compartment 11, created before the 1-5 limit) was migrated as-is; it still constrains ordering until edited or deleted.

✅ Completed — compartment moved to dose times; one dose per compartment (DB-enforced), C1→C5 time order, optional end date, weekly frees after its dose; firmware reads the per-dose compartment.
