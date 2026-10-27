import type { BunRequest } from "bun";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import {
  deviceEvent,
  dispenseLog,
  environmentLog,
  medication,
  schedule,
  stockLevel,
  tiltLog,
} from "../db/schema";
import { db } from "../lib/db";
import {
  isEnvironmentOutOfRange,
  isLowStock,
  LOW_STOCK_PCT,
  LOW_STOCK_THRESHOLD_G,
  RTC_DRIFT_WARN_S,
  SAFE_HUMIDITY_PCT,
  SAFE_TEMPERATURE_C,
  STALE_AFTER_MS,
} from "../lib/sensors";
import { sensorsQuerySchema } from "../lib/validators";
import { getDevice, isDeviceOnline } from "../services/heartbeat";

const RANGE_MS = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
} as const;
const MAX_CHART_POINTS = 500;
const TILT_EVENT_LIMIT = 20;
const ACTIVITY_LIMIT = 30;
// A knock / heavy shaking stays the tilt card's headline for this long.
const RECENT_VIBRATION_MS = 60_000;

type SensorStatus = "ok" | "warning" | "stale" | "offline" | "no_data";
type EventType = (typeof deviceEvent.type.enumValues)[number];
type LatestEvent = { type: EventType; detail: string | null; timestamp: Date };

type Sensor = {
  key: string;
  name: string;
  part: string;
  status: SensorStatus;
  lastValue: string | null;
  detail: string;
  lastSeenAt: Date | null;
};

function isStale(at: Date | null): boolean {
  return !!at && Date.now() - at.getTime() > STALE_AFTER_MS;
}

