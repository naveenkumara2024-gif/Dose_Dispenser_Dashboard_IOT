# 14 — Hide completed doses from today's schedule

## Goal
Once a dose is taken or missed, drop it from the Home page's "Today's schedule" list for the rest of the day, while keeping the recurring dose time on the Schedule page.

## Files to create/modify
- `src/components/TodaySchedule.tsx` — split the list into upcoming vs done
- `claude.md` — Section 10: add this prompt, renumber the queue (environment page → 15, polish → 16)

## Plan
1. In `TodaySchedule`, split `doses` into **upcoming** (`PENDING`, `DISPENSED`) and **done** (`CONFIRMED_TAKEN`, `MISSED`).
2. Render only upcoming doses in the main list (same row markup and status badges as now).
3. Under the list, show a one-line summary, e.g. "2 done today (1 taken, 1 missed)", with a Show/Hide toggle that reveals the done rows (muted styling).
4. Empty states:
   - no doses due today at all → keep "No medications scheduled yet."
   - all of today's doses done → "All of today's doses are done." plus the summary line.
5. Update `claude.md` Section 10 (Done table + renumbered queue).

## Assumptions
- **UI-only change.** `GET /api/dashboard` keeps returning every one of today's doses with its status, so the response shape is unchanged. The adherence %, History page, ESP32 `GET /api/schedule` and Schedule page are untouched.
- `DISPENSED` (dropped but not yet confirmed) still counts as upcoming, since the patient may still press the button. It leaves the list once it becomes `CONFIRMED_TAKEN`, or `MISSED` via the monitor job 30 min after the due time.
- "Today" resets at midnight in `APP_TIMEZONE`, because the dashboard already only counts today's dispense logs. Daily doses reappear the next day with no extra code.
- The Show/Hide toggle state is local React state and isn't remembered across reloads.
- The number 14 was queued for the environment page; this request is inserted ahead of it.

## Verification
1. `bun run db:up` and `bun dev`, then open `http://localhost:3000`.
2. Add a temporary test medication with two dose times on the Schedule page.
3. `POST /api/dispense-log` then `POST /api/confirm-taken` for the first time's `scheduleId`. Reload Home: only the second dose is listed, the summary reads "1 done today (1 taken, 0 missed)", and Show reveals the taken row.
4. Confirm the second dose too: the list shows "All of today's doses are done."
5. Schedule page: both dose times still listed (not archived).
6. Delete the test medication afterwards. With dose history it will be archived, not deleted.
7. `bunx tsc --noEmit` passes.
