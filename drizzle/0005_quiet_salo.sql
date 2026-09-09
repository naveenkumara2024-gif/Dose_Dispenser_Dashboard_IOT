CREATE TABLE "StockLog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"compartmentNo" integer NOT NULL,
	"weight" double precision NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
