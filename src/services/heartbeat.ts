import { eq } from "drizzle-orm";
import { device } from "../db/schema";
import { resolveAlerts } from "../lib/alerts";
import { db } from "../lib/db";
import { deviceSocketState, invalidate } from "../ws/hub";

const DEVICE_ID = "default";
// HTTP-only devices: online while a heartbeat arrived within this window.
const ONLINE_WINDOW_MS = 5 * 60 * 1000;
// Socket devices: a dropped socket counts as offline after this grace period, unless an
// HTTP heartbeat arrives after the drop (the firmware sends one at once when its socket
// goes down). Covers a quick reconnect without flapping the dashboard.
export const SOCKET_GRACE_MS = 20 * 1000;

export async function getDevice() {
  const [row] = await db.select().from(device).where(eq(device.id, DEVICE_ID));
  return row ?? null;
}

export async function getLastHeartbeatAt(): Promise<Date | null> {
  return (await getDevice())?.lastSeenAt ?? null;
}

export function isDeviceOnline(lastSeenAt: Date | null): boolean {
  const socket = deviceSocketState();
  if (socket.connected) return true;
  if (socket.closedAt !== undefined) {
    if (Date.now() - socket.closedAt < SOCKET_GRACE_MS) return true;
    // Since the socket dropped, only an HTTP heartbeat after the drop proves life.
    if (!lastSeenAt || lastSeenAt.getTime() <= socket.closedAt) return false;
  }
  return !!lastSeenAt && Date.now() - lastSeenAt.getTime() < ONLINE_WINDOW_MS;
}

// Shared by POST /api/device-heartbeat, the socket's `hb` message and socket connect.
export async function recordHeartbeat(stats: {
  uptime?: number;
  rssi?: number;
  rtc?: number;
}) {
  const now = new Date();
  const values = {
    rssi: stats.rssi,
    uptimeS: stats.uptime,
    rtcDriftS:
      stats.rtc !== undefined ? stats.rtc - Math.round(now.getTime() / 1000) : undefined,
  };

  await db
    .insert(device)
    .values({ id: DEVICE_ID, lastSeenAt: now, ...values })
    .onConflictDoUpdate({ target: device.id, set: { lastSeenAt: now, ...values } });

  // The device is demonstrably back, so the offline condition has genuinely ended.
  await resolveAlerts("DEVICE_OFFLINE");

  invalidate(["sensors", "dashboard"]);
  return now;
}
