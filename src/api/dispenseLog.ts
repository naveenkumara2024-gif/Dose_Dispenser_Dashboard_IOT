import type { BunRequest } from "bun";
import { dispenseLogSchema } from "../lib/validators";
import { recordDose } from "../services/dose";

export async function POST(req: BunRequest) {
  const parsed = dispenseLogSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await recordDose({ status: "DISPENSED", ...parsed.data });
  if (result.kind === "not_found") {
    return Response.json({ error: "Schedule not found" }, { status: 404 });
  }
  // 200 for a retried event already stored (same eid), 201 for a new one.
  return Response.json(result.log, { status: result.duplicate ? 200 : 201 });
}
