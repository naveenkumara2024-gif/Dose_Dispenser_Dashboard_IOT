import { eq } from "drizzle-orm";
import { stockLevel, stockLog } from "../db/schema";
import { raiseAlert, resolveAlerts } from "../lib/alerts";
import { db } from "../lib/db";
import { LOW_STOCK_PCT } from "../lib/sensors";
import { invalidate } from "../ws/hub";

/**
 * Stores one load-cell reading: upserts the current value (StockLevel) and appends to
 * the history (StockLog). Shared by both stock endpoints and their socket messages.
 */
async function storeReading(compartmentNo: number, weight: number, percent: number | null) {
  const [existing] = await db
    .select({ id: stockLevel.id })
    .from(stockLevel)
    .where(eq(stockLevel.compartmentNo, compartmentNo));

  const [level] = existing
    ? await db
        .update(stockLevel)
        .set({ weight, percent, lastUpdated: new Date() })
        .where(eq(stockLevel.id, existing.id))
        .returning()
    : await db.insert(stockLevel).values({ compartmentNo, weight, percent }).returning();

  await db.insert(stockLog).values({ compartmentNo, weight, percent });

  invalidate(["sensors", "stock"]);
  return level!;
}

// Routine reading sent every minute and whenever the weight moves (prompt 19). Unlike
// the low-stock warning it doesn't assume "low": with a % of full it raises LOW_STOCK
// below the threshold and clears it once refilled.
export async function recordStockReading(input: {
  compartmentNo: number;
  weight: number;
  percent?: number;
}) {
  const { compartmentNo } = input;
  // A small negative weight is HX711 drift around an empty, tared platform.
  const grams = Math.max(0, input.weight);
  const percent = input.percent ?? null;
  const level = await storeReading(compartmentNo, grams, percent);

  const dedupeKey = `LOW_STOCK:${compartmentNo}`;
  let created = null;
  if (percent !== null && percent < LOW_STOCK_PCT) {
    created = await raiseAlert({
      type: "LOW_STOCK",
      message: `Low stock: ${grams}g remaining (${Math.round(percent)}% full)`,
      dedupeKey,
    });
  } else if (percent !== null) {
    await resolveAlerts(dedupeKey);
  }

  return { stockLevel: level, alert: created };
}

// The firmware's one-off low-stock warning (/api/stock-alert): always raises.
export async function recordLowStock(input: { compartmentNo: number; weight: number }) {
  const { compartmentNo, weight } = input;
  // No % of full on this message, so percent is cleared rather than left over from an
  // earlier routine reading.
  const level = await storeReading(compartmentNo, weight, null);

  const created = await raiseAlert({
    type: "LOW_STOCK",
    message: `Low stock in compartment ${compartmentNo} (${weight}g remaining)`,
    dedupeKey: `LOW_STOCK:${compartmentNo}`,
  });

  return { stockLevel: level, alert: created };
}
