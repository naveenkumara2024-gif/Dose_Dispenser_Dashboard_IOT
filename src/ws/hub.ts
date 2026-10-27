import type { Server, ServerWebSocket } from "bun";
import type { InvalidateKey, LiveTelemetry, ToDashboard, ToDevice, Vibration } from "./protocol";

// WebSocket hub (prompt 22): who is connected, and how to reach them. No app logic here,
// so anything (services, alerts, the monitor job) can publish without import cycles.

export type WsData = { role: "device" | "dashboard" };
export type Socket = ServerWebSocket<WsData>;

const DASHBOARD_TOPIC = "dashboard";
// A burst of writes (a dose touches history, dashboard and sensors) becomes one
// refetch per page: the first invalidation goes out at once, later ones within this
// window are merged and sent when it ends.
const COALESCE_MS = 200;

type HubState = {
  server: Server<WsData> | undefined;
  device: Socket | undefined;
  deviceClosedAt: number | undefined;
  dashboards: number;
  live: (LiveTelemetry & { at: string }) | null;
  vibration: Vibration | null;
  pendingKeys: Set<InvalidateKey>;
  flushTimer: ReturnType<typeof setTimeout> | undefined;
  lastFlushAt: number;
};

// `bun --hot` re-evaluates modules while sockets stay open; keep the registry on
// globalThis so a reload doesn't forget who is connected (same pattern as the monitor).
const g = globalThis as unknown as { __wsHub?: HubState };
const hub: HubState = (g.__wsHub ??= {
  server: undefined,
  device: undefined,
  deviceClosedAt: undefined,
  dashboards: 0,
  live: null,
  vibration: null,
  pendingKeys: new Set(),
  flushTimer: undefined,
  lastFlushAt: 0,
});

export function attachServer(server: Server<WsData>) {
  hub.server = server;
}

export function publishToDashboards(message: ToDashboard) {
  hub.server?.publish(DASHBOARD_TOPIC, JSON.stringify(message));
}

function flushInvalidations() {
  hub.flushTimer = undefined;
  if (hub.pendingKeys.size === 0) return;
  const keys = [...hub.pendingKeys];
  hub.pendingKeys.clear();
  hub.lastFlushAt = Date.now();
  publishToDashboards({ t: "invalidate", keys });
}

/** Tell dashboards which data changed; each page refetches its own endpoint. */
export function invalidate(keys: InvalidateKey[]) {
  for (const key of keys) hub.pendingKeys.add(key);
  if (hub.flushTimer) return;
  const wait = Math.max(0, hub.lastFlushAt + COALESCE_MS - Date.now());
  // wait = 0 still defers to the next tick, so several invalidate() calls made by one
  // request go out as a single message.
  hub.flushTimer = setTimeout(flushInvalidations, wait);
}

// ---------- device socket ----------

export function getDeviceSocket(): Socket | undefined {
  return hub.device;
}

/** Registers the device's socket; returns the one it replaced, if any. */
export function setDeviceSocket(ws: Socket): Socket | undefined {
  const previous = hub.device;
  hub.device = ws;
  hub.deviceClosedAt = undefined;
  // A new session starts a fresh snapshot; the last one's pin states would mislead.
  hub.live = null;
  return previous;
}

/** Clears the device slot if `ws` is still the current device. Returns whether it was. */
export function clearDeviceSocket(ws: Socket): boolean {
  if (hub.device !== ws) return false;
  hub.device = undefined;
  hub.deviceClosedAt = Date.now();
  return true;
}

export function deviceSocketState() {
  return { connected: hub.device !== undefined, closedAt: hub.deviceClosedAt };
}

export function sendToDevice(message: ToDevice): boolean {
  if (!hub.device) return false;
  // >0 sent, -1 queued behind backpressure (still delivered), 0 dropped.
  return hub.device.send(JSON.stringify(message)) !== 0;
}

// ---------- dashboards ----------

/** Adjusts the watcher count; returns true when it crossed zero (watch on/off changed). */
export function addDashboard(delta: 1 | -1): boolean {
  const before = hub.dashboards;
  hub.dashboards = Math.max(0, before + delta);
  return (before === 0) !== (hub.dashboards === 0);
}

export function isWatched(): boolean {
  return hub.dashboards > 0;
}

// ---------- live telemetry (memory only, never stored) ----------

export function setLive(live: LiveTelemetry) {
  // Merge, so a pin-change message carrying only `pir` doesn't blank the weight.
  hub.live = { ...(hub.live ?? {}), ...live, at: new Date().toISOString() };
  publishToDashboards({ t: "live", live: hub.live });
}

export function getLive() {
  return hub.live;
}

/** A knock or heavy shaking just happened: dashboards show it at once (toast + live tile). */
export function noteVibration(type: Vibration["type"]) {
  hub.vibration = { type, at: new Date().toISOString() };
  publishToDashboards({ t: "vibration", vibration: hub.vibration });
}

export function getVibration() {
  return hub.vibration;
}
