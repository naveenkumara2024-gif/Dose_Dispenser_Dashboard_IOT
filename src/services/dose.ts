import { eq } from "drizzle-orm";
import { dispenseLog, schedule } from "../db/schema";
import { db } from "../lib/db";
import { invalidate } from "../ws/hub";
import { pushScheduleToDevice } from "../ws/schedulePush";

type DoseResult =
  | { kind: "not_found" }
  | { kind: "ok"; log: typeof dispenseLog.$inferSelect; duplicate: boolean };

// Shared by POST /api/dispense-log, POST /api/confirm-taken and the socket's `dose`
// message. `eid` makes a retried event a no-op (prompt 22): the firmware falls back to
// HTTP when a socket send isn't acked, so the same event can arrive twice.
export async function recordDose(input: {
  status: "DISPENSED" | "CONFIRMED_TAKEN";
  scheduleId: string;
  eid?: string;
}): Promise<DoseResult> {
  const { status, scheduleId, eid } = input;

  const [found] = await db
    .select({ id: schedule.id, frequency: schedule.frequency })
    .from(schedule)
    .where(eq(schedule.id, scheduleId));
  if (!found) return { kind: "not_found" };

  const [log] = await db
    .insert(dispenseLog)
    .values({ scheduleId, status, clientEventId: eid ?? null })
    .onConflictDoNothing({ target: dispenseLog.clientEventId })
    .returning();

  if (!log) {
    // Already stored under this eid: return that row so the retry looks like success.
    const [existing] = await db
      .select()
      .from(dispenseLog)
      .where(eq(dispenseLog.clientEventId, eid!));
    return { kind: "ok", log: existing!, duplicate: true };
  }

  // A weekly dose's compartment frees once that week's dose is done, so the caregiver can
  // refill it with something else (prompt 15). It does not repeat next week.
  if (status === "CONFIRMED_TAKEN" && found.frequency === "weekly") {
    await db.update(schedule).set({ active: false }).where(eq(schedule.id, found.id));
    invalidate(["schedule"]);
    await pushScheduleToDevice();
  }

  invalidate(["dashboard", "history", "sensors"]);
  return { kind: "ok", log, duplicate: false };
}
