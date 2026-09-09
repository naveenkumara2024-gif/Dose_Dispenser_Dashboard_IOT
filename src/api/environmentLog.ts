import type { BunRequest } from "bun";
import { environmentLog } from "../db/schema";
import { raiseAlert } from "../lib/alerts";
import { db } from "../lib/db";
import { environmentLogSchema } from "../lib/validators";

// Placeholder storage limits — not sourced from real medication storage requirements.
const SAFE_TEMPERATURE_C = { min: 15, max: 30 };
const SAFE_HUMIDITY_PCT = { min: 30, max: 60 };

export async function POST(req: BunRequest) {
  const parsed = environmentLogSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { temperature, humidity } = parsed.data;
  const alert =
    temperature < SAFE_TEMPERATURE_C.min ||
    temperature > SAFE_TEMPERATURE_C.max ||
    humidity < SAFE_HUMIDITY_PCT.min ||
    humidity > SAFE_HUMIDITY_PCT.max;

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

  return Response.json(log, { status: 201 });
}
