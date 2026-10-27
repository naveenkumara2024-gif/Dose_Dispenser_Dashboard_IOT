import type { BunRequest } from "bun";
import { tiltEventSchema } from "../lib/validators";
import { recordTilt } from "../services/tilt";

export async function POST(req: BunRequest) {
  const parsed = tiltEventSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  return Response.json(await recordTilt(parsed.data), { status: 201 });
}
