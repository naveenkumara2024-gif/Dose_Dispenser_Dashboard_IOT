CREATE TABLE "Device" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"lastSeenAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Schedule" ADD COLUMN "dayOfWeek" integer;--> statement-breakpoint
ALTER TABLE "Schedule" ADD COLUMN "active" boolean DEFAULT true NOT NULL;