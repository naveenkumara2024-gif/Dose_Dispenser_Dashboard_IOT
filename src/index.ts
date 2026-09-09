import { serve } from "bun";
import {
  GET as getAlerts,
  PATCH as patchAlert,
} from "./api/alerts";
import { POST as confirmTaken } from "./api/confirmTaken";
import { GET as getDashboard } from "./api/dashboard";
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
import { GET as getStock } from "./api/stock";
import { POST as stockAlert } from "./api/stockAlert";
import index from "./index.html";
import { startMonitor } from "./jobs/monitor";
import { withErrorHandling } from "./lib/apiHandler";

const server = serve({
  routes: {
    // Serve index.html for all unmatched routes.
    "/*": index,

    "/api/dispense-log": { POST: withErrorHandling(dispenseLog) },
    "/api/confirm-taken": { POST: withErrorHandling(confirmTaken) },
    "/api/schedule": {
      GET: withErrorHandling(getSchedule),
      POST: withErrorHandling(createSchedule),
    },
    "/api/schedule/:id": {
      PATCH: withErrorHandling(patchSchedule),
      DELETE: withErrorHandling(deleteSchedule),
    },
    "/api/stock-alert": { POST: withErrorHandling(stockAlert) },
    "/api/stock": { GET: withErrorHandling(getStock) },
    "/api/environment-log": { POST: withErrorHandling(environmentLog) },
    "/api/device-heartbeat": { POST: withErrorHandling(deviceHeartbeat) },
    "/api/dashboard": { GET: withErrorHandling(getDashboard) },
    "/api/history": { GET: withErrorHandling(getHistory) },
    "/api/alerts": { GET: withErrorHandling(getAlerts) },
    "/api/alerts/:id": { PATCH: withErrorHandling(patchAlert) },
    "/api/medications": { GET: withErrorHandling(getMedications) },
    "/api/medications/:id": { PATCH: withErrorHandling(patchMedication) },
    "/api/medications/:id/schedules": {
      POST: withErrorHandling(addScheduleTime),
    },
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

startMonitor();

console.log(`🚀 Server running at ${server.url}`);
