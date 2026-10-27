import { deviceEvent } from "../db/schema";
import { raiseAlert, resolveAlerts } from "../lib/alerts";
import { db } from "../lib/db";
import type { DEVICE_EVENT_TYPES } from "../lib/validators";
import { invalidate, noteVibration } from "../ws/hub";

// One row per sensor/actuator state change on the device — PIR, buzzer, servo, IR,
// vibration (prompt 20). Dose outcomes still go through the dose service.
export async function recordDeviceEvent(input: {
  type: (typeof DEVICE_EVENT_TYPES)[number];
  detail?: string;
}) {
  const { type, detail } = input;
  const [event] = await db
    .insert(deviceEvent)
    .values({ type, detail: detail ?? null })
    .returning();

  // A pill that didn't drop is a jam the caregiver must clear; the next successful
  // drop from the same compartment proves it's cleared.
  const dedupeKey = `DISPENSE_FAILED:${detail ?? "?"}`;
  let created = null;
  if (type === "NO_DROP") {
    created = await raiseAlert({
      type: "DISPENSE_FAILED",
      message: `Pill didn't drop${detail ? ` from ${detail}` : ""} — check the wheel for a jam`,
      dedupeKey,
    });
  } else if (type === "PILL_DROP") {
    await resolveAlerts(dedupeKey);
  }

  // Vibration is momentary, so it isn't an alert; open dashboards show it as it happens.
  if (type === "KNOCK" || type === "SHAKE") noteVibration(type);

  invalidate(["sensors"]);
  return { event: event!, alert: created };
}
