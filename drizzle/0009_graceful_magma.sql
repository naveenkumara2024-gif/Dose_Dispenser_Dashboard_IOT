CREATE TYPE "public"."DeviceEventType" AS ENUM('PRESENCE_DETECTED', 'NO_PRESENCE', 'REMINDER', 'SERVO_ROTATED', 'PILL_DROP', 'NO_DROP', 'KNOCK', 'SHAKE');--> statement-breakpoint
ALTER TYPE "public"."AlertType" ADD VALUE 'DISPENSE_FAILED';--> statement-breakpoint
CREATE TABLE "DeviceEvent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "DeviceEventType" NOT NULL,
	"detail" text,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Device" ADD COLUMN "rssi" integer;--> statement-breakpoint
ALTER TABLE "Device" ADD COLUMN "uptimeS" integer;--> statement-breakpoint
ALTER TABLE "Device" ADD COLUMN "rtcDriftS" integer;