import { and, count, desc, eq, gte } from "drizzle-orm";
import { alert, dispenseLog, schedule as scheduleTable } from "../db/schema";
import { db } from "../lib/db";
import {
  minutesSinceMidnightInZone,
  todayInZone,
  weekdayOfDate,
  zonedDayBounds,
} from "../lib/time";
import { getLastHeartbeatAt, isDeviceOnline } from "../services/heartbeat";

const ADHERENCE_WINDOW_DAYS = 7;

// Daily doses are due every day; weekly ones only on their chosen weekday.
// A weekly row with no day is unconfigured (possible for rows predating the dayOfWeek
// column). Treat it as due rather than never-due: showing an extra dose is recoverable,
// silently hiding a medication is not.
function isDueToday(frequency: string, dayOfWeek: number | null): boolean {
  if (frequency === "weekly" && dayOfWeek !== null) {
    return dayOfWeek === weekdayOfDate(todayInZone());
  }
  return true;
}

export async function GET() {
  const todayStart = zonedDayBounds(todayInZone()).start;
  const windowStart = new Date(
    Date.now() - ADHERENCE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  const [
    schedules,
    todaysLogs,
    adherenceRows,
    activeAlerts,
    alertCountRows,
    lastSeenAt,
  ] = await Promise.all([
      db.query.schedule.findMany({
        where: eq(scheduleTable.active, true),
        with: { medication: true },
        orderBy: (schedule, { asc }) => [asc(schedule.time)],
      }),
      db
        .select({
          scheduleId: dispenseLog.scheduleId,
          status: dispenseLog.status,
        })
        .from(dispenseLog)
        .where(gte(dispenseLog.timestamp, todayStart)),
      db
        .select({
          status: dispenseLog.status,
          total: count(),
        })
        .from(dispenseLog)
        .where(gte(dispenseLog.timestamp, windowStart))
        .groupBy(dispenseLog.status),
      db
        .select()
        .from(alert)
        .where(eq(alert.resolved, false))
        .orderBy(desc(alert.createdAt))
        .limit(5),
      db.select({ total: count() }).from(alert).where(eq(alert.resolved, false)),
      getLastHeartbeatAt(),
    ]);

  const today = todayInZone();
  const todaysDoses = schedules
    .filter((schedule) => isDueToday(schedule.frequency, schedule.dayOfWeek))
    .filter((schedule) => schedule.endDate === null || schedule.endDate >= today)
    .map((schedule) => {
    const logs = todaysLogs.filter((log) => log.scheduleId === schedule.id);
    const confirmed = logs.find((log) => log.status === "CONFIRMED_TAKEN");
    const dispensed = logs.find((log) => log.status === "DISPENSED");
    const missed = logs.find((log) => log.status === "MISSED");

    return {
      scheduleId: schedule.id,
      time: schedule.time,
      frequency: schedule.frequency,
      medicationName: schedule.medication.name,
      dosage: schedule.medication.dosage,
      compartmentNo: schedule.compartmentNo,
      status: confirmed
        ? "CONFIRMED_TAKEN"
        : missed
          ? "MISSED"
          : dispensed
            ? "DISPENSED"
            : "PENDING",
    };
  });

  // Every compartment that currently holds a dose, whether or not it is due today - the
  // dashboard's wheel needs the loaded-but-idle ones (e.g. a weekly dose on another day).
  const compartments = schedules
    .filter((schedule) => schedule.endDate === null || schedule.endDate >= today)
    .map((schedule) => ({
      compartmentNo: schedule.compartmentNo,
      medicationName: schedule.medication.name,
      dosage: schedule.medication.dosage,
      time: schedule.time,
      dueToday: isDueToday(schedule.frequency, schedule.dayOfWeek),
    }));

  const statusTotal = (status: string) =>
    adherenceRows.find((row) => row.status === status)?.total ?? 0;

  const dispensedCount = statusTotal("DISPENSED");
  const confirmedCount = statusTotal("CONFIRMED_TAKEN");

  return Response.json({
    // Care-location clock (APP_TIMEZONE), so the "next drop in ..." countdown doesn't
    // depend on the caregiver's browser timezone.
    nowMinutes: minutesSinceMidnightInZone(),
    todaysDoses,
    compartments,
    adherence: {
      pct:
        dispensedCount > 0
          ? Math.round((confirmedCount / dispensedCount) * 100)
          : null,
      confirmed: confirmedCount,
      dispensed: dispensedCount,
      windowDays: ADHERENCE_WINDOW_DAYS,
    },
    activeAlerts,
    activeAlertCount: alertCountRows[0]?.total ?? 0,
    device: {
      online: isDeviceOnline(lastSeenAt),
      lastSeenAt: lastSeenAt ? lastSeenAt.toISOString() : null,
    },
  });
}
