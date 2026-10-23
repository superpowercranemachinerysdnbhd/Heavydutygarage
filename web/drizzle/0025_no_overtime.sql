ALTER TABLE "staff" ADD COLUMN "no_overtime" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- The Supervisor is not paid overtime; overtime hours already logged for them cost the normal rate.
UPDATE "staff" SET "no_overtime" = true WHERE "role" = 'supervisor';--> statement-breakpoint
UPDATE "labour_entries" l SET "rate_mult" = 1 FROM "staff" s WHERE l."staff_id" = s."id" AND s."no_overtime" AND l."rate_type" = 'ot';
