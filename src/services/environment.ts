import { environmentLog } from "../db/schema";
import { raiseAlert } from "../lib/alerts";
import { db } from "../lib/db";
import { isEnvironmentOutOfRange } from "../lib/sensors";
import { invalidate } from "../ws/hub";

// Shared by POST /api/environment-log and the device socket's `env` message (prompt 22).
export async function recordEnvironment(input: { temperature: number; humidity: number }) {
  const { temperature, humidity } = input;
  const alert = isEnvironmentOutOfRange(temperature, humidity);

  const [log] = await db
    .insert(environmentLog)
    .values({ temperature, humidity, alert })
    .returning();

  if (alert) {
    await raiseAlert({
      type: "STORAGE_CONDITION",
      message: `Storage out of range: ${temperature}°C, ${humidity}% humidity`,
      dedupeKey: "STORAGE_CONDITION",
    });
  }

  invalidate(["sensors"]);
  return log!;
}
