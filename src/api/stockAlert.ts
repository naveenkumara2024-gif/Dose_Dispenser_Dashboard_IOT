import type { BunRequest } from "bun";
import { stockAlertSchema } from "../lib/validators";
import { recordLowStock } from "../services/stock";

export async function POST(req: BunRequest) {
  const parsed = stockAlertSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  return Response.json(await recordLowStock(parsed.data), { status: 201 });
}
