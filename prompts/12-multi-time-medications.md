# 12 — One Medication, Many Dose Times

## Goal
Let a medication have more than one dose time without duplicating the medication row, and make editing dosage/name/compartment apply to all its times at once.

## The actual bug, and the actual fix
The schema was never the problem — `Schedule.medicationId` has always allowed many schedules
per medication. The bug is that the **UI/API only ever offered one path**: the "add medication"
form always creates a brand-new `Medication` row alongside its `Schedule` row. There was no way
to add a second time to an *existing* medication, so the only option was re-entering its name/
dosage/compartment, which created a second `Medication` row that happened to share those values
by coincidence — not by reference. Editing one row's dosage never touched the other because,
structurally, they were never the same row.

Once there's a real "add another time to this medication" path, the duplication — and the stale
edits — disappear on their own, because there's only one `Medication` row for a drug to ever have.

## Files to create/modify
- `src/api/medications.ts` (new) — `GET /api/medications`, `PATCH /api/medications/:id`
- `src/api/schedule.ts` — add `POST /api/medications/:id/schedules`; narrow `PATCH /api/schedule/:id` to time/frequency/dayOfWeek only
- `src/lib/validators.ts` — `medicationUpdateSchema`, `scheduleTimeSchema` (time-only fields)
- `src/index.ts` — register the new routes
- `src/types/index.ts` — grouped-schedule types
- `src/components/ScheduleTable.tsx` — group rows by medication
- `src/components/ScheduleForm.tsx` — split into "add medication" vs "add another time"
- `src/components/MedicationEditForm.tsx` (new) — name/dosage/compartment, separate from time editing
- `src/pages/SchedulePage.tsx` — wire the new forms and grouped view

## Plan
1. `GET /api/medications` — list `{id, name, dosage, compartmentNo}`, for the "add a time to an
   existing medication" dropdown.
2. `PATCH /api/medications/:id` — updates name/dosage/compartmentNo on the `Medication` row
   directly. Since every one of its schedules references that same row, this is the one true
   edit path — no propagation logic needed, there's nothing to propagate to.
3. `POST /api/medications/:id/schedules` — `{ time, frequency, dayOfWeek }` → new `Schedule` row
   for that existing medication. 404 if the medication doesn't exist.
4. **Narrow `PATCH /api/schedule/:id`** to `time`/`frequency`/`dayOfWeek` only — medication-field
   edits move to step 2's endpoint. This is a contract change to a dashboard-only endpoint I
   built in prompt 06; the ESP32 doesn't call it, so it's safe to change directly rather than
   version it.
5. `ScheduleTable`: group by `medicationId` — one header row (name/dosage/compartment + an Edit
   button) with each of its times listed under it (time/frequency/day + Edit-time/Delete-time).
6. `ScheduleForm` splits into two entry points: "New medication" (today's form, unchanged) and
   "Add a time to an existing medication" (pick from the `/api/medications` dropdown + time/
   frequency/day only).
7. `MedicationEditForm`: small form for name/dosage/compartmentNo, opened from a group header.
8. Verify: add a second time to an existing medication, confirm one `Medication` row with two
   `Schedule` children; edit dosage once, confirm both times reflect it immediately.

## Assumptions
- **No UI to delete a whole medication in one click** — each time is deleted individually
  (existing per-schedule delete/archive logic already handles this correctly: the medication
  is auto-removed once it has zero schedules left, from prompt 06). A "delete medication and
  all its times" button is a small addition but wasn't asked for; flagging rather than adding
  scope.
- **`PATCH /api/schedule/:id` no longer accepts medication fields.** Checked: nothing else in
  this codebase calls it with those fields — only `SchedulePage.tsx`, which is being updated in
  the same prompt. Safe because this is dashboard-only (Section 7's firmware contract is just
  `GET /api/schedule`, untouched).
- **Compartment number is still per-medication, not per-time.** A medication occupies one
  compartment regardless of how many times it's dispensed — unchanged from the original schema,
  just confirming this multi-time change doesn't imply multi-compartment.
- **No limit on times per medication.** Two or twenty, the model doesn't care.

## Verification
- `POST /api/medications/:id/schedules` on an existing medication → new `Schedule` row, same
  `medicationId`, no new `Medication` row created.
- `GET /api/schedule` afterward shows **one** medication with **two** nested schedule entries
  (verified by `medicationId` match, not just by name).
- `PATCH /api/medications/:id` with a new dosage → **both** times now show the new dosage when
  re-fetched — proving there's structurally one row, not two kept in sync.
- `PATCH /api/schedule/:id` with a medication field (e.g. `name`) → 400, no longer accepted.
- Delete one time (no history) → medication keeps existing if its other time remains; deleting
  the last time removes the medication too (unchanged behavior, re-verified).
- Deleting one time that HAS history archives just that schedule; the sibling time keeps working.
- UI: add-time flow, edit-medication flow, and existing create/edit/delete-time flows all work
  end to end in a real browser; no console errors; home/history/alerts pages unaffected.

## Results

API (curl):

| Check | Result |
|---|---|
| `POST /api/medications/:id/schedules` on existing medication | New `Schedule` row, **same** `medicationId` — no new `Medication` row ✅ |
| `GET /api/schedule` after | One medication, two nested schedule entries, matching `medicationId` ✅ |
| `PATCH /api/medications/:id` (dosage) | **Both** times immediately show the new dosage — structurally one row, nothing to propagate ✅ |
| `PATCH /api/schedule/:id` with `name` | 400 "Unrecognized key" — no longer accepted ✅ |
| `PATCH /api/schedule/:id` with `time` | Still 200, works as before ✅ |
| Add-time to nonexistent medication | 404 ✅ |
| Add-time with malformed medication id | 400 ✅ |
| Add-time weekly with no day | 400 "Pick a day for weekly doses" ✅ |
| Delete one time (sibling remains, no history) | 204; medication survives with the other time intact ✅ |
| Delete last time (no history) | 204; medication removed too (unchanged from prompt 06) ✅ |
| Delete a time **with** history, sibling has none | Archived (`{"archived":true}`); sibling deleted hard; medication **survives** because the archived row still references it ✅ |

UI (driven over CDP):

| Flow | Result |
|---|---|
| Create medication via "Add a medication" | Appears as its own group ✅ |
| Add a second time via "Add a dose time" (medication dropdown) | Same group now shows **both** times (06:00 and 18:00) ✅ |
| Edit medication (dosage) via group header "Edit" | **Both** times reflect the new dosage in the same group ✅ |
| Edit one specific time | Form shows no medication picker in edit mode; only that time changes ✅ |
| Delete one time, sibling remains | Group stays, deleted time gone ✅ |
| Delete the last time | Whole group disappears ✅ |
| Console errors | None ✅ |

Regression: all 4 pages + 5 dashboard APIs 200, all 5 firmware endpoints 201/200, no server
errors.

## Note
`GET`/`PATCH /api/medications/:id` initially used a hand-rolled `z_isUuid` regex helper instead
of `z.uuid()` — same anti-pattern I'd already fixed once in `alerts.ts` during prompt 10.
Replaced before finishing; `z.uuid()` is now used consistently everywhere an id needs validating.

## Cleanup
All `ZZ_*` test medications, schedules, and their logs/alerts removed. Your 4 real medications
(metform, Amlodipine, WeeklyToday, Atorvastatin) are untouched.

✅ Completed — A medication can now have any number of dose times sharing one `Medication` row. Editing name/dosage/compartment updates every time at once, by construction, not by any sync logic — verified end to end via the real UI, not just the API.
