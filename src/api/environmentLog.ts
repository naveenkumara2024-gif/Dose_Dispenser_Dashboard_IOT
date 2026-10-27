import type { BunRequest } from "bun";
import { environmentLogSchema } from "../lib/validators";
import { recordEnvironment } from "../services/environment";

export async function POST(req: BunRequest) {
  const parsed = environmentLogSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  return Response.json(await recordEnvironment(parsed.data), { status: 201 });
}
