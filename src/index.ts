import { serve } from "bun";
import {
  GET as getAlerts,
  PATCH as patchAlert,
} from "./api/alerts";
import { POST as confirmTaken } from "./api/confirmTaken";
import { GET as getDashboard } from "./api/dashboard";
import { POST as deviceEvent } from "./api/deviceEvent";
import { POST as deviceHeartbeat } from "./api/deviceHeartbeat";
import { POST as dispenseLog } from "./api/dispenseLog";
import { POST as environmentLog } from "./api/environmentLog";
import { GET as getHistory } from "./api/history";
import {
  addScheduleTime,
  GET as getMedications,
  PATCH as patchMedication,
} from "./api/medications";
import {
  DELETE as deleteSchedule,
  GET as getSchedule,
  PATCH as patchSchedule,
  POST as createSchedule,
} from "./api/schedule";
import { GET as getSensors } from "./api/sensors";
import { GET as getStock } from "./api/stock";
import { POST as stockAlert } from "./api/stockAlert";
import { POST as stockReading } from "./api/stockReading";
import { POST as tiltEvent } from "./api/tiltEvent";
import index from "./index.html";
import { startMonitor } from "./jobs/monitor";
import { withErrorHandling } from "./lib/apiHandler";
import { websocket } from "./ws/handlers";
import { attachServer } from "./ws/hub";
import { withPublish } from "./ws/publish";

// Dashboard-side writes that change what the device dispenses (prompt 22).
const SCHEDULE_KEYS = ["schedule", "dashboard", "history"] as const;
const scheduleWrite = { pushSchedule: true };

const server = serve({
  routes: {
    // Serve index.html for all unmatched routes.
    "/*": index,

    // Real-time channel (prompt 22). ?role=device for the ESP32, ?role=dashboard for
    // browsers. Returns nothing once upgraded; JSON errors otherwise, never HTML.
    "/ws": (req, server) => {
      try {
        const role = new URL(req.url).searchParams.get("role");
        if (role !== "device" && role !== "dashboard") {
          return Response.json({ error: "role must be device or dashboard" }, { status: 400 });
        }
        if (server.upgrade(req, { data: { role } })) return;
        return Response.json({ error: "WebSocket upgrade required" }, { status: 426 });
      } catch (error) {
        console.error("GET /ws failed:", error);
        return Response.json({ error: "Internal server error" }, { status: 500 });
      }
    },

    "/api/dispense-log": { POST: withErrorHandling(dispenseLog) },
    "/api/confirm-taken": { POST: withErrorHandling(confirmTaken) },
    "/api/schedule": {
      GET: withErrorHandling(getSchedule),
      POST: withErrorHandling(withPublish(createSchedule, [...SCHEDULE_KEYS], scheduleWrite)),
    },
    "/api/schedule/:id": {
      PATCH: withErrorHandling(withPublish(patchSchedule, [...SCHEDULE_KEYS], scheduleWrite)),
      DELETE: withErrorHandling(withPublish(deleteSchedule, [...SCHEDULE_KEYS], scheduleWrite)),
    },
    "/api/stock-alert": { POST: withErrorHandling(stockAlert) },
    "/api/stock-reading": { POST: withErrorHandling(stockReading) },
    "/api/stock": { GET: withErrorHandling(getStock) },
    "/api/environment-log": { POST: withErrorHandling(environmentLog) },
    "/api/device-heartbeat": { POST: withErrorHandling(deviceHeartbeat) },
    "/api/tilt-event": { POST: withErrorHandling(tiltEvent) },
    "/api/device-event": { POST: withErrorHandling(deviceEvent) },
    "/api/sensors": { GET: withErrorHandling(getSensors) },
    "/api/dashboard": { GET: withErrorHandling(getDashboard) },
    "/api/history": { GET: withErrorHandling(getHistory) },
    "/api/alerts": { GET: withErrorHandling(getAlerts) },
    "/api/alerts/:id": {
      PATCH: withErrorHandling(withPublish(patchAlert, ["alerts", "dashboard"])),
    },
    "/api/medications": { GET: withErrorHandling(getMedications) },
    "/api/medications/:id": {
      PATCH: withErrorHandling(withPublish(patchMedication, [...SCHEDULE_KEYS], scheduleWrite)),
    },
    "/api/medications/:id/schedules": {
      POST: withErrorHandling(withPublish(addScheduleTime, [...SCHEDULE_KEYS], scheduleWrite)),
    },
  },

  websocket,

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

attachServer(server);
startMonitor();

console.log(`🚀 Server running at ${server.url}`);
