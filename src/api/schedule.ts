import type { BunRequest } from "bun";
import { eq } from "drizzle-orm";
import { dispenseLog, medication, schedule } from "../db/schema";
import { assertCompartmentRules, compartmentErrorResponse } from "../lib/compartments";
import { db } from "../lib/db";
import { scheduleCreateSchema, scheduleUpdateSchema } from "../lib/validators";
import { listSchedules } from "../services/schedule";

export async function GET(req: BunRequest) {
  // Default excludes archived and ended rows so the ESP32 never dispenses a discontinued
  // dose. The history page opts in, so archived medications stay filterable there.
  const includeArchived =
    new URL(req.url).searchParams.get("includeArchived") === "1";

  return Response.json(await listSchedules(includeArchived));
}

export async function POST(req: BunRequest) {
  const parsed = scheduleCreateSchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { name, dosage, compartmentNo, endDate, time, frequency, dayOfWeek } =
    parsed.data;

  try {
    const created = await db.transaction(async (tx) => {
      await assertCompartmentRules(tx, { compartmentNo, time });
      const [med] = await tx
        .insert(medication)
        .values({ name, dosage })
        .returning();
      const [sched] = await tx
        .insert(schedule)
        .values({
          medicationId: med!.id,
          time,
          frequency,
          dayOfWeek: frequency === "weekly" ? (dayOfWeek ?? null) : null,
          compartmentNo,
          endDate: endDate ?? null,
        })
        .returning();
      return { ...sched!, medication: med! };
    });

    return Response.json(created, { status: 201 });
  } catch (error) {
    return compartmentErrorResponse(error);
  }
}

// Edits a dose time only (time, frequency, compartment, end date). Medication fields (name/dosage) go through
// PATCH /api/medications/:id instead — there's one Medication row per drug, referenced by
// every one of its schedules, so editing it there already applies everywhere (prompt 12).
export async function PATCH(req: BunRequest<"/api/schedule/:id">) {
  const { id } = req.params;
  const parsed = scheduleUpdateSchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await db.query.schedule.findFirst({
    where: eq(schedule.id, id),
  });
  if (!existing) {
    return Response.json({ error: "Schedule not found" }, { status: 404 });
  }

  const { time, frequency, dayOfWeek, compartmentNo, endDate } = parsed.data;
  // Switching to daily clears the day, so a stale weekday can't linger.
  const nextDay = frequency === "daily" ? null : (dayOfWeek ?? undefined);

  try {
    await db.transaction(async (tx) => {
      if (existing.active) {
        await assertCompartmentRules(tx, {
          id,
          compartmentNo: compartmentNo ?? existing.compartmentNo,
          time: time ?? existing.time,
        });
      }
      await tx
        .update(schedule)
        .set({
          ...(time !== undefined && { time }),
          ...(frequency !== undefined && { frequency }),
          ...(nextDay !== undefined && { dayOfWeek: nextDay }),
          ...(compartmentNo !== undefined && { compartmentNo }),
          ...(endDate !== undefined && { endDate }),
        })
        .where(eq(schedule.id, id));
    });
  } catch (error) {
    return compartmentErrorResponse(error);
  }

  const updated = await db.query.schedule.findFirst({
    where: eq(schedule.id, id),
    with: { medication: true },
  });

  return Response.json(updated);
}

export async function DELETE(req: BunRequest<"/api/schedule/:id">) {
  const { id } = req.params;

  const existing = await db.query.schedule.findFirst({
    where: eq(schedule.id, id),
  });
  if (!existing) {
    return Response.json({ error: "Schedule not found" }, { status: 404 });
  }

  const [history] = await db
    .select({ id: dispenseLog.id })
    .from(dispenseLog)
    .where(eq(dispenseLog.scheduleId, id))
    .limit(1);

  // Archive rather than delete when there's history — the adherence record is medical
  // history and must survive, but the caregiver still needs it off their list.
  if (history) {
    await db
      .update(schedule)
      .set({ active: false })
      .where(eq(schedule.id, id));

    return Response.json({ archived: true });
  }

  await db.transaction(async (tx) => {
    await tx.delete(schedule).where(eq(schedule.id, id));

    const remaining = await tx
      .select({ id: schedule.id })
      .from(schedule)
      .where(eq(schedule.medicationId, existing.medicationId))
      .limit(1);

    if (remaining.length === 0) {
      await tx.delete(medication).where(eq(medication.id, existing.medicationId));
    }
  });

  return new Response(null, { status: 204 });
}
