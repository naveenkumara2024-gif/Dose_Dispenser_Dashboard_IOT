# 11 — Monitor Hardening: Timezone, Back-fill, Single-Runner

## Goal
Make missed-dose detection correct when the server's timezone differs from the care location, when the server was down overnight, and when more than one instance is running.

> Auth deferred at your request — the queue is now 11 monitor hardening, 12 multi-time
> medications, 13 stock page. Auth slots in whenever you want it.

## Three defects, one subsystem

| # | Defect | Consequence |
|---|---|---|
| 1 | All "today"/"due now" logic uses the **server's** local timezone | Deploy the server anywhere but the patient's timezone and doses are evaluated against the wrong clock — a dose is marked missed hours early or late, or attributed to the wrong day |
| 2 | Misses are only evaluated for **today** | Server down overnight → yesterday's missed doses are never recorded. Adherence silently looks better than reality |
| 3 | The job runs on `setInterval` in every web process | Two instances both evaluate. The unique index stops duplicate rows, but both still do the work and race |

## Files to create/modify
- `src/lib/time.ts` (new) — timezone-aware date helpers
- `src/db/schema.ts` — `JobState` table (back-fill watermark)
- `drizzle/` — migration
- `src/jobs/monitor.ts` — evaluate a date range, use the zone helpers, take an advisory lock
- `src/api/dashboard.ts` — "due today" via the zone helpers
- `src/api/history.ts` — date filters resolved in the configured zone
- `.env` — `APP_TIMEZONE`
- `claude.md` — Section 4/6 notes

## Plan
1. `APP_TIMEZONE` env var (IANA name, e.g. `Asia/Kolkata`), defaulting to the system zone.
2. `src/lib/time.ts` using the built-in `Intl` API — no new dependency:
   - `todayInZone()` → `YYYY-MM-DD` as it reads at the care location
   - `weekdayInZone(date)` → 0–6
   - `minutesSinceMidnightInZone()` → current wall-clock position
   - `zonedDayBounds(dateStr)` → UTC instants for that local day, for range queries
3. `JobState { key text PK, value text }` holding `missedDoses.lastEvaluatedDate`.
4. Monitor evaluates **every date from the watermark to today** (capped, see assumptions):
   - for each date, each active schedule due on that weekday, created on or before that date
   - overdue if the date is past, or today and `now > scheduled + grace`
   - skip if already `CONFIRMED_TAKEN` or `MISSED` for that schedule on that date
   - advance the watermark only after a date is fully processed
5. Wrap the run in a Postgres advisory lock (`pg_try_advisory_lock`); if not acquired, another
   instance is running — skip this tick rather than duplicating work.
6. Point `dashboard.ts` and `history.ts` at the same helpers so all three agree on "today".

## Assumptions
- **One timezone for the whole system**, from `APP_TIMEZONE` — the device and caregiver are
  assumed co-located. Per-device timezones would need a column and a device identity story.
- **Back-fill is capped at 14 days.** A server down for a month shouldn't wake up and manufacture
  hundreds of alerts. Older gaps stay unrecorded; the watermark jumps forward.
- **Back-fill uses the schedule set as it exists now**, because that's all the schema retains —
  there's no history of what was scheduled last Tuesday. Guarded by `createdAt`, so a schedule
  added today is never back-filled into days before it existed. A schedule whose *time* was
  edited will be back-filled against its current time. Flagging as a real limitation:
  strictly correct back-fill would need schedule versioning.
- **Archived schedules are not back-filled.** Once a caregiver removes a medication, generating
  new missed-dose alerts for it would be noise.
- **Advisory lock is best-effort**, held only for the duration of a run. Right shape for this
  app; not a general distributed-scheduler.
- **Existing rows have no watermark**, so first run seeds it to today — no retroactive flood of
  alerts for the days this project was being built.
- `Intl` over a date library: this needs day boundaries and weekdays in a named zone, which
  `Intl.DateTimeFormat` already does correctly including DST.

## Verification
- With `APP_TIMEZONE` set to a zone ~12h from the server's, "due today" and the missed-dose
  decision follow the configured zone, not the server's.
- A dose overdue in the configured zone is marked; the same dose is not marked when the zone
  makes it still upcoming.
- Delete the watermark, set it to 3 days ago, insert a past-dated schedule → missed doses are
  recorded **for each of those days**, one per day, with `MISSED_DOSE` alerts.
