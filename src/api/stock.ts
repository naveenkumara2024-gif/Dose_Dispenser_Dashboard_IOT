import { desc, eq } from "drizzle-orm";
import { medication, schedule, stockLevel, stockLog } from "../db/schema";
import { db } from "../lib/db";
// No "capacity"/"full weight" field exists in the schema, so a percentage-based badge
// isn't computable — LOW_STOCK_THRESHOLD_G is a placeholder (now shared, prompt 16).
import { isLowStock } from "../lib/sensors";
const HISTORY_LIMIT = 30;

export async function GET() {
  // Compartments belong to dose times (prompt 15), so only active dose times count —
  // an archived one no longer has pills in the wheel.
  const [levels, activeDoses] = await Promise.all([
    db.select().from(stockLevel),
    db
      .select({
        compartmentNo: schedule.compartmentNo,
        medicationId: medication.id,
        name: medication.name,
      })
      .from(schedule)
      .innerJoin(medication, eq(schedule.medicationId, medication.id))
      .where(eq(schedule.active, true)),
  ]);

  const medsByCompartment = new Map<number, { id: string; name: string }[]>();
  for (const dose of activeDoses) {
    const list = medsByCompartment.get(dose.compartmentNo) ?? [];
    if (!list.some((m) => m.id === dose.medicationId)) {
      list.push({ id: dose.medicationId, name: dose.name });
    }
    medsByCompartment.set(dose.compartmentNo, list);
  }

  // Union of compartments that have EITHER a reading or a medication, so a medication
  // with no reading yet still shows, and a compartment reporting weight with no
  // medication assigned still shows too (the hardware exists; hiding it would lie).
  const compartments = new Set<number>([
    ...levels.map((l) => l.compartmentNo),
    ...medsByCompartment.keys(),
  ]);

  const rows = await Promise.all(
    [...compartments].sort((a, b) => a - b).map(async (compartmentNo) => {
      const level = levels.find((l) => l.compartmentNo === compartmentNo);
      const meds = medsByCompartment.get(compartmentNo) ?? [];

      const history = await db
        .select({ weight: stockLog.weight, timestamp: stockLog.timestamp })
        .from(stockLog)
        .where(eq(stockLog.compartmentNo, compartmentNo))
        .orderBy(desc(stockLog.timestamp))
        .limit(HISTORY_LIMIT);

      return {
        compartmentNo,
        medicationName: meds.map((m) => m.name).join(", ") || null,
        weight: level?.weight ?? null,
        percent: level?.percent ?? null,
        lastUpdated: level?.lastUpdated?.toISOString() ?? null,
        lowStock: level ? isLowStock(level.weight, level.percent) : false,
        // Ascending for the chart (oldest first), since it was queried newest-first.
        history: history.reverse(),
      };
    }),
  );

  return Response.json(rows);
}
