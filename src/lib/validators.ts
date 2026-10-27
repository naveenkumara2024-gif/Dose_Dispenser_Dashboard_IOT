import { z } from "zod";
import { todayInZone } from "./time";

// `eid` is the device's id for this dose event (prompt 22): a retried send carries the
// same eid and is stored once. Optional so older firmware keeps working.
const doseEventId = z.string().min(1).max(64).optional();

export const dispenseLogSchema = z.object({
  scheduleId: z.uuid(),
  eid: doseEventId,
});

export const confirmTakenSchema = z.object({
  scheduleId: z.uuid(),
  eid: doseEventId,
});

export const stockAlertSchema = z.object({
  compartmentNo: z.number().int().nonnegative(),
  weight: z.number().nonnegative(),
});

// Routine load-cell reading (prompt 19). `percent` is omitted until the wheel is calibrated.
export const stockReadingSchema = z.object({
  compartmentNo: z.number().int().nonnegative(),
  weight: z.number(),
  percent: z.number().min(0).max(100).optional(),
});

export const environmentLogSchema = z.object({
  temperature: z.number(),
  humidity: z.number(),
});

// Heartbeat body (prompt 20). Every field optional: an empty body is still a valid
// "I'm alive". `rtc` = the DS3231's time as UTC unix seconds.
export const deviceHeartbeatSchema = z.object({
  uptime: z.number().int().nonnegative().optional(),
  rssi: z.number().int().min(-127).max(0).optional(),
  rtc: z.number().int().positive().optional(),
});

export const DEVICE_EVENT_TYPES = [
  "PRESENCE_DETECTED",
  "NO_PRESENCE",
  "REMINDER",
  "SERVO_ROTATED",
  "PILL_DROP",
  "NO_DROP",
  "KNOCK",
  "SHAKE",
] as const;

export const deviceEventSchema = z.object({
  type: z.enum(DEVICE_EVENT_TYPES),
  detail: z.string().max(100).optional(),
});

// Sent by the firmware on tilt-sensor state change (prompt 16).
export const tiltEventSchema = z.object({
  tilted: z.boolean(),
});

export const SENSOR_RANGES = ["1h", "24h", "7d"] as const;

export const sensorsQuerySchema = z.object({
  range: z.enum(SENSOR_RANGES).default("24h"),
});

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// A medication's own fields — name/dosage live on ONE Medication row that all its
// schedules reference, so there's a single edit path (PATCH /api/medications/:id) and
// nothing to keep in sync (prompt 12). Compartment is per dose time (prompt 15).
const medicationFields = z.object({
  name: z.string().min(1, "Name is required"),
  dosage: z.string().min(1, "Dosage is required"),
});

export const COMPARTMENT_COUNT = 5;

// A single dose time. `dayOfWeek` only means something when frequency is "weekly".
// `endDate` is the last day (inclusive, APP_TIMEZONE) the dose is dispensed.
const timeFields = z.object({
  time: z.string().regex(TIME_PATTERN, "Time must be HH:mm"),
  frequency: z.enum(["daily", "weekly"]),
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  compartmentNo: z
    .number()
    .int()
    .min(1, `Compartment must be 1-${COMPARTMENT_COUNT}`)
    .max(COMPARTMENT_COUNT, `Compartment must be 1-${COMPARTMENT_COUNT}`),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .refine((d) => d >= todayInZone(), "End date can't be in the past")
    .nullable()
    .optional(),
});

// A weekly dose without a day would silently never be due, so require the pair together.
const requiresDayWhenWeekly = (data: {
  frequency?: "daily" | "weekly";
  dayOfWeek?: number | null;
}) => data.frequency !== "weekly" || typeof data.dayOfWeek === "number";

const dayRequiredError = {
  message: "Pick a day for weekly doses",
  path: ["dayOfWeek"],
};

// Creates a brand-new medication + its first dose time in one call.
export const scheduleCreateSchema = medicationFields
  .extend(timeFields.shape)
  .refine(requiresDayWhenWeekly, dayRequiredError);

// Adds another dose time to an EXISTING medication — no medication fields, because
// there's already exactly one Medication row and this isn't it.
export const scheduleTimeCreateSchema = timeFields.refine(
  requiresDayWhenWeekly,
  dayRequiredError,
);

// Edits a dose time only. Medication-field edits go through medicationUpdateSchema instead —
// PATCH /api/schedule/:id no longer accepts them (see prompt 12).
export const scheduleUpdateSchema = timeFields
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  })
  .refine(requiresDayWhenWeekly, dayRequiredError);

// Edits a medication's own fields — applies to every schedule that references it, because
// there's only one row to edit.
export const medicationUpdateSchema = medicationFields
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

export const alertQuerySchema = z.object({
  type: z
    .enum([
      "LOW_STOCK",
      "MISSED_DOSE",
      "STORAGE_CONDITION",
      "DEVICE_OFFLINE",
      "DEVICE_TILTED",
      "DISPENSE_FAILED",
    ])
    .optional(),
  resolved: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export const alertPatchSchema = z.object({
  resolved: z.boolean(),
});

export const historyQuerySchema = z.object({
  status: z.enum(["DISPENSED", "CONFIRMED_TAKEN", "MISSED"]).optional(),
  medicationId: z.uuid().optional(),
  // Kept as "YYYY-MM-DD" strings (not coerced to Date) so day boundaries can be resolved
  // in APP_TIMEZONE rather than the server's local zone — see src/lib/time.ts.
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