function newest(...dates: (Date | null | undefined)[]): Date | null {
  return dates.reduce<Date | null>((a, d) => (d && (!a || d > a) ? d : a), null);
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Latest dispense event of one status, with the medication it was for.
function latestDispense(status: "DISPENSED" | "CONFIRMED_TAKEN") {
  return db
    .select({
      timestamp: dispenseLog.timestamp,
      medicationName: medication.name,
      compartmentNo: schedule.compartmentNo,
    })
    .from(dispenseLog)
    .innerJoin(schedule, eq(dispenseLog.scheduleId, schedule.id))
    .innerJoin(medication, eq(schedule.medicationId, medication.id))
    .where(eq(dispenseLog.status, status))
    .orderBy(desc(dispenseLog.timestamp))
    .limit(1);
}

function countDispense(status: "DISPENSED" | "CONFIRMED_TAKEN", since: Date) {
  return db
    .select({ total: count() })
    .from(dispenseLog)
    .where(and(eq(dispenseLog.status, status), gte(dispenseLog.timestamp, since)));
}

export async function GET(req: BunRequest) {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = sensorsQuerySchema.safeParse(params);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { range } = parsed.data;
  const since = new Date(Date.now() - RANGE_MS[range]);

  const [
    deviceRow,
    [latestEnv],
    recentEnv,
    [envStats],
    tiltEvents,
    [loadCell],
    [lastDispensed],
    [lastConfirmed],
    [dispensedCount],
    [confirmedCount],
    latestEvents,
    eventCounts,
    activity,
  ] = await Promise.all([
    getDevice(),
    db.select().from(environmentLog).orderBy(desc(environmentLog.timestamp)).limit(1),
    // Newest N in range, reversed below so the chart reads oldest → newest.
    db
      .select({
        temperature: environmentLog.temperature,
        humidity: environmentLog.humidity,
        alert: environmentLog.alert,
        timestamp: environmentLog.timestamp,
      })
      .from(environmentLog)
      .where(gte(environmentLog.timestamp, since))
      .orderBy(desc(environmentLog.timestamp))
      .limit(MAX_CHART_POINTS),
    // Stats over the whole range in SQL, so they stay right past the chart's point cap.
    db
      .select({
        count: count(),
        outOfRange: sql<number>`count(*) filter (where ${environmentLog.alert})`.mapWith(Number),
        tempMin: sql<number | null>`min(${environmentLog.temperature})`,
        tempMax: sql<number | null>`max(${environmentLog.temperature})`,
        tempAvg: sql<number | null>`avg(${environmentLog.temperature})`.mapWith(Number),
        humMin: sql<number | null>`min(${environmentLog.humidity})`,
        humMax: sql<number | null>`max(${environmentLog.humidity})`,
        humAvg: sql<number | null>`avg(${environmentLog.humidity})`.mapWith(Number),
      })
      .from(environmentLog)
      .where(gte(environmentLog.timestamp, since)),
    db.select().from(tiltLog).orderBy(desc(tiltLog.timestamp)).limit(TILT_EVENT_LIMIT),
    // One load cell on the device (prompt 18): the newest reading is the current weight,
    // whatever compartmentNo it was posted with. Older rows are stale test data.
    db.select().from(stockLevel).orderBy(desc(stockLevel.lastUpdated)).limit(1),
    latestDispense("DISPENSED"),
    latestDispense("CONFIRMED_TAKEN"),
    countDispense("DISPENSED", since),
    countDispense("CONFIRMED_TAKEN", since),
    // Newest event of each type, regardless of range — "when did this part last act".
    db
      .selectDistinctOn([deviceEvent.type], {
        type: deviceEvent.type,
        detail: deviceEvent.detail,
        timestamp: deviceEvent.timestamp,
      })
      .from(deviceEvent)
      .orderBy(deviceEvent.type, desc(deviceEvent.timestamp)),
    db
      .select({ type: deviceEvent.type, total: count() })
      .from(deviceEvent)
      .where(gte(deviceEvent.timestamp, since))
      .groupBy(deviceEvent.type),
    db.select().from(deviceEvent).orderBy(desc(deviceEvent.timestamp)).limit(ACTIVITY_LIMIT),
  ]);

  const lastSeenAt = deviceRow?.lastSeenAt ?? null;
  const online = isDeviceOnline(lastSeenAt);
  const latestTilt = tiltEvents[0] ?? null;
  const loadCellLow = !!loadCell && isLowStock(loadCell.weight, loadCell.percent);

  const latestOf = (type: EventType): LatestEvent | null =>
    latestEvents.find((e) => e.type === type) ?? null;
  const countOf = (type: EventType): number =>
    eventCounts.find((e) => e.type === type)?.total ?? 0;
  // Newest of several event types, e.g. whichever of PILL_DROP / NO_DROP happened last.
  const latestAmong = (...types: EventType[]): LatestEvent | null =>
    types
      .map(latestOf)
      .reduce<LatestEvent | null>((a, e) => (e && (!a || e.timestamp > a.timestamp) ? e : a), null);

  const lastDrop = latestAmong("PILL_DROP", "NO_DROP");
  const lastPresence = latestAmong("PRESENCE_DETECTED", "NO_PRESENCE");
  const lastVibration = latestAmong("KNOCK", "SHAKE");
  const isRecent = (e: LatestEvent | null) =>
    !!e && Date.now() - e.timestamp.getTime() < RECENT_VIBRATION_MS;
  const recentShake = isRecent(latestOf("SHAKE"));
  const recentKnock = isRecent(latestOf("KNOCK"));
  const lastServo = latestOf("SERVO_ROTATED");
  const lastReminder = latestOf("REMINDER");
  const rtcDrift = deviceRow?.rtcDriftS ?? null;

  // Periodic sensors (DHT11, heartbeat, RTC via heartbeat) can go stale. Event sensors
  // only report when something happens, so silence there isn't a fault - but that only
  // holds while the device itself is online (see below).
  const measured: Sensor[] = [
    {
      key: "dht11",
      name: "Temperature & humidity",
      part: "DHT11",
      status: !latestEnv
        ? "no_data"
        : isStale(latestEnv.timestamp)
          ? "stale"
          : isEnvironmentOutOfRange(latestEnv.temperature, latestEnv.humidity)
            ? "warning"
            : "ok",
      lastValue: latestEnv
        ? `${latestEnv.temperature.toFixed(1)} °C · ${latestEnv.humidity.toFixed(0)} %`
        : null,
      detail: `Safe: ${SAFE_TEMPERATURE_C.min}–${SAFE_TEMPERATURE_C.max} °C, ${SAFE_HUMIDITY_PCT.min}–${SAFE_HUMIDITY_PCT.max} % RH`,
      lastSeenAt: latestEnv?.timestamp ?? null,
    },
    {
      key: "tilt",
      name: "Tilt & vibration",
      part: "SW-520D tilt / vibration",
      // Tilted wins (it lasts until set upright); otherwise a recent knock or heavy
      // shaking is the headline for a minute, so it isn't hidden behind "Upright".
      status: !latestTilt && !lastVibration
        ? "no_data"
        : latestTilt?.tilted || recentShake
          ? "warning"
          : "ok",
      lastValue: !latestTilt && !lastVibration
        ? null
        : latestTilt?.tilted
          ? "Tilted"
          : recentShake
            ? "Heavy shaking"
            : recentKnock
              ? "Knocked"
              : "Upright",
      detail: `${countOf("KNOCK")} knock(s), ${countOf("SHAKE")} shake(s) in last ${range}`,
      lastSeenAt: newest(latestTilt?.timestamp, lastVibration?.timestamp),
    },
    {
      key: "ir",
      name: "Pill drop detection",
      part: "TCRT5000 IR sensor",
      // A device event says exactly what the IR saw; fall back to dose logs for
      // readings sent before the firmware reported events.
      status: lastDrop
        ? lastDrop.type === "NO_DROP"
          ? "warning"
          : "ok"
        : lastDispensed
          ? "ok"
          : "no_data",
      lastValue: lastDrop
        ? `${lastDrop.type === "NO_DROP" ? "No pill seen" : "Pill seen"}${lastDrop.detail ? ` (${lastDrop.detail})` : ""}`
        : lastDispensed
          ? `Pill seen (C${lastDispensed.compartmentNo})`
          : null,
      detail: lastDrop
        ? `${countOf("PILL_DROP")} drop(s), ${countOf("NO_DROP")} failed in last ${range}`
        : `${dispensedCount?.total ?? 0} dispense(s) in last ${range}`,
      lastSeenAt: newest(lastDrop?.timestamp, lastDispensed?.timestamp),
    },
    {
      key: "touch",
      name: "Patient confirmation",
      part: "TTP223 touch pad",
      status: lastConfirmed ? "ok" : "no_data",
      lastValue: lastConfirmed ? `Confirmed ${lastConfirmed.medicationName}` : null,
      detail: `${confirmedCount?.total ?? 0} touch(es) in last ${range}`,
      lastSeenAt: lastConfirmed?.timestamp ?? null,
    },
    {
      key: "loadcell",
      name: "Pill weight",
      part: "Load cell + HX711",
      status: !loadCell ? "no_data" : loadCellLow ? "warning" : "ok",
      lastValue: loadCell
        ? `${loadCell.weight} g${loadCell.percent !== null ? ` · ${Math.round(loadCell.percent)}%` : ""}${loadCellLow ? " (low)" : ""}`
        : null,
      detail:
        loadCell?.percent != null
          ? `Low below ${LOW_STOCK_PCT}% of full`
          : `Low below ${LOW_STOCK_THRESHOLD_G} g (calibrate "f" for %)`,
      lastSeenAt: loadCell?.lastUpdated ?? null,
    },
    {
      key: "pir",
      name: "Patient presence",
      part: "PIR motion sensor",
      status: lastPresence ? "ok" : "no_data",
      lastValue: lastPresence
        ? lastPresence.type === "PRESENCE_DETECTED"
          ? "Patient detected"
          : "Nobody came"
        : null,
      detail: `${countOf("PRESENCE_DETECTED")} detected, ${countOf("NO_PRESENCE")} no-show(s) in last ${range}`,
      lastSeenAt: lastPresence?.timestamp ?? null,
    },
    {
      key: "servo",
      name: "Dispense wheel",
      part: "Servo motor",
      status: lastServo ? "ok" : "no_data",
      lastValue: lastServo ? `Turned to ${lastServo.detail ?? "compartment"}` : null,
      detail: `${countOf("SERVO_ROTATED")} rotation(s) in last ${range}`,
      lastSeenAt: lastServo?.timestamp ?? null,
    },
    {
      key: "buzzer",
      name: "Reminder alarm",
      part: "Buzzer + LED",
      status: lastReminder ? "ok" : "no_data",
      lastValue: lastReminder ? "Reminder sounded" : null,
      detail: `${countOf("REMINDER")} reminder(s) in last ${range}`,
      lastSeenAt: lastReminder?.timestamp ?? null,
    },
    {
      key: "rtc",
      name: "Real-time clock",
      part: "DS3231 RTC",
      status:
        rtcDrift === null
          ? "no_data"
          : !online
            ? "stale"
            : Math.abs(rtcDrift) > RTC_DRIFT_WARN_S
              ? "warning"
              : "ok",
      lastValue:
        rtcDrift === null
          ? null
          : Math.abs(rtcDrift) <= RTC_DRIFT_WARN_S
            ? `In sync (${rtcDrift >= 0 ? "+" : ""}${rtcDrift}s)`
            : `Off by ${Math.round(rtcDrift / 60)} min`,
      detail: `Compared with server time; Attention beyond ±${RTC_DRIFT_WARN_S}s`,
      lastSeenAt: rtcDrift === null ? null : lastSeenAt,
    },
    {
      key: "esp32",
      name: "Controller & WiFi",
      part: "ESP32",
      status: !lastSeenAt ? "no_data" : online ? "ok" : "stale",
      lastValue: lastSeenAt
        ? online
          ? `Online${deviceRow?.rssi != null ? ` · ${deviceRow.rssi} dBm` : ""}`
          : "Offline"
        : null,
      detail:
        deviceRow?.uptimeS != null && online
          ? `Up ${formatUptime(deviceRow.uptimeS)} · offline after 5 min of silence`
          : "Heartbeat; offline after 5 min of silence",
      lastSeenAt,
    },
  ];

  // Every sensor is read by the ESP32, so none can be called alive while the device is
  // offline. Without this the event sensors (tilt, IR, touch, load cell, PIR, servo, buzzer)
  // kept their last "ok" forever - a device dead for days still showed them all working.
  // The last known value and time are kept, so the UI can say "last reading ...".
  const sensors: Sensor[] = online
    ? measured
    : measured.map((s) => (s.status === "no_data" ? s : { ...s, status: "offline" }));

  return Response.json({
    range,
    generatedAt: new Date(),
    device: { online, lastSeenAt, rssi: deviceRow?.rssi ?? null },
    sensors,
    environment: {
      safeRange: { temperature: SAFE_TEMPERATURE_C, humidity: SAFE_HUMIDITY_PCT },
      latest: latestEnv ?? null,
      readings: recentEnv.reverse(),
      stats:
        envStats && envStats.count > 0
          ? {
              count: envStats.count,
              outOfRangeCount: envStats.outOfRange,
              temperature: { min: envStats.tempMin, max: envStats.tempMax, avg: envStats.tempAvg },
              humidity: { min: envStats.humMin, max: envStats.humMax, avg: envStats.humAvg },
            }
          : null,
    },
    tilt: {
      tilted: latestTilt?.tilted ?? null,
      events: tiltEvents,
    },
    loadCell: loadCell
      ? {
          weight: loadCell.weight,
          percent: loadCell.percent,
          lastUpdated: loadCell.lastUpdated,
          lowStock: loadCellLow,
        }
      : null,
    activity,
  });
}
