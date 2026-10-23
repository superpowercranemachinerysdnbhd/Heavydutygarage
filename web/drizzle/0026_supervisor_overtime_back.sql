-- The Supervisor is paid overtime like everyone else after all: undo 0025's "no overtime pay" and put the
-- overtime rate (Settings, default 1.5) back on the overtime hours already logged for supervisors.
UPDATE "staff" SET "no_overtime" = false WHERE "role" = 'supervisor';--> statement-breakpoint
UPDATE "labour_entries" l SET "rate_mult" = COALESCE((SELECT NULLIF("value", '')::numeric FROM "app_settings" WHERE "key" = 'otMultiplier'), 1.5)
FROM "staff" s WHERE l."staff_id" = s."id" AND s."role" = 'supervisor' AND l."rate_type" = 'ot';
