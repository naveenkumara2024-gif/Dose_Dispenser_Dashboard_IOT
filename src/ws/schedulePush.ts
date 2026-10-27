import { listSchedules } from "../services/schedule";
import { getDeviceSocket, sendToDevice } from "./hub";

/**
 * Sends the current schedule to the device socket, if connected (prompt 22) — on
 * connect and after any change, replacing the firmware's 15 s poll. Never throws: a
 * failed push must not fail the request that changed the schedule; the device still
 * gets it on its next connect, or its HTTP poll while the socket is down.
 */
export async function pushScheduleToDevice() {
  if (!getDeviceSocket()) return;
  try {
    const doses = await listSchedules();
    sendToDevice({ t: "schedule", doses });
  } catch (error) {
    console.error("schedule push failed:", error);
  }
}
