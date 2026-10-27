import type { BunRequest } from "bun";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { medication, schedule } from "../db/schema";
import { assertCompartmentRules, compartmentErrorResponse } from "../lib/compartments";
import { db } from "../lib/db";
import { medicationUpdateSchema, scheduleTimeCreateSchema } from "../lib/validators";

export async function GET() {
  const medications = await db
    .select()
    .from(medication)
    .orderBy(medication.name);

  return Response.json(medications);
}

export async function PATCH(req: BunRequest<"/api/medications/:id">) {
  const { id } = req.params;

  if (!z.uuid().safeParse(id).success) {
    return Response.json({ error: "Invalid medication id" }, { status: 400 });
  }

  const parsed = medicationUpdateSchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [updated] = await db
    .update(medication)
    .set(parsed.data)
    .where(eq(medication.id, id))
    .returning();

  if (!updated) {
    return Response.json({ error: "Medication not found" }, { status: 404 });
  }

  // Every schedule referencing this row picks up the change immediately — there is
  // structurally one Medication row, nothing to propagate (prompt 12).
  return Response.json(updated);
}

// Adds another dose time to an EXISTING medication, instead of the only previous option
// (re-entering name/dosage/compartment and getting a second, coincidentally-similar
// Medication row). This is the fix for prompt 12: since there's now a real path to reuse
// the existing medicationId, the duplication this prompt was written to solve never
// gets a chance to happen.
export async function addScheduleTime(req: BunRequest<"/api/medications/:id/schedules">) {
  const { id: medicationId } = req.params;

  if (!z.uuid().safeParse(medicationId).success) {
    return Response.json({ error: "Invalid medication id" }, { status: 400 });
  }

  const parsed = scheduleTimeCreateSchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [med] = await db
    .select({ id: medication.id })
    .from(medication)
    .where(eq(medication.id, medicationId));
  if (!med) {
    return Response.json({ error: "Medication not found" }, { status: 404 });
  }

  const { time, frequency, dayOfWeek, compartmentNo, endDate } = parsed.data;

  try {
    const created = await db.transaction(async (tx) => {
      await assertCompartmentRules(tx, { compartmentNo, time });
      const [row] = await tx
        .insert(schedule)
        .values({
          medicationId,
          time,
          frequency,
          dayOfWeek: frequency === "weekly" ? (dayOfWeek ?? null) : null,
          compartmentNo,
          endDate: endDate ?? null,
        })
        .returning();
      return row;
    });

    return Response.json(created, { status: 201 });
  } catch (error) {
    return compartmentErrorResponse(error);
  }
}
