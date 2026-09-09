import type { BunRequest } from "bun";

type Handler<T extends string> = (
  req: BunRequest<T>,
) => Response | Promise<Response>;

export function withErrorHandling<T extends string>(
  handler: Handler<T>,
): Handler<T> {
  return async (req) => {
    try {
      return await handler(req);
    } catch (error) {
      console.error(`${req.method} ${new URL(req.url).pathname} failed:`, error);
      return Response.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}
