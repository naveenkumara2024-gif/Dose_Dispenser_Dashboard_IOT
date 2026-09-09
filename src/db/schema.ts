import { relations, sql } from "drizzle-orm";
import {
  boolean,
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
]);

export const medication = pgTable("Medication", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  dosage: text("dosage").notNull(),
  compartmentNo: integer("compartmentNo").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

export const schedule = pgTable("Schedule", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  medicationId: uuid("medicationId")
    .notNull()
    .references(() => medication.id),
  time: text("time").notNull(),
  frequency: text("frequency").notNull(),
  // Only meaningful when frequency = "weekly". 0 = Sunday .. 6 = Saturday.
  dayOfWeek: integer("dayOfWeek"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

// Small key/value store for job bookkeeping, e.g. how far missed-dose evaluation has got.
export const jobState = pgTable("JobState", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// Singleton row keyed "default": the firmware's heartbeat carries no device id.
export const device = pgTable("Device", {
  id: text("id").primaryKey().default("default"),
  lastSeenAt: timestamp("lastSeenAt", { withTimezone: true }).notNull().defaultNow(),
});

export const dispenseLog = pgTable("DispenseLog", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  scheduleId: uuid("scheduleId")
    .notNull()
    .references(() => schedule.id),
  status: dispenseStatus("status").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

export const stockLevel = pgTable("StockLevel", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  compartmentNo: integer("compartmentNo").notNull(),
  weight: doublePrecision("weight").notNull(),
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
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

export const environmentLog = pgTable("EnvironmentLog", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  temperature: doublePrecision("temperature").notNull(),
  humidity: doublePrecision("humidity").notNull(),
  alert: boolean("alert").notNull().default(false),
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
