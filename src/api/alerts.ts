import type { BunRequest } from "bun";
import { and, count, desc, eq, type SQL } from "drizzle-orm";
import { z } from "zod";
import { alert } from "../db/schema";
import { db } from "../lib/db";
import { alertPatchSchema, alertQuerySchema } from "../lib/validators";

export async function GET(req: BunRequest) {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = alertQuerySchema.safeParse(params);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { type, resolved, limit, offset } = parsed.data;

  const filters: SQL[] = [
    // The centre is a worklist: unresolved unless explicitly asked otherwise.
    eq(alert.resolved, resolved ?? false),
  ];
  if (type) filters.push(eq(alert.type, type));
  const where = and(...filters);

  const [alerts, totalRows] = await Promise.all([
    db
      .select()
      .from(alert)
      .where(where)
      .orderBy(desc(alert.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(alert).where(where),
  ]);

  return Response.json({
    alerts,
    total: totalRows[0]?.total ?? 0,
    limit,
    offset,
  });
}

export async function PATCH(req: BunRequest<"/api/alerts/:id">) {
  const { id } = req.params;

  // A non-uuid id would make Postgres throw on the WHERE clause (AGENT.md Section 6).
  if (!z.uuid().safeParse(id).success) {
    return Response.json({ error: "Invalid alert id" }, { status: 400 });
  }

  const parsed = alertPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [updated] = await db
    .update(alert)
    .set({ resolved: parsed.data.resolved })
    .where(eq(alert.id, id))
    .returning();

  if (!updated) {
    return Response.json({ error: "Alert not found" }, { status: 404 });
  }

  return Response.json(updated);
}
