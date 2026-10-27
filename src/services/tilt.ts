import { tiltLog } from "../db/schema";
import { raiseAlert, resolveAlerts } from "../lib/alerts";
import { db } from "../lib/db";
import { invalidate } from "../ws/hub";

const DEDUPE_KEY = "DEVICE_TILTED";

// Tilt-sensor state change (prompt 16). Tilted raises an alert; back upright resolves
// it — the condition has genuinely ended, same as heartbeat/offline.
export async function recordTilt(input: { tilted: boolean }) {
  const { tilted } = input;
  const [log] = await db.insert(tiltLog).values({ tilted }).returning();

  let created = null;
  if (tilted) {
    created = await raiseAlert({
      type: "DEVICE_TILTED",
      message: "Dispenser tilted or knocked over — check the device",
      dedupeKey: DEDUPE_KEY,
    });
  } else {
    await resolveAlerts(DEDUPE_KEY);
  }

  invalidate(["sensors"]);
  return { tiltLog: log!, alert: created };
}
