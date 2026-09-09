import type { BunRequest } from "bun";
import { eq } from "drizzle-orm";
import { dispenseLog, medication, schedule } from "../db/schema";
import { db } from "../lib/db";
import { scheduleCreateSchema, scheduleUpdateSchema } from "../lib/validators";

export async function GET(req: BunRequest) {
  // Default excludes archived rows so the ESP32 never dispenses a discontinued dose.
  // The history page opts in, so archived medications stay filterable there.
  const includeArchived =
    new URL(req.url).searchParams.get("includeArchived") === "1";

  const schedules = await db.query.schedule.findMany({
    where: includeArchived ? undefined : eq(schedule.active, true),
    with: { medication: true },
    orderBy: (schedule, { asc }) => [asc(schedule.time)],
  });

  return Response.json(schedules);
}

export async function POST(req: BunRequest) {
  const parsed = scheduleCreateSchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { name, dosage, compartmentNo, time, frequency, dayOfWeek } =
    parsed.data;

  const created = await db.transaction(async (tx) => {
    const [med] = await tx
      .insert(medication)
      .values({ name, dosage, compartmentNo })
      .returning();
    const [sched] = await tx
      .insert(schedule)
      .values({
        medicationId: med!.id,
        time,
        frequency,
        dayOfWeek: frequency === "weekly" ? (dayOfWeek ?? null) : null,
      })
      .returning();
    return { ...sched!, medication: med! };
  });

  return Response.json(created, { status: 201 });
}

// Edits a dose time only. Medication fields (name/dosage/compartment) go through
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

  const { time, frequency, dayOfWeek } = parsed.data;
  // Switching to daily clears the day, so a stale weekday can't linger.
  const nextDay = frequency === "daily" ? null : (dayOfWeek ?? undefined);

  await db
    .update(schedule)
    .set({
      ...(time !== undefined && { time }),
      ...(frequency !== undefined && { frequency }),
      ...(nextDay !== undefined && { dayOfWeek: nextDay }),
    })
    .where(eq(schedule.id, id));

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
