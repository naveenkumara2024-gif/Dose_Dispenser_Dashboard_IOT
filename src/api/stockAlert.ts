import type { BunRequest } from "bun";
import { eq } from "drizzle-orm";
import { stockLevel, stockLog } from "../db/schema";
import { raiseAlert } from "../lib/alerts";
import { db } from "../lib/db";
import { stockAlertSchema } from "../lib/validators";

export async function POST(req: BunRequest) {
  const parsed = stockAlertSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { compartmentNo, weight } = parsed.data;

  const [existing] = await db
    .select({ id: stockLevel.id })
    .from(stockLevel)
    .where(eq(stockLevel.compartmentNo, compartmentNo));

  const [level] = existing
    ? await db
        .update(stockLevel)
        .set({ weight, lastUpdated: new Date() })
        .where(eq(stockLevel.id, existing.id))
        .returning()
    : await db.insert(stockLevel).values({ compartmentNo, weight }).returning();

  // StockLevel above is upserted (current value only); this is the append-only history
  // the stock page's depletion chart plots from (prompt 13).
  await db.insert(stockLog).values({ compartmentNo, weight });

  const created = await raiseAlert({
    type: "LOW_STOCK",
    message: `Low stock in compartment ${compartmentNo} (${weight}g remaining)`,
    dedupeKey: `LOW_STOCK:${compartmentNo}`,
  });

  return Response.json({ stockLevel: level, alert: created }, { status: 201 });
}
