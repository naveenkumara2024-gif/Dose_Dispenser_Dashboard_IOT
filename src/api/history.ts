import type { BunRequest } from "bun";
import { and, count, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { dispenseLog, medication, schedule } from "../db/schema";
import { db } from "../lib/db";
import { zonedDayBounds } from "../lib/time";
import { historyQuerySchema } from "../lib/validators";

export async function GET(req: BunRequest) {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = historyQuerySchema.safeParse(params);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { status, medicationId, from, to, limit, offset } = parsed.data;

  const filters: SQL[] = [];
  if (status) filters.push(eq(dispenseLog.status, status));
  if (medicationId) filters.push(eq(schedule.medicationId, medicationId));
  if (from) filters.push(gte(dispenseLog.timestamp, zonedDayBounds(from).start));
  if (to) filters.push(lte(dispenseLog.timestamp, zonedDayBounds(to).end));

  const where = filters.length > 0 ? and(...filters) : undefined;

  const [logs, totalRows] = await Promise.all([
    db
      .select({
        id: dispenseLog.id,
        status: dispenseLog.status,
        timestamp: dispenseLog.timestamp,
        scheduleId: schedule.id,
        scheduledTime: schedule.time,
        medicationId: medication.id,
        medicationName: medication.name,
        dosage: medication.dosage,
        compartmentNo: schedule.compartmentNo,
      })
      .from(dispenseLog)
      .innerJoin(schedule, eq(dispenseLog.scheduleId, schedule.id))
      .innerJoin(medication, eq(schedule.medicationId, medication.id))
      .where(where)
      .orderBy(desc(dispenseLog.timestamp))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(dispenseLog)
      .innerJoin(schedule, eq(dispenseLog.scheduleId, schedule.id))
      .where(where),
  ]);

  return Response.json({
    logs,
    total: totalRows[0]?.total ?? 0,
    limit,
    offset,
  });
}
