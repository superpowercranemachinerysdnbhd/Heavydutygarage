ALTER TABLE "customers" ADD COLUMN "locale" varchar(5) DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "job_activity" ADD COLUMN "key" varchar(40);--> statement-breakpoint
ALTER TABLE "job_activity" ADD COLUMN "params" jsonb;--> statement-breakpoint
ALTER TABLE "job_qc" ADD COLUMN "item_key" varchar(40);--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "locale" varchar(5) DEFAULT 'en' NOT NULL;--> statement-breakpoint
UPDATE "job_qc" SET "item_key" = 'EMG' WHERE "item_key" IS NULL AND "item" = 'Pressure / temperature readings recorded';
--> statement-breakpoint
UPDATE "job_qc" SET "item_key" = 'HYD' WHERE "item_key" IS NULL AND "item" = 'Pressure readings recorded against spec';
--> statement-breakpoint
UPDATE "job_qc" SET "item_key" = 'DIAG' WHERE "item_key" IS NULL AND "item" = 'Fault codes cleared and fault not returning';
--> statement-breakpoint
UPDATE "job_qc" SET "item_key" = 'PM' WHERE "item_key" IS NULL AND "item" = 'Service sticker fitted, next service hours noted';
--> statement-breakpoint
UPDATE "job_qc" SET "item_key" = 'FAB' WHERE "item_key" IS NULL AND "item" = 'Welds inspected, no cracks or undercut';
--> statement-breakpoint
UPDATE "job_qc" SET "item_key" = 'PAINT' WHERE "item_key" IS NULL AND "item" = 'Finish inspected, decals and load charts fitted';
--> statement-breakpoint
UPDATE "job_qc" SET "item_key" = 'MAJOR' WHERE "item_key" IS NULL AND "item" = 'Run-in completed, oil pressure recorded';
--> statement-breakpoint
UPDATE "job_qc" SET "item_key" = 'MINOR' WHERE "item_key" IS NULL AND "item" = 'Function test of repaired item';
--> statement-breakpoint
UPDATE "job_qc" SET "item_key" = 'WARR' WHERE "item_key" IS NULL AND "item" = 'Original fault confirmed fixed';
--> statement-breakpoint
UPDATE "job_qc" SET "item_key" = 'testRun' WHERE "item_key" IS NULL AND "item" = 'Test run under load';
--> statement-breakpoint
UPDATE "job_qc" SET "item_key" = 'leakCheck' WHERE "item_key" IS NULL AND "item" = 'Leak check after 30 min running';
--> statement-breakpoint
UPDATE "job_qc" SET "item_key" = 'allTasks' WHERE "item_key" IS NULL AND "item" = 'All tasks complete';
--> statement-breakpoint
UPDATE "job_qc" SET "item_key" = 'afterPhotos' WHERE "item_key" IS NULL AND "item" = 'After photos taken';
--> statement-breakpoint
UPDATE "job_qc" SET "item_key" = 'cleanUp' WHERE "item_key" IS NULL AND "item" = 'Tools and rags removed, machine cleaned';
