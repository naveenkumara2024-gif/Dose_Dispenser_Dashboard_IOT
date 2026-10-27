import type { BunRequest } from "bun";
import { stockReadingSchema } from "../lib/validators";
import { recordStockReading } from "../services/stock";

// Routine load-cell reading (prompt 19); logic lives in the stock service (prompt 22).
export async function POST(req: BunRequest) {
  const parsed = stockReadingSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  return Response.json(await recordStockReading(parsed.data), { status: 201 });
}
