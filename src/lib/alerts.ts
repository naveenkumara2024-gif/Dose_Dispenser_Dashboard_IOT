import { and, eq } from "drizzle-orm";
import { alert } from "../db/schema";
import { db } from "./db";


type RaiseAlertInput = {
  type: "LOW_STOCK" | "MISSED_DOSE" | "STORAGE_CONDITION" | "DEVICE_OFFLINE";
  message: string;
  dedupeKey: string;
};

/**
 * Raises an alert unless an unresolved one for the same condition already exists.
 * Relies on the partial unique index rather than a read-then-write check, so two
 * concurrent callers can't both slip through. Returns null when deduped.
 */
export async function raiseAlert({ type, message, dedupeKey }: RaiseAlertInput) {
  const [created] = await db
    .insert(alert)
    .values({ type, message, dedupeKey })
    .onConflictDoNothing()
    .returning();

  return created ?? null;
}

/** Marks any unresolved alerts for a condition as resolved. */
export async function resolveAlerts(dedupeKey: string) {
  await db
    .update(alert)
    .set({ resolved: true })
    .where(and(eq(alert.dedupeKey, dedupeKey), eq(alert.resolved, false)));
}
