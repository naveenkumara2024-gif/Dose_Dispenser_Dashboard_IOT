import type { BunRequest } from "bun";
import { deviceHeartbeatSchema } from "../lib/validators";
import { recordHeartbeat } from "../services/heartbeat";

export async function POST(req: BunRequest) {
  // The body is diagnostics only (prompt 20). A malformed one must not cost the device
  // its "online" status, so bad or missing fields are ignored rather than 400'd.
  const parsed = deviceHeartbeatSchema.safeParse(await req.json().catch(() => ({})));
  const at = await recordHeartbeat(parsed.success ? parsed.data : {});
  return Response.json({ online: true, at: at.toISOString() });
}
