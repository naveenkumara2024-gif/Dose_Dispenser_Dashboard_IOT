import { and, eq, gte, isNull, lt, ne, or, sql } from "drizzle-orm";
import { schedule } from "../db/schema";
import { db } from "./db";
import { todayInZone } from "./time";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Arbitrary but fixed: serialises compartment checks so two saves can't both pass the
// order check and then both write (the unique index covers "occupied", not "order").
const COMPARTMENT_LOCK_ID = 8412_5515;

export class CompartmentRuleError extends Error {}

type Candidate = {
  id?: string; // the dose time being edited, excluded from the comparison
  compartmentNo: number;
  time: string;
};

/** A dose time occupies its compartment while active and not past its end date. */
export function occupyingCondition(today: string = todayInZone()) {
  return and(
    eq(schedule.active, true),
    or(isNull(schedule.endDate), gte(schedule.endDate, today)),
  );
}

/**
 * The wheel only turns one way (C1 -> C5, then resets), so within a day the compartments
 * must be reached in order: each occupied compartment's time is later than the one before.
 * Also refuses an occupied compartment with a readable message (the unique index would
 * otherwise surface it as a bare constraint error). Must run inside the write transaction.
 */
export async function assertCompartmentRules(tx: Tx, candidate: Candidate) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${COMPARTMENT_LOCK_ID})`);

  // A dose past its end date no longer occupies its compartment, but it still holds the
  // unique index until archived - archive it now rather than wait for the monitor job.
  await archiveEndedDoses(tx);

  const others = await tx.query.schedule.findMany({
    where: candidate.id
      ? and(occupyingCondition(), ne(schedule.id, candidate.id))
      : occupyingCondition(),
    with: { medication: true },
  });

  const { compartmentNo: n, time } = candidate;

  const holder = others.find((s) => s.compartmentNo === n);
  if (holder) {
    throw new CompartmentRuleError(
      `Compartment ${n} already holds ${holder.medication.name} at ${holder.time}. Delete or move that dose first.`,
    );
  }

  const before = others
    .filter((s) => s.compartmentNo < n)
    .sort((a, b) => b.compartmentNo - a.compartmentNo)[0];
  const after = others
    .filter((s) => s.compartmentNo > n)
    .sort((a, b) => a.compartmentNo - b.compartmentNo)[0];

  // "HH:mm" strings compare correctly as text.
  const tooEarly = before && time <= before.time;
  const tooLate = after && time >= after.time;
  if (tooEarly || tooLate) {
    const bounds = [
      before && `after C${before.compartmentNo} (${before.time})`,
      after && `before C${after.compartmentNo} (${after.time})`,
    ]
      .filter(Boolean)
      .join(" and ");
    throw new CompartmentRuleError(
      `The wheel turns C1 to C5 in order, so a dose in C${n} must be ${bounds}.`,
    );
  }
}

/**
 * Archives active doses whose end date has passed, freeing their compartments.
 * Returns how many were archived, so callers can tell dashboards and the device.
 */
export async function archiveEndedDoses(executor: Tx | typeof db = db): Promise<number> {
  const archived = await executor
    .update(schedule)
    .set({ active: false })
    .where(and(eq(schedule.active, true), lt(schedule.endDate, todayInZone())))
    .returning({ id: schedule.id });
  return archived.length;
}

/** JSON 409 for a broken compartment rule; rethrows anything else. */
export function compartmentErrorResponse(error: unknown): Response {
  if (error instanceof CompartmentRuleError) {
    return Response.json({ error: error.message }, { status: 409 });
  }
  throw error;
}
