# 08 — Clear Outstanding Gaps

## Goal
Fix the real defects accumulated across prompts 01–07, so the app is correct before more pages are built on top of it.

> **Queue note**: missed-dose detection moves to `09`. It needs a periodic background job, as
> does the `DEVICE_OFFLINE` alert — grouping both there is cleaner than splitting the scheduler
> across two prompts.

## What's being fixed, and why each is a real defect

| # | Defect | Why it matters |
|---|---|---|
| 1 | Device last-seen lives in a module variable | Device shows "Offline / no heartbeat received yet" after every server restart, even with a healthy device. Breaks outright with >1 instance |
| 2 | A medication with dose history can never be removed | `DELETE` returns 409 forever. A caregiver whose patient stops a drug is stuck with it on the dashboard permanently |
| 3 | `frequency: "weekly"` is accepted but ignored | The dashboard shows every schedule as due today. A weekly dose is wrongly listed as due on all 7 days — actively misleading in a care context |
| 4 | Out-of-range storage readings raise no `Alert` | `/api/environment-log` computes `alert: true` and stores it, but nothing surfaces it. `STORAGE_CONDITION` alerts are in the schema and Section 8 promises them; none are ever created |
| 5 | No favicon | Broken-image icon in the tab since prompt 04 removed the template SVG |

## Files to create/modify
**Schema + migration**
- `src/db/schema.ts` — add `Device` table; add `Schedule.active`; add `Schedule.dayOfWeek`
- `drizzle/` — generated migration

**API**
- `src/api/deviceHeartbeat.ts` — persist to `Device`, drop the module variable
- `src/api/dashboard.ts` — read device status from DB; only list doses actually due today
- `src/api/schedule.ts` — `DELETE` archives when history exists; `GET` hides archived; accept `dayOfWeek`
- `src/api/environmentLog.ts` — create a `STORAGE_CONDITION` alert when out of range
- `src/lib/validators.ts` — `dayOfWeek` validation

**UI**
- `src/components/ScheduleForm.tsx` — day-of-week picker shown only when frequency is weekly
- `src/components/ScheduleTable.tsx` — show the day for weekly doses
- `src/pages/SchedulePage.tsx` — message wording for archive vs delete
- `src/index.html` — inline SVG favicon (data URI, no asset file to break again)

## Plan
1. **Schema**: `Device { id text PK default 'default', lastSeenAt timestamptz }`;
   `Schedule.active boolean not null default true`; `Schedule.dayOfWeek integer null` (0=Sun..6=Sat).
   Generate + apply migration.
2. **Heartbeat**: upsert the singleton `Device` row on POST. `isDeviceOnline()` reads it and
   applies the same 5-minute window. Survives restarts.
3. **Due-today logic** in `dashboard.ts`: a schedule is due today if `frequency === 'daily'`,
   **or** `frequency === 'weekly' && dayOfWeek === today`. Archived schedules excluded.
4. **Archive on delete**: if dose history exists → set `active = false`, return **200** with
   `{ archived: true }` instead of 409. No history → hard delete as now (plus orphan medication
   cleanup). `GET /api/schedule` returns only active rows, so the ESP32 stops dispensing an
   archived dose.
5. **Storage alerts**: when `alert` is true, also insert `Alert { type: STORAGE_CONDITION }`
   with the reading in the message.
6. **Weekly UI**: day dropdown appears only when frequency is `weekly`, required in that case;
   table shows e.g. `weekly · Mon`.
7. **Favicon**: inline `data:image/svg+xml` pill icon in `index.html`.
8. Verify each fix, including the restart-survival one that can only be proven by restarting.

## Assumptions
- **Single device, singleton `Device` row keyed `'default'`.** The firmware contract (Section 7)
  posts an empty heartbeat body with no device id, and adding a required one would break it.
  Accepting an optional `deviceId` later is additive.
- **Archiving is invisible to the caregiver as a concept** — the button still says "Delete", and
  the row disappears. The distinction is internal: history-bearing rows are hidden, not destroyed.
  Chosen over exposing an "Archive" vs "Delete" choice, which pushes a data-retention decision
  onto someone who shouldn't have to care.
- **No un-archive UI.** Rows can be restored via SQL if needed. A full archive-management screen
  is out of proportion to this fix; flagging rather than half-building it.
- **`dayOfWeek` is only meaningful when `frequency = 'weekly'`** and is nullable otherwise, rather
  than a separate table. Supports "every Tuesday", not "Mon+Thu" — multi-day would need a join
  table or array column, which isn't warranted yet.
- **Existing rows** get `active = true` and `dayOfWeek = null` by default, so current daily
  schedules keep behaving identically. No data migration needed.
- **Storage alerts are raised per out-of-range reading**, so a device reporting every minute
  while a room is hot will generate many alerts. Deduplication/cooldown needs a policy decision
  and is left for the alerts page (prompt 10).
- Environment thresholds stay the placeholder 15–30°C / 30–60% — still not sourced from real
  medication storage requirements, only now they're visible to the caregiver.

## Not fixed here (deliberate)
- **`MISSED` detection + `DEVICE_OFFLINE` alerts** → prompt 09, both need the same scheduler.
- **One medication : one schedule row.** Adding a second time for a drug still duplicates the
  medication. Fixing it properly is a form redesign ("medication with N times"), not a patch.
- **Timezone naivety** in history filters and "due today" — single-machine assumption, documented.
- **No auth** on any endpoint — unchanged from Section 7's contract.

## Verification
- **Restart survival**: POST a heartbeat → device Online; restart the server → **still Online**
  (this is the whole point of fix 1 and can't be proven without an actual restart).
- **Weekly**: create a weekly schedule for *tomorrow*'s weekday → absent from today's doses;
  one for *today*'s weekday → present. A daily one is always present.
- **Archive**: delete a medication **with** history → 200, disappears from the list, but its
  `DispenseLog` rows still exist in Postgres and its history still shows on `/history`.
- **Hard delete**: delete one **without** history → row and its orphan medication gone from the DB.
- **ESP32 view**: `GET /api/schedule` excludes archived rows.
- **Storage alert**: POST an out-of-range reading → a `STORAGE_CONDITION` alert appears on the
  home banner; an in-range one creates nothing.
- Favicon: `index.html` serves an icon, no 404 in the network log.
- All existing pages still work; no console errors.

## Results
| Fix | Verification | Result |
|---|---|---|
| 1. Device persistence | Heartbeat → Online → **server actually restarted** → still Online, same `lastSeenAt` | ✅ |
| 2. Archive on delete | Delete Metformin (has history) → `{"archived":true}` 200; gone from active list; **all 52 DispenseLog rows intact**; its 19 rows still on `/history` | ✅ |
| 2b. Hard delete | Delete a no-history schedule → 204, row *and* orphan medication removed from DB | ✅ |
| 3. Weekly frequency | Weekly-for-tomorrow **absent** from today's doses; weekly-for-today **present**; daily always present | ✅ |
| 3b. Weekly validation | `frequency=weekly` without a day → 400 "Pick a day for weekly doses" | ✅ |
| 4. Storage alerts | Out-of-range reading → `STORAGE_CONDITION` alert on the home banner; in-range → no alert created | ✅ |
| 5. Favicon | `rel="icon"` data-URI served in HTML, no asset file to break | ✅ |
| Regressions | All 3 routes + 3 dashboard APIs 200; all 4 firmware endpoints still 201/200; no console errors | ✅ |

UI verified over CDP: day picker is hidden for daily and appears for weekly with all 7 days;
schedule table renders `weekly · Wed`; archived medication is gone from the schedule page but
**still selectable in the history filter**.

## Two things found while verifying (not in the original plan)

**1. Archiving would have broken the history filter.** Hiding archived rows from
`GET /api/schedule` also removed them from the History page's medication dropdown — so an
archived drug's history was still listed but no longer filterable. Added an opt-in
`?includeArchived=1`, used only by the history page. The firmware's default call is unchanged
and still excludes archived doses.

**2. A pre-existing `weekly` row had no day — and my own fix would have silently hidden it.**
There was already a `weekly` schedule in the DB (created before `dayOfWeek` existed, so it
migrated in as `null`). The first version of `isDueToday` returned `dayOfWeek === today`, which
for `null` is never true: **that medication would have silently vanished from every day's
schedule.** The Assumptions above only reasoned about existing *daily* rows and missed this.

Fixed by failing open — a `weekly` row with no day is treated as due, matching its
pre-migration behaviour. Showing an extra dose is recoverable; silently hiding a medication in
a care app is not. New rows can't reach this state because validation now requires the pair.

## Still open (unchanged, deliberate)
- `MISSED` detection + `DEVICE_OFFLINE` alerts → **prompt 09** (shared scheduler).
- One medication : one schedule row — still duplicates on a second dose time.
- Storage alerts have no cooldown; a persistently hot room floods the alert list → prompt 10.
- Timezone naivety; no auth.
- **Data note:** the `metform` row (dosage `221`, weekly, no day) looks like manual UI testing.
  Left alone — it's your data, and it now displays correctly.

✅ Completed — All five defects fixed and verified, plus two follow-on issues caught during verification: the history-filter regression and a fail-closed weekly bug that would have hidden a medication.
