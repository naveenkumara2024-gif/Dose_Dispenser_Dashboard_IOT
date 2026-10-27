ALTER TABLE "DispenseLog" ADD COLUMN "clientEventId" text;--> statement-breakpoint
CREATE UNIQUE INDEX "DispenseLog_clientEventId_idx" ON "DispenseLog" USING btree ("clientEventId");