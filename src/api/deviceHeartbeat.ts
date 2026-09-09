import { eq } from "drizzle-orm";
import { device } from "../db/schema";
import { resolveAlerts } from "../lib/alerts";
import { db } from "../lib/db";

const DEVICE_ID = "default";
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

export async function getLastHeartbeatAt(): Promise<Date | null> {
  const [row] = await db
    .select({ lastSeenAt: device.lastSeenAt })
    .from(device)
    .where(eq(device.id, DEVICE_ID));
  return row?.lastSeenAt ?? null;
}

export function isDeviceOnline(lastSeenAt: Date | null): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - lastSeenAt.getTime() < ONLINE_WINDOW_MS;
}

export async function POST() {
  const now = new Date();

  await db
    .insert(device)
    .values({ id: DEVICE_ID, lastSeenAt: now })
    .onConflictDoUpdate({
      target: device.id,
      set: { lastSeenAt: now },
    });

  // The device is demonstrably back, so the offline condition has genuinely ended.
  await resolveAlerts("DEVICE_OFFLINE");

  return Response.json({ online: true, at: now.toISOString() });
}
