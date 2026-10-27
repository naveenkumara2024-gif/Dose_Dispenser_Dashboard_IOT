import type { BunRequest } from "bun";
import { invalidate } from "./hub";
import type { InvalidateKey } from "./protocol";
import { pushScheduleToDevice } from "./schedulePush";

type Handler<T extends string> = (req: BunRequest<T>) => Response | Promise<Response>;

/**
 * For dashboard-side writes (schedule, medications, alerts): after a successful
 * response, tell open dashboards what changed and, for schedule changes, push the new
 * schedule to the device at once instead of waiting for its poll (prompt 22).
 * Device-side writes publish from their services instead, so REST and socket agree.
 */
export function withPublish<T extends string>(
  handler: Handler<T>,
  keys: InvalidateKey[],
  options: { pushSchedule?: boolean } = {},
): Handler<T> {
  return async (req) => {
    const res = await handler(req);
    if (res.status < 300) {
      invalidate(keys);
      if (options.pushSchedule) await pushScheduleToDevice();
    }
    return res;
  };
}
