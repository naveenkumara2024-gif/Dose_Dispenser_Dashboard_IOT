// Measures real-time latency end to end (prompt 22):
//   live   device `live` message → dashboard receives it         (socket hop only, nothing stored)
//   event  device `event` message → dashboard `invalidate`        (incl. DB write + alert logic)
//   fetch  … → dashboard has refetched /api/sensors               (what the user actually sees)
//
//   bun scripts/ws-latency.ts [baseUrl]      default http://localhost:3000
//
// Writes DeviceEvent rows tagged detail="latency-test" and deletes them at the end.
// Note: it briefly takes the device socket slot, so a real device connected over the
// socket is replaced for the duration (it reconnects on its own).
import { and, eq, gte } from "drizzle-orm";
import { alert, device, deviceEvent } from "../src/db/schema";
import { db, pgPool } from "../src/lib/db";

const BASE = process.argv[2] ?? "http://localhost:3000";
const WS = BASE.replace(/^http/, "ws") + "/ws";
const LIVE_N = 100;
const EVENT_N = 30;
// > the hub's 200 ms coalescing window, so each event is measured on its own.
const EVENT_SPACING_MS = 250;
const TAG = "latency-test";

type Msg = { t: string; [k: string]: unknown };

function open(role: "device" | "dashboard"): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS}?role=${role}`);
    ws.onopen = () => resolve(ws);
    ws.onerror = () => reject(new Error(`could not open ${role} socket at ${WS}`));
  });
}

function waitFor(ws: WebSocket, match: (m: Msg) => boolean, timeoutMs = 3000): Promise<Msg> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeEventListener("message", onMessage);
      reject(new Error("timed out"));
    }, timeoutMs);
    function onMessage(e: MessageEvent) {
      const m = JSON.parse(String(e.data)) as Msg;
      if (!match(m)) return;
      clearTimeout(timer);
      ws.removeEventListener("message", onMessage);
      resolve(m);
    }
    ws.addEventListener("message", onMessage);
  });
}

function stats(label: string, samples: number[]) {
  const s = [...samples].sort((a, b) => a - b);
  const pct = (p: number) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
  console.log(
    `${label.padEnd(8)} n=${String(s.length).padEnd(4)} p50 ${pct(50).toFixed(1)} ms   p95 ${pct(95).toFixed(1)} ms   max ${s[s.length - 1]!.toFixed(1)} ms`,
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const started = new Date();

const dashboard = await open("dashboard");
await waitFor(dashboard, (m) => m.t === "hello");
const deviceWs = await open("device");
await sleep(300); // let the open handshake (schedule push, heartbeat) settle

// 1) live telemetry: pure transport
const live: number[] = [];
for (let i = 0; i < LIVE_N; i++) {
  const w = 1000 + i; // unique value to match the echo
  const t0 = performance.now();
  const got = waitFor(dashboard, (m) => m.t === "live" && (m.live as { w?: number }).w === w);
  deviceWs.send(JSON.stringify({ t: "live", w, state: "IDLE" }));
  await got;
  live.push(performance.now() - t0);
}

// 2) stored event → invalidate → refetch
const toInvalidate: number[] = [];
const toData: number[] = [];
for (let i = 0; i < EVENT_N; i++) {
  await sleep(EVENT_SPACING_MS);
  const t0 = performance.now();
  const got = waitFor(
    dashboard,
    (m) => m.t === "invalidate" && (m.keys as string[]).includes("sensors"),
  );
  deviceWs.send(JSON.stringify({ t: "event", type: "KNOCK", detail: TAG }));
  await got;
  toInvalidate.push(performance.now() - t0);
  const res = await fetch(`${BASE}/api/sensors?range=1h`);
  await res.json();
  toData.push(performance.now() - t0);
}

deviceWs.close();
dashboard.close();

console.log(`\nReal-time latency against ${BASE}\n`);
stats("live", live);
stats("event", toInvalidate);
stats("fetch", toData);

// Clean up our test rows.
await sleep(500);
const removed = await db
  .delete(deviceEvent)
  .where(and(eq(deviceEvent.detail, TAG), gte(deviceEvent.timestamp, started)))
  .returning({ id: deviceEvent.id });
console.log(`\ncleanup: removed ${removed.length} test events`);

// Closing our device socket starts the hub's 20 s offline grace period. If the real
// device is on HTTP only and its next heartbeat lands after that, a DEVICE_OFFLINE alert
// is raised for an outage that never happened. Wait it out and remove such an alert —
// but only if the device is demonstrably alive (heartbeat within the last minute).
console.log("waiting 22 s for the offline grace period…");
await sleep(22_000);
const [dev] = await db.select().from(device);
if (dev && Date.now() - dev.lastSeenAt.getTime() < 60_000) {
  const falseAlarms = await db
    .delete(alert)
    .where(and(eq(alert.type, "DEVICE_OFFLINE"), gte(alert.createdAt, started)))
    .returning({ id: alert.id });
  console.log(`cleanup: removed ${falseAlarms.length} test-caused DEVICE_OFFLINE alert(s)`);
} else {
  console.log("cleanup: device not seen in the last minute; leaving any offline alert in place");
}
await pgPool.end();
process.exit(0);
