ALTER TYPE "public"."AlertType" ADD VALUE 'DEVICE_TILTED';--> statement-breakpoint
CREATE TABLE "TiltLog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tilted" boolean NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
