import { db } from "../lib/db";
import { occupyingCondition } from "../lib/compartments";

// The dose times the device should dispense — GET /api/schedule's default response and
// the payload pushed to the device socket (prompt 22). Archived and ended rows are
// excluded so the ESP32 never dispenses a discontinued dose; the history page opts in.
export function listSchedules(includeArchived = false) {
  return db.query.schedule.findMany({
    where: includeArchived ? undefined : occupyingCondition(),
    with: { medication: true },
    orderBy: (schedule, { asc }) => [asc(schedule.time)],
  });
}
