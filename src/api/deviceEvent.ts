import type { BunRequest } from "bun";
import { deviceEventSchema } from "../lib/validators";
import { recordDeviceEvent } from "../services/deviceEvent";

export async function POST(req: BunRequest) {
  const parsed = deviceEventSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  return Response.json(await recordDeviceEvent(parsed.data), { status: 201 });
}
