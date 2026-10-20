ALTER TABLE "jobs" ADD COLUMN "invoice_status" varchar(10);--> statement-breakpoint
-- History from AppSheet: no reminders for old outsourced work orders that never had a vendor invoice recorded.
UPDATE "jobs" j SET "invoice_status" = 'none' WHERE j."source" = 'appsheet' AND j."outsourced"
  AND NOT EXISTS (SELECT 1 FROM "job_purchases" p WHERE p."job_id" = j."id" AND p."kind" = 'service');
