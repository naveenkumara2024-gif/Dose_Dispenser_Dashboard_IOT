import { z } from "zod";
import {
  confirmTakenSchema,
  deviceEventSchema,
  deviceHeartbeatSchema,
  environmentLogSchema,
  stockAlertSchema,
  stockReadingSchema,
  tiltEventSchema,
} from "../lib/validators";

// WebSocket protocol (prompt 22). Every message is JSON `{ "t": "<type>", ...payload }`.
// Device payloads reuse the REST validators, so a reading is accepted or rejected the
// same way whichever transport delivered it.

export const INVALIDATE_KEYS = [
  "dashboard",
  "sensors",
  "stock",
  "history",
  "alerts",
  "schedule",
] as const;
export type InvalidateKey = (typeof INVALIDATE_KEYS)[number];

export const DEVICE_STATES = [
  "IDLE",
  "WAIT_PRESENCE",
  "REMINDER",
  "DISPENSING",
  "WAIT_TAKEN",
  "RESULT",
] as const;

const bit = z.number().int().min(0).max(1);

// Live telemetry: streamed while a dashboard is watching, never stored.
export const liveTelemetrySchema = z.object({
  w: z.number().optional(), // weight, g
  pct: z.number().optional(), // % of full, once calibrated
  temp: z.number().optional(), // °C
  hum: z.number().optional(), // % RH
  pir: bit.optional(), // 1 = motion
  ir: bit.optional(), // 1 = beam blocked
  touch: bit.optional(), // 1 = pad touched
  tilt: bit.optional(), // 1 = tilted
  state: z.enum(DEVICE_STATES).optional(),
});
export type LiveTelemetry = z.infer<typeof liveTelemetrySchema>;

const msg = <T extends string, S extends z.ZodRawShape>(t: T, shape: S) =>
  z.object({ t: z.literal(t), ...shape });

export const deviceMessageSchema = z.discriminatedUnion("t", [
  msg("hello", { fw: z.string().max(32).optional(), boot: z.string().max(32).optional() }),
  msg("hb", deviceHeartbeatSchema.shape),
  msg("env", environmentLogSchema.shape),
  msg("stock", stockReadingSchema.shape),
  msg("stock_low", stockAlertSchema.shape),
  msg("tilt", tiltEventSchema.shape),
  msg("event", deviceEventSchema.shape),
  msg("dose", {
    status: z.enum(["DISPENSED", "CONFIRMED_TAKEN"]),
    scheduleId: confirmTakenSchema.shape.scheduleId,
    eid: z.string().min(1).max(64),
  }),
  msg("live", liveTelemetrySchema.shape),
]);
export type DeviceMessage = z.infer<typeof deviceMessageSchema>;

// Server → device
export type ToDevice =
  | { t: "schedule"; doses: unknown[] }
  | { t: "watch"; on: boolean }
  | { t: "dose_ack"; eid: string; ok: boolean; error?: string }
  | { t: "err"; msg: string };

// Last knock / heavy shaking, kept in memory so a tab opened afterwards still sees it.
export type Vibration = { type: "KNOCK" | "SHAKE"; at: string };

// Server → dashboard
export type ToDashboard =
  | {
      t: "hello";
      device: { online: boolean; lastSeenAt: string | null };
      live: (LiveTelemetry & { at: string }) | null;
      vibration: Vibration | null;
    }
  | { t: "vibration"; vibration: Vibration }
  | { t: "invalidate"; keys: InvalidateKey[] }
  | { t: "alert"; alert: unknown }
  | { t: "live"; live: LiveTelemetry & { at: string } }
  | { t: "device"; online: boolean };
