ALTER TABLE "jobs" ADD COLUMN "title" varchar(120);--> statement-breakpoint
-- Work orders from AppSheet: their complaint starts with the AppSheet "work order title".
UPDATE "jobs" SET "title" = left(trim(split_part("complaint", E'\n', 1)), 120) WHERE "source" = 'appsheet' AND "title" IS NULL AND trim(split_part("complaint", E'\n', 1)) <> '';
