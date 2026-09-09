import { and, eq, gte, lte } from "drizzle-orm";
import { getLastHeartbeatAt, isDeviceOnline } from "../api/deviceHeartbeat";
import {
  dispenseLog,
  jobState,
  schedule as scheduleTable,
} from "../db/schema";
import { raiseAlert } from "../lib/alerts";
import { db, pgPool } from "../lib/db";
import {
  addDays,
  daysBetween,
  minutesSinceMidnightInZone,
  parseTimeToMinutes,
  todayInZone,
  weekdayOfDate,
  zonedDayBounds,
} from "../lib/time";

const CHECK_INTERVAL_MS = 60 * 1000;
const MISSED_DOSE_GRACE_MINUTES = 30;
const MAX_BACKFILL_DAYS = 14;
const WATERMARK_KEY = "missedDoses.lastEvaluatedDate";

// Arbitrary but fixed: identifies this job to Postgres' advisory lock registry.
const MONITOR_LOCK_ID = 8412_5501;

function isDueOn(
  dateStr: string,
  frequency: string,
  dayOfWeek: number | null,
): boolean {
  // Weekly with no day is unconfigured — treat as due (see prompt 08).
  if (frequency === "weekly" && dayOfWeek !== null) {
    return dayOfWeek === weekdayOfDate(dateStr);
  }
  return true;
}

async function getWatermark(today: string): Promise<string> {
  const [row] = await db
    .select()
    .from(jobState)
    .where(eq(jobState.key, WATERMARK_KEY));

  if (row) return row.value;

  // First ever run: start from today so historical days aren't retroactively flooded.
  await db
    .insert(jobState)
    .values({ key: WATERMARK_KEY, value: today })
    .onConflictDoNothing();

  return today;
}

async function setWatermark(value: string) {
  await db
    .insert(jobState)
    .values({ key: WATERMARK_KEY, value })
    .onConflictDoUpdate({ target: jobState.key, set: { value } });
}

async function evaluateDate(dateStr: string, today: string) {
  const isToday = dateStr === today;
  const nowMinutes = minutesSinceMidnightInZone();
  const { start, end } = zonedDayBounds(dateStr);

  const [schedules, logs] = await Promise.all([
    db.query.schedule.findMany({
      where: eq(scheduleTable.active, true),
      with: { medication: true },
    }),
    db
      .select({
        scheduleId: dispenseLog.scheduleId,
        status: dispenseLog.status,
      })
      .from(dispenseLog)
      .where(
        and(gte(dispenseLog.timestamp, start), lte(dispenseLog.timestamp, end)),
      ),
  ]);

  for (const schedule of schedules) {
    if (!isDueOn(dateStr, schedule.frequency, schedule.dayOfWeek)) continue;

    // Never invent a miss for a day before the schedule existed.
    if (todayInZone(schedule.createdAt) > dateStr) continue;

    const dueMinutes = parseTimeToMinutes(schedule.time);
    if (dueMinutes === null) continue;

    // Past days are fully elapsed; today's doses need the grace period to have passed.
    if (isToday && nowMinutes <= dueMinutes + MISSED_DOSE_GRACE_MINUTES) continue;

    const scheduleLogs = logs.filter((l) => l.scheduleId === schedule.id);
    if (scheduleLogs.some((l) => l.status === "CONFIRMED_TAKEN")) continue;
    if (scheduleLogs.some((l) => l.status === "MISSED")) continue;

    // The alert's partial unique index is the atomic guard; only log the miss if the
    // alert was actually created, so concurrent runs can't double-count (prompt 09).
    const raised = await raiseAlert({
      type: "MISSED_DOSE",
      message: `Missed dose: ${schedule.medication.name} ${schedule.medication.dosage} at ${schedule.time}`,
      dedupeKey: `MISSED_DOSE:${schedule.id}:${dateStr}`,
    });

    if (!raised) continue;

    await db.insert(dispenseLog).values({
      scheduleId: schedule.id,
      status: "MISSED",
      // Stamp the miss inside the day it belongs to, not "now".
      timestamp: isToday ? new Date() : end,
    });
  }
}

async function checkMissedDoses() {
  const today = todayInZone();
  const watermark = await getWatermark(today);

  const gap = daysBetween(watermark, today);
  const from =
    gap > MAX_BACKFILL_DAYS ? addDays(today, -MAX_BACKFILL_DAYS) : watermark;

  for (let date = from; daysBetween(date, today) >= 0; date = addDays(date, 1)) {
    await evaluateDate(date, today);
    // Only advance past a day once it's complete, so today is re-checked next tick.
    if (date !== today) await setWatermark(addDays(date, 1));
  }
}

async function checkDeviceOffline() {
  const lastSeenAt = await getLastHeartbeatAt();

  // Never checked in at all means "not set up yet", not "went offline".
  if (!lastSeenAt || isDeviceOnline(lastSeenAt)) return;

  await raiseAlert({
    type: "DEVICE_OFFLINE",
    message: `Device has not checked in since ${lastSeenAt.toLocaleString()}`,
    dedupeKey: "DEVICE_OFFLINE",
  });
}

export async function runMonitorOnce() {
  // Only one instance should evaluate at a time. Not a general scheduler — just enough
  // that two web processes don't both do the work.
  //
  // The lock and unlock MUST run on the same physical connection: pg_try_advisory_lock
  // is scoped to the session that acquired it. Using the pool's auto-managed db.execute()
  // for both calls doesn't guarantee that — under real concurrency they can land on
  // different pooled connections, which silently orphans the lock on whichever connection
  // acquired it. That connection then sits in the pool holding the lock indefinitely
  // (idle clients are kept alive for reuse, not closed), permanently blocking every future
  // run — including the same process's own next tick. Checking out one dedicated client
  // for the whole critical section is what actually guarantees "same session".
  const client = await pgPool.connect();
  try {
    const { rows } = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS acquired",
      [MONITOR_LOCK_ID],
    );
    if (!rows[0]?.acquired) return false;

    try {
      await checkMissedDoses();
      await checkDeviceOffline();
      return true;
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [MONITOR_LOCK_ID]);
    }
  } finally {
    client.release();
  }
}

const globalForMonitor = globalThis as unknown as {
  monitorTimer: ReturnType<typeof setInterval> | undefined;
};

export function startMonitor() {
  // `bun --hot` re-evaluates this module, so clear any timer from the previous version.
  if (globalForMonitor.monitorTimer) clearInterval(globalForMonitor.monitorTimer);

  const tick = () =>
    runMonitorOnce().catch((error) => {
      console.error("monitor job failed:", error);
    });

  globalForMonitor.monitorTimer = setInterval(tick, CHECK_INTERVAL_MS);
  tick();
}
