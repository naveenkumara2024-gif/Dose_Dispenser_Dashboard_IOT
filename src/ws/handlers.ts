import type { WebSocketHandler } from "bun";
import { getLastHeartbeatAt, isDeviceOnline } from "../services/heartbeat";
import { closeDevice, handleDeviceMessage, openDevice } from "./deviceRouter";
import {
  addDashboard,
  getLive,
  getVibration,
  isWatched,
  sendToDevice,
  type Socket,
  type WsData,
} from "./hub";
import type { ToDashboard } from "./protocol";

// Bun WebSocket handlers for /ws (prompt 22), dispatched by the role chosen at upgrade.

async function openDashboard(ws: Socket) {
  ws.subscribe("dashboard");
  // Live telemetry only streams while someone is watching.
  if (addDashboard(1)) sendToDevice({ t: "watch", on: isWatched() });

  try {
    const lastSeenAt = await getLastHeartbeatAt();
    const hello: ToDashboard = {
      t: "hello",
      device: { online: isDeviceOnline(lastSeenAt), lastSeenAt: lastSeenAt?.toISOString() ?? null },
      live: getLive(),
      vibration: getVibration(),
    };
    ws.send(JSON.stringify(hello));
  } catch (error) {
    console.error("[ws] dashboard hello failed:", error);
  }
}

export const websocket: WebSocketHandler<WsData> = {
  // Largest legitimate message is a schedule push (~6 KB for 16 doses).
  maxPayloadLength: 64 * 1024,

  open(ws: Socket) {
    if (ws.data.role === "device") void openDevice(ws);
    else void openDashboard(ws);
  },

  message(ws: Socket, message: string | Buffer) {
    const text = typeof message === "string" ? message : message.toString();
    if (ws.data.role === "device") {
      void handleDeviceMessage(ws, text);
      return;
    }
    // Dashboards only listen for now; device controls would arrive here.
    ws.send(JSON.stringify({ t: "err", msg: "Dashboards don't send messages" }));
  },

  close(ws: Socket) {
    if (ws.data.role === "device") {
      closeDevice(ws);
      return;
    }
    if (addDashboard(-1)) sendToDevice({ t: "watch", on: isWatched() });
  },
};
