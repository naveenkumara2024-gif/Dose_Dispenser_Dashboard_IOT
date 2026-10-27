import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const dispenseStatus = pgEnum("DispenseStatus", [
  "DISPENSED",
  "CONFIRMED_TAKEN",
  "MISSED",
]);

export const alertType = pgEnum("AlertType", [
  "LOW_STOCK",
  "MISSED_DOSE",
  "STORAGE_CONDITION",
  "DEVICE_OFFLINE",
  "DEVICE_TILTED",
  "DISPENSE_FAILED",
]);

// Device-side happenings that aren't dose records (prompt 20) — one per sensor/actuator
// state change, so the dashboard can show each part of the device working.
export const deviceEventType = pgEnum("DeviceEventType", [
  "PRESENCE_DETECTED",
  "NO_PRESENCE",
  "REMINDER",
  "SERVO_ROTATED",
  "PILL_DROP",
  "NO_DROP",
  "KNOCK",
  "SHAKE",
]);

export const medication = pgTable("Medication", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  dosage: text("dosage").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

export const schedule = pgTable(
  "Schedule",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    medicationId: uuid("medicationId")
      .notNull()
      .references(() => medication.id),
    time: text("time").notNull(),
    frequency: text("frequency").notNull(),
    // Only meaningful when frequency = "weekly". 0 = Sunday .. 6 = Saturday.
    dayOfWeek: integer("dayOfWeek"),
    // Wheel compartment (1-5) holding this dose time's pills. Lives on the dose time, not
    // the medication: Metformin 08:00 and 20:00 sit in different compartments (prompt 15).
    compartmentNo: integer("compartmentNo").notNull(),
    // Last day (inclusive, APP_TIMEZONE) this dose is dispensed; null = no end.
    endDate: date("endDate", { mode: "string" }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One active dose time per compartment, enforced by the database rather than a
    // read-then-write check (same reasoning as the alert dedup index, prompt 09).
    // Archiving a dose (active = false) frees its compartment.
    uniqueIndex("Schedule_active_compartment_idx")
      .on(table.compartmentNo)
      .where(sql`${table.active} = true`),
  ],
);

// Small key/value store for job bookkeeping, e.g. how far missed-dose evaluation has got.
export const jobState = pgTable("JobState", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// Singleton row keyed "default": the firmware's heartbeat carries no device id.
export const device = pgTable("Device", {
  id: text("id").primaryKey().default("default"),
  lastSeenAt: timestamp("lastSeenAt", { withTimezone: true }).notNull().defaultNow(),
  // From the heartbeat body (prompt 20); null until a firmware that sends them checks in.
  rssi: integer("rssi"),
  uptimeS: integer("uptimeS"),
  // DS3231 time minus server time at the last heartbeat, in seconds.
  rtcDriftS: integer("rtcDriftS"),
});

export const deviceEvent = pgTable("DeviceEvent", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  type: deviceEventType("type").notNull(),
  detail: text("detail"),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

export const dispenseLog = pgTable(
  "DispenseLog",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    scheduleId: uuid("scheduleId")
      .notNull()
      .references(() => schedule.id),
    status: dispenseStatus("status").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
    // Device-assigned id ("<boot>-<counter>") for a dose event (prompt 22). The firmware
    // retries over HTTP when a WebSocket send isn't acked, so the same event can arrive
    // twice; the unique index makes the retry a no-op instead of a double count.
    // Null for rows written by the server itself (MISSED) or by older firmware.
    clientEventId: text("clientEventId"),
  },
  (table) => [uniqueIndex("DispenseLog_clientEventId_idx").on(table.clientEventId)],
);

export const stockLevel = pgTable("StockLevel", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  compartmentNo: integer("compartmentNo").notNull(),
  weight: doublePrecision("weight").notNull(),
  // % of a full wheel, computed on the device after its "f" calibration (prompt 19).
  // Null when the device isn't calibrated or the reading came from /api/stock-alert.
  percent: doublePrecision("percent"),
  lastUpdated: timestamp("lastUpdated", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Append-only reading history — StockLevel is upserted per compartment (current-value
// lookup only), so it can't answer "how has this compartment depleted over time". This
// table exists purely so the stock page has something to chart (prompt 13).
export const stockLog = pgTable("StockLog", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  compartmentNo: integer("compartmentNo").notNull(),
  weight: doublePrecision("weight").notNull(),
  percent: doublePrecision("percent"),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

export const environmentLog = pgTable("EnvironmentLog", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  temperature: doublePrecision("temperature").notNull(),
  humidity: doublePrecision("humidity").notNull(),
  alert: boolean("alert").notNull().default(false),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

// Tilt sensor state changes (prompt 16). The firmware posts on change only, so the latest
// row is the current orientation and the rows together are the event timeline.
export const tiltLog = pgTable("TiltLog", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tilted: boolean("tilted").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

export const alert = pgTable(
  "Alert",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    type: alertType("type").notNull(),
    message: text("message").notNull(),
    // Identifies the condition, so a repeating check can't raise the same alert twice
    // while it's still unresolved. e.g. "LOW_STOCK:1", "MISSED_DOSE:<id>:2026-09-09".
    dedupeKey: text("dedupeKey"),
    resolved: boolean("resolved").notNull().default(false),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Enforces dedup in the database. An application-level "check then insert" races:
    // two callers can both find nothing before either writes. Resolved rows are excluded
    // so the same condition can legitimately re-alert after being cleared.
    uniqueIndex("Alert_active_dedupeKey_idx")
      .on(table.dedupeKey)
      .where(sql`${table.resolved} = false`),
  ],
);

export const medicationRelations = relations(medication, ({ many }) => ({
  schedules: many(schedule),
}));

export const scheduleRelations = relations(schedule, ({ one, many }) => ({
  medication: one(medication, {
    fields: [schedule.medicationId],
    references: [medication.id],
  }),
  dispenseLogs: many(dispenseLog),
}));

export const dispenseLogRelations = relations(dispenseLog, ({ one }) => ({
  schedule: one(schedule, {
    fields: [dispenseLog.scheduleId],
    references: [schedule.id],
  }),
}));
