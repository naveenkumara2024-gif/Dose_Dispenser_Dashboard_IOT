# 09 — Missed-Dose Detection, Device-Offline Alerts, Alert Deduplication

## Goal
Add the periodic job that marks overdue doses `MISSED` and raises `DEVICE_OFFLINE` alerts, plus alert deduplication so it can't flood the alert list.

## Why these three together
The job is what finally writes `MISSED` and `DEVICE_OFFLINE` — the two enum values nothing has
ever produced. But a job running every minute **must** have deduplication, or an offline device
generates 1,440 identical alerts a day. Dedup isn't a separate feature here; it's what makes the
job safe to run. It also retroactively fixes the storage-alert flooding flagged in prompt 08.

## Decision: 30-minute grace period
A dose is `MISSED` when its scheduled time passed **more than 30 minutes ago** and no
`CONFIRMED_TAKEN` exists for it today. Picked because it's long enough to absorb a normal delay
(elderly patient, slow morning) and short enough that a caregiver finds out the same morning.
**Change `MISSED_DOSE_GRACE_MINUTES` if you want it tighter or looser** — one constant.

`DISPENSED` but never confirmed still counts as missed: the pills came out, the patient didn't
press the button. That's the exact case a caregiver most needs to know about.

## Files to create/modify
- `src/db/schema.ts` — `Alert.dedupeKey text null`
- `drizzle/` — migration
- `src/jobs/monitor.ts` (new) — the periodic check
- `src/lib/alerts.ts` (new) — `raiseAlert()` with dedupe, `resolveAlerts()`
- `src/index.ts` — start the job
- `src/api/stockAlert.ts`, `src/api/environmentLog.ts` — route through `raiseAlert`
- `src/api/deviceHeartbeat.ts` — auto-resolve `DEVICE_OFFLINE` when the device returns

## Plan
1. Add `Alert.dedupeKey`; migrate.
2. `src/lib/alerts.ts`:
   - `raiseAlert({ type, message, dedupeKey })` — no-op if an **unresolved** alert with the same
     `dedupeKey` exists; otherwise insert.
   - `resolveAlerts(dedupeKey)` — mark matching unresolved alerts resolved.
   Dedupe keys: `LOW_STOCK:<compartment>`, `STORAGE_CONDITION`, `DEVICE_OFFLINE`,
   `MISSED_DOSE:<scheduleId>:<YYYY-MM-DD>`.
3. `src/jobs/monitor.ts`, run every 60s:
   - **Missed doses**: for each active schedule due today, if `now > scheduledTime + grace` and
     there's no `CONFIRMED_TAKEN` today and no `MISSED` already logged today → insert a `MISSED`
     `DispenseLog` and raise `MISSED_DOSE`.
   - **Device offline**: if last heartbeat is older than the 5-minute window → raise
     `DEVICE_OFFLINE`. Never raise it when no device has *ever* checked in — that's "not set up
     yet", not "went offline".
4. Heartbeat resolves the `DEVICE_OFFLINE` alert when the device comes back.
5. Start the job in `src/index.ts`, guarded so `bun --hot` reloads don't stack up timers.
6. Point the existing stock/storage alert paths at `raiseAlert`.

## Assumptions
- **The job lives in the web server process**, on `setInterval`. Right call for a single-instance
  coursework deployment; with multiple instances they'd each run it and race. A real deployment
  needs a single leader or an external scheduler — flagging rather than pretending otherwise.
- **Missed doses are only ever evaluated for today**, so a server offline overnight won't
  back-fill yesterday's misses. Back-filling would need a "last evaluated" watermark; out of scope.
