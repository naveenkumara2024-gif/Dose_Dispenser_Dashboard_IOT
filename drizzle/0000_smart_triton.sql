CREATE TYPE "public"."AlertType" AS ENUM('LOW_STOCK', 'MISSED_DOSE', 'STORAGE_CONDITION', 'DEVICE_OFFLINE');--> statement-breakpoint
CREATE TYPE "public"."DispenseStatus" AS ENUM('DISPENSED', 'CONFIRMED_TAKEN', 'MISSED');--> statement-breakpoint
CREATE TABLE "Alert" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "AlertType" NOT NULL,
	"message" text NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "DispenseLog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scheduleId" uuid NOT NULL,
	"status" "DispenseStatus" NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "EnvironmentLog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"temperature" double precision NOT NULL,
	"humidity" double precision NOT NULL,
	"alert" boolean DEFAULT false NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Medication" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"dosage" text NOT NULL,
	"compartmentNo" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Schedule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"medicationId" uuid NOT NULL,
	"time" text NOT NULL,
	"frequency" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "StockLevel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"compartmentNo" integer NOT NULL,
	"weight" double precision NOT NULL,
	"lastUpdated" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "DispenseLog" ADD CONSTRAINT "DispenseLog_scheduleId_Schedule_id_fk" FOREIGN KEY ("scheduleId") REFERENCES "public"."Schedule"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_medicationId_Medication_id_fk" FOREIGN KEY ("medicationId") REFERENCES "public"."Medication"("id") ON DELETE no action ON UPDATE no action;