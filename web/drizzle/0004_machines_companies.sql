ALTER TABLE "machine_units" ALTER COLUMN "serial_no" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "machine_units" ADD COLUMN "category" varchar(40);--> statement-breakpoint
ALTER TABLE "machine_units" ADD COLUMN "engine_model" varchar(80);--> statement-breakpoint
ALTER TABLE "machine_units" ADD COLUMN "transmission_model" varchar(80);--> statement-breakpoint
ALTER TABLE "machine_units" ADD COLUMN "pump_model" varchar(80);--> statement-breakpoint
ALTER TABLE "machine_units" ADD COLUMN "photo_path" varchar(200);--> statement-breakpoint
ALTER TABLE "machine_units" ADD COLUMN "photo_type" varchar(40);--> statement-breakpoint
-- Fewer job stages: Diagnosing becomes In Progress; Awaiting Approval goes back to Received.
UPDATE "jobs" SET "status" = 'in_progress' WHERE "status" = 'diagnosing';--> statement-breakpoint
UPDATE "jobs" SET "status" = 'received' WHERE "status" = 'awaiting_approval';
