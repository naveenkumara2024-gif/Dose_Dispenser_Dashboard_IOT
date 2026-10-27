import { and, eq } from "drizzle-orm";
import { alert, type alertType } from "../db/schema";
import { invalidate, publishToDashboards } from "../ws/hub";
import { db } from "./db";


type RaiseAlertInput = {
  type: (typeof alertType.enumValues)[number];
  message: string;
  dedupeKey: string;
};

/**
 * Raises an alert unless an unresolved one for the same condition already exists.
 * Relies on the partial unique index rather than a read-then-write check, so two
 * concurrent callers can't both slip through. Returns null when deduped.
 *
 * Every alert passes through here, so this is where dashboards are told (prompt 22):
 * the pushed row opens the pop-up without a refetch.
 */
export async function raiseAlert({ type, message, dedupeKey }: RaiseAlertInput) {
  const [created] = await db
    .insert(alert)
    .values({ type, message, dedupeKey })
    .onConflictDoNothing()
    .returning();

  if (created) {
    publishToDashboards({ t: "alert", alert: created });
    invalidate(["alerts", "dashboard"]);
  }
  return created ?? null;
}

/** Marks any unresolved alerts for a condition as resolved. */
export async function resolveAlerts(dedupeKey: string) {
  const resolved = await db
    .update(alert)
    .set({ resolved: true })
    .where(and(eq(alert.dedupeKey, dedupeKey), eq(alert.resolved, false)))
    .returning({ id: alert.id });

  if (resolved.length > 0) invalidate(["alerts", "dashboard"]);
}
