-- Prompt 15: compartment moves from Medication to each dose time (Schedule).
-- Hand-edited: the generated version added a NOT NULL column with no value for existing
-- rows. Add it nullable, copy each dose time's compartment from its medication, then
-- enforce NOT NULL. If two ACTIVE dose times share a compartment, the unique index below
-- fails and the migration stops - fix those on the Schedule page first; nothing is
-- archived automatically.
ALTER TABLE "Schedule" ADD COLUMN "compartmentNo" integer;--> statement-breakpoint
UPDATE "Schedule" s SET "compartmentNo" = m."compartmentNo" FROM "Medication" m WHERE s."medicationId" = m."id";--> statement-breakpoint
ALTER TABLE "Schedule" ALTER COLUMN "compartmentNo" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Schedule" ADD COLUMN "endDate" date;--> statement-breakpoint
CREATE UNIQUE INDEX "Schedule_active_compartment_idx" ON "Schedule" USING btree ("compartmentNo") WHERE "Schedule"."active" = true;--> statement-breakpoint
ALTER TABLE "Medication" DROP COLUMN "compartmentNo";
