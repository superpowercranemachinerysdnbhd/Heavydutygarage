ALTER TABLE "jobs" ADD COLUMN "source" varchar(10) DEFAULT 'app' NOT NULL;--> statement-breakpoint
ALTER TABLE "machine_units" ADD COLUMN "report_token" varchar(32) DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 20) NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "units_report_token_idx" ON "machine_units" USING btree ("report_token");--> statement-breakpoint
UPDATE "jobs" SET "source" = 'appsheet' WHERE "job_no" LIKE 'AS-%';
