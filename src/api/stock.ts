import { desc, eq } from "drizzle-orm";
import { medication, schedule, stockLevel, stockLog } from "../db/schema";
import { db } from "../lib/db";

// No "capacity"/"full weight" field exists in the schema, so a percentage-based badge
// isn't computable — this is a placeholder, same spirit as the environment page's
// placeholder temp/humidity thresholds (prompt 08). Change in one place once a real
// per-compartment capacity is known.
const LOW_STOCK_THRESHOLD_G = 2;
const HISTORY_LIMIT = 30;

export async function GET() {
  const [levels, allMedications, activeSchedules] = await Promise.all([
    db.select().from(stockLevel),
    db.select().from(medication),
    db.select({ medicationId: schedule.medicationId }).from(schedule).where(eq(schedule.active, true)),
  ]);

  // "Active medication" isn't a stored flag — a medication counts as active only if at
  // least one of its schedules is (schedule.ts archives the schedule, not the medication
  // row, so a medication whose only schedule got archived otherwise lingers looking live).
  const medicationIdsWithActiveSchedule = new Set(
    activeSchedules.map((s) => s.medicationId),
  );
  const activeMedications = allMedications.filter((med) =>
    medicationIdsWithActiveSchedule.has(med.id),
  );

  const medsByCompartment = new Map<number, { id: string; name: string }[]>();
  for (const med of activeMedications) {
    const list = medsByCompartment.get(med.compartmentNo) ?? [];
    list.push({ id: med.id, name: med.name });
    medsByCompartment.set(med.compartmentNo, list);
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
        lastUpdated: level?.lastUpdated?.toISOString() ?? null,
        lowStock: level ? level.weight < LOW_STOCK_THRESHOLD_G : false,
        // Ascending for the chart (oldest first), since it was queried newest-first.
        history: history.reverse(),
      };
    }),
  );

  return Response.json(rows);
}