- Re-run → no new rows (watermark advanced, dedup holds).
- A schedule created today is **not** back-filled to earlier days.
- Cap: watermark 60 days ago → only the last 14 days are evaluated.
- Two monitor runs in parallel → the second skips on the lock; still exactly one row per dose/day.
- History date filters return the same rows for a given local date as before, in the default zone.
- All pages/endpoints still work; no console errors.

## Results

**Timezone correctness — proven against the same physical server, config changed only:**

| Check | Result |
|---|---|
| Weekly-Thursday schedule, `APP_TIMEZONE=Asia/Kolkata` (Thu there) | Shown as due today ✅ |
| Same schedule, same server, `APP_TIMEZONE=America/Los_Angeles` (Wed there) | **Not** due — same code, same machine, different answer purely from config ✅ |
| 08:00 dose, LA local time ~12:06pm (well past + grace) | Marked `MISSED` ✅ |
| 05:00 dose, Kolkata local time ~00:39am (not yet due) | Not marked ✅ |
| 00:20 dose, Kolkata ~00:39am (19 min elapsed, inside 30 min grace) | Not marked ✅ |
| History `?from=X&to=X` for "today" in Kolkata | Returned rows whose *Kolkata-local* time was today, even though their raw UTC timestamp read as the previous calendar day — proves the filter resolves in the configured zone, not by UTC date ✅ |

**Back-fill:**

| Check | Result |
|---|---|
| Watermark forced 3 days back; pre-existing schedule (backdated `createdAt`) | 3 `MISSED` rows, one per day, watermark advanced to today ✅ |
| Same scenario, schedule created **today** | 0 rows for those earlier days — never back-filled before it existed ✅ |
| Re-run after back-fill | Row count unchanged — dedup holds across days ✅ |
| Watermark forced 60 days back | Capped: caught up to today in one 147ms run, not a 60-day scan ✅ |

**Single-runner (advisory lock):**

| Check | Result |
|---|---|
| 8 concurrent `runMonitorOnce()` calls | Exactly 1 ran, 7 skipped; exactly 1 `MISSED` row, 1 alert ✅ |
| 5 rounds × 6 concurrent calls (30 calls total) | Exactly 1 winner every round, 0 locks left held at the end ✅ |
| Immediately re-run after a burst | Acquires and runs — lock is genuinely released, not stuck ✅ |

## A real bug found during verification (not hypothetical)

The first implementation ran the lock acquire and the unlock through `db.execute()` on the
shared pool. **Postgres advisory locks are scoped to the session that acquired them**, and
`pg.Pool`'s auto-managed `query()` doesn't guarantee two calls land on the same physical
connection. Under the 8-concurrent-calls test, the winning run's lock and unlock landed on
different pooled connections — the unlock silently failed (Postgres returns `false`, unc
checked), and the lock stayed held on the original connection **indefinitely**, since idle
pool connections are kept alive for reuse, not closed.

Confirmed directly: `SELECT * FROM pg_locks WHERE locktype='advisory'` showed a lock still
held after every one of the 8 calls had resolved. A follow-up run failed to acquire it —
proving the monitor would have **silently stopped running forever** after the first time two
ticks genuinely overlapped, which single-instance `setInterval` guarantees will eventually
happen. Worse than the race it was built to prevent, and it would not have shown up in casual
testing (only appeared under real concurrency).

**Fixed** by checking out one dedicated client via `pool.connect()` for the lock, the work,
and the unlock, releasing it back to the pool only at the end — guaranteeing the lock and
its unlock share one session. Re-verified with the same 8-concurrent and 30-call stress
tests: 0 leaked locks, every subsequent run still acquires normally.

## Other note
`weekdayOfDate` was initially written to re-interpret the date string through the configured
timezone, which is wrong for a value that's already a local calendar date — in a zone ahead
of UTC (tested with Auckland, UTC+12) it silently returned the next day's weekday. Fixed to
compute the weekday directly from the calendar string, with no zone conversion. Caught by
testing against a zone with a large enough offset to actually expose the bug — a same/near-UTC
zone would not have.

## Cleanup
All `ZZ_*` test medications, schedules, dispense logs, and alerts removed after verification.
Your 4 real schedules (Metformin/metform, Amlodipine, WeeklyToday, Atorvastatin) are untouched.
`JobState` watermark reset via a clean restart under the real `.env` (`APP_TIMEZONE=Asia/Kolkata`).

✅ Completed — Timezone-aware "due today"/missed-dose logic (verified across actually different zones on the same server), overnight back-fill with a 14-day cap, and a single-runner guarantee via a Postgres advisory lock — which caught and fixed a genuine bug where the lock could leak and permanently disable the job.
