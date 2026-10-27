import { checkDeviceOffline } from "../jobs/monitor";
import { recordDeviceEvent } from "../services/deviceEvent";
import { recordDose } from "../services/dose";
import { recordEnvironment } from "../services/environment";
import {
  getLastHeartbeatAt,
  isDeviceOnline,
  recordHeartbeat,
  SOCKET_GRACE_MS,
} from "../services/heartbeat";
import { recordLowStock, recordStockReading } from "../services/stock";
import { recordTilt } from "../services/tilt";
import {
  clearDeviceSocket,
  deviceSocketState,
  invalidate,
  isWatched,
  publishToDashboards,
  sendToDevice,
  setDeviceSocket,
  setLive,
  type Socket,
} from "./hub";
import { deviceMessageSchema, type DeviceMessage } from "./protocol";
import { pushScheduleToDevice } from "./schedulePush";

// The device side of the socket (prompt 22). Every stored message goes through the same
// service as its REST endpoint, so the database can't tell which transport was used.

export async function openDevice(ws: Socket) {
  const previous = setDeviceSocket(ws);
  // One device: a reconnect can arrive before the old socket's close is noticed.
  if (previous && previous !== ws) previous.close(4000, "Replaced by a newer connection");

  console.log("[ws] device connected");
  publishToDashboards({ t: "device", online: true });
  try {
    await recordHeartbeat({});
    await pushScheduleToDevice();
    sendToDevice({ t: "watch", on: isWatched() });
  } catch (error) {
    console.error("[ws] device open failed:", error);
  }
}

async function route(message: DeviceMessage) {
  switch (message.t) {
    case "hello":
      console.log(`[ws] device hello: fw ${message.fw ?? "?"}, boot ${message.boot ?? "?"}`);
      return;
    case "hb":
      await recordHeartbeat(message);
      return;
    case "env":
      await recordEnvironment(message);
      return;
    case "stock":
      await recordStockReading(message);
      return;
    case "stock_low":
      await recordLowStock(message);
      return;
    case "tilt":
      await recordTilt(message);
      return;
    case "event":
      await recordDeviceEvent(message);
      return;
    case "dose": {
      const result = await recordDose(message);
      // No ack on a thrown error: the firmware then retries over HTTP with the same eid.
      sendToDevice(
        result.kind === "ok"
          ? { t: "dose_ack", eid: message.eid, ok: true }
          : { t: "dose_ack", eid: message.eid, ok: false, error: "Schedule not found" },
      );
      return;
    }
    case "live": {
      const { t: _type, ...telemetry } = message; // keep the envelope out of the snapshot
      setLive(telemetry); // memory only; never stored
      return;
    }
  }
}

export async function handleDeviceMessage(ws: Socket, raw: string) {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    ws.send(JSON.stringify({ t: "err", msg: "Invalid JSON" }));
    return;
  }

  const parsed = deviceMessageSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    ws.send(
      JSON.stringify({
        t: "err",
        msg: `Invalid message: ${issue ? `${issue.path.join(".") || "t"} ${issue.message}` : "unknown"}`,
      }),
    );
    return;
  }

  try {
    await route(parsed.data);
  } catch (error) {
    // Same rule as REST: details stay in the server log, the device gets a generic error.
    console.error(`[ws] device message ${parsed.data.t} failed:`, error);
    ws.send(JSON.stringify({ t: "err", msg: "Internal server error" }));
  }
}

export function closeDevice(ws: Socket) {
  // A replaced socket closing late must not mark the current device offline.
  if (!clearDeviceSocket(ws)) return;
  console.log("[ws] device disconnected");

  // Grace period: a quick reconnect (Wi-Fi blip, server reload) shouldn't flap the
  // dashboard or raise DEVICE_OFFLINE.
  setTimeout(async () => {
    if (deviceSocketState().connected) return;
    try {
      const lastSeenAt = await getLastHeartbeatAt();
      if (isDeviceOnline(lastSeenAt)) return; // alive over HTTP fallback
      publishToDashboards({ t: "device", online: false });
      invalidate(["sensors", "dashboard"]);
      await checkDeviceOffline();
    } catch (error) {
      console.error("[ws] offline check failed:", error);
    }
  }, SOCKET_GRACE_MS + 100);
}