- **Server-local timezone** throughout, consistent with existing "due today" logic (prompt 07/08).
- **`LOW_STOCK` dedupes per compartment and stays unresolved until a human resolves it.** So a
  refill won't auto-clear it — there's no resolve UI yet (that's the alerts page). Consequence:
  after refilling, no *new* low-stock alert appears for that compartment until the old one is
  resolved. Chosen over auto-resolving on weight increase, which would need a "what counts as
  refilled" threshold I'd be inventing.
- **`DEVICE_OFFLINE` auto-resolves** on the next heartbeat, since "is it online" is unambiguous —
  unlike stock, the system genuinely knows the condition has ended.
- **Weekly rows with no day** are treated as due (the fail-open from prompt 08), so they can be
  marked missed. Consistent with the dashboard.
- 60s interval is arbitrary but cheap; the queries are small and indexed by primary key.

## Verification
- Create a schedule timed **just over 30 min ago** → within ~60s a `MISSED` log and one
  `MISSED_DOSE` alert appear; it shows as "Missed" on the home page and in `/history`.
- A schedule **inside** the grace window → not marked (proves the grace period is real, not
  "anything in the past").
- A dose confirmed today → never marked missed.
- Let the job run several cycles → still exactly **one** `MISSED` log and **one** alert (this is
  the dedup test that matters).
- Stop heartbeats → `DEVICE_OFFLINE` raised once, not once per minute. Send a heartbeat → it
  auto-resolves and device shows Online.
- Fresh DB with no heartbeat ever → **no** `DEVICE_OFFLINE` alert.
- Two out-of-range storage readings in a row → one alert, not two.
- Two low-stock reports for the same compartment → one alert; a different compartment → its own.
- All existing pages/endpoints still work; no console errors.

## Results
| Check | Result |
|---|---|
| Dose 45 min overdue | Marked `MISSED` + one `MISSED_DOSE` alert ✅ |
| Dose 10 min overdue (inside grace) | **Not** marked — grace period is real ✅ |
| Dose confirmed today | Never marked missed ✅ |
| Repeat runs | Still exactly 1 log + 1 alert ✅ |
| **Interval timer** | Created an overdue dose, waited 65s with **no manual trigger** — job fired and marked it ✅ |
| No device ever seen | **No** `DEVICE_OFFLINE` alert ✅ |
| Stale device, 5 runs | Exactly 1 `DEVICE_OFFLINE` alert ✅ |
| Heartbeat after offline | Alert auto-resolved ✅ |
| 3× out-of-range storage readings | 1 alert ✅ |
| 2× low stock compartment 5, 1× compartment 6 | 1 alert each, per-compartment ✅ |
| Regression | All routes/APIs 200, all firmware endpoints 201/200, no job errors ✅ |
| End to end | `MISSED` now appears on the home page and in `/history` — the filter built in prompt 07 finally has real data ✅ |

## The dedup race — found during verification, and it was real

First implementation checked "does an unresolved alert exist?" then inserted. Verification
produced **2 `DEVICE_OFFLINE` alerts, 3 duplicated `MISSED_DOSE` alerts, and 3 duplicated
`MISSED` dose logs**. Re-running sequentially couldn't reproduce it, and an isolated concurrency
test passed — the check-then-insert window is just narrow, not absent.

Duplicate `MISSED` **logs are the serious half**: each one counts as another missed dose, so the
adherence percentage silently degrades. A "passed on retry" result would have shipped that.

**Fixed at the database, not in application code**: a partial unique index on `dedupeKey WHERE
resolved = false` makes duplicates impossible regardless of timing, with `onConflictDoNothing`.

Then, since the same race applies to the dose log, the monitor now **raises the alert first and
only writes the `MISSED` log if the alert was actually created** — the index becomes the mutex
for the whole operation. Re-verified with **8 concurrent monitor runs**: exactly 1 log, 1 alert,
and zero duplicates anywhere in the database.

A direct `(scheduleId, timestamp::date)` index would have been the more obvious fix, but Postgres
rejects it — casting `timestamptz` to `date` isn't `IMMUTABLE`, so it can't be indexed.

**Cleaned up** the 6 duplicate rows the buggy version created (kept one of each), and removed the
`ZZ_*` test medications afterwards. Your 4 real schedules are untouched.

## Still open (deliberate)
- **Job runs in the web process on `setInterval`.** Fine for one instance; multiple instances
  would each run it. The unique index now makes that *safe* (no duplicates), just wasteful.
- **No overnight back-fill** — misses are only evaluated for today.
- **`LOW_STOCK` won't re-alert after a refill until resolved** — needs the resolve UI (alerts page).
- **One medication : one schedule row**; timezone naivety; no auth.

✅ Completed — Missed-dose detection, device-offline alerting and alert deduplication live and verified, including a genuine concurrency bug caught and fixed at the database level.
