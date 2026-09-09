import type { BunRequest } from "bun";
import { eq } from "drizzle-orm";
import { dispenseLog, schedule } from "../db/schema";
import { db } from "../lib/db";
import { dispenseLogSchema } from "../lib/validators";

export async function POST(req: BunRequest) {
  const parsed = dispenseLogSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [found] = await db
    .select({ id: schedule.id })
    .from(schedule)
    .where(eq(schedule.id, parsed.data.scheduleId));
  if (!found) {
    return Response.json({ error: "Schedule not found" }, { status: 404 });
  }

  const [log] = await db
    .insert(dispenseLog)
    .values({ scheduleId: parsed.data.scheduleId, status: "DISPENSED" })
    .returning();

  return Response.json(log, { status: 201 });
}
