ALTER TABLE "job_purchases" ADD COLUMN "kind" varchar(10) DEFAULT 'part' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "outsourced" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "vendor_id" integer;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "vendor_ref" varchar(60);--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "sent_out_at" date;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "expected_back_at" date;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "back_at" date;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_vendor_id_suppliers_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- AppSheet work orders done by an outside workshop were imported with "Outsourced to: <name>" in the write-up.
-- The workshop is matched to a supplier ignoring case, spaces and punctuation, and a longer supplier name also matches
-- ("LST Supply" = "LST SUPPLY & TRADING"); a workshop with no supplier is added.
CREATE TEMP TABLE "_out" AS
SELECT j."id", v."name", regexp_replace(lower(v."name"), '[^a-z0-9]', '', 'g') AS "norm"
FROM "jobs" j, LATERAL (SELECT trim(split_part(substring(j."work_done" from 'Outsourced to: ([^\n]*)'), ',', 1)) AS "name") v
WHERE j."source" = 'appsheet' AND j."work_done" ~ 'Outsourced to: ' AND v."name" <> '';--> statement-breakpoint
INSERT INTO "suppliers" ("name", "notes")
SELECT DISTINCT ON (o."norm") o."name", 'Outside workshop (from the AppSheet import).' FROM "_out" o
WHERE NOT EXISTS (SELECT 1 FROM "suppliers" s WHERE regexp_replace(lower(s."name"), '[^a-z0-9]', '', 'g') LIKE o."norm" || '%');--> statement-breakpoint
UPDATE "jobs" j SET "outsourced" = true, "sent_out_at" = j."opened_at", "back_at" = j."closed_at",
  "vendor_id" = (SELECT s."id" FROM "suppliers" s WHERE regexp_replace(lower(s."name"), '[^a-z0-9]', '', 'g') LIKE o."norm" || '%'
    ORDER BY (regexp_replace(lower(s."name"), '[^a-z0-9]', '', 'g') = o."norm") DESC, s."active" DESC, s."id" LIMIT 1)
FROM "_out" o WHERE o."id" = j."id";--> statement-breakpoint
-- Their bills from that same workshop are outside work, not parts.
UPDATE "job_purchases" p SET "kind" = 'service' FROM "jobs" j
WHERE p."job_id" = j."id" AND j."outsourced" AND p."supplier_id" = j."vendor_id";--> statement-breakpoint
DROP TABLE "_out";
