ALTER TABLE "jobs" ADD COLUMN "work_done" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "follow_up" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "follow_up_date" date;--> statement-breakpoint
-- Four stages: Quality Check goes back to In Progress; Ready counts as Completed.
UPDATE "jobs" SET "status" = 'in_progress' WHERE "status" = 'quality_check';--> statement-breakpoint
UPDATE "jobs" SET "status" = 'closed', "closed_at" = coalesce("closed_at", current_date) WHERE "status" = 'ready_for_pickup';
