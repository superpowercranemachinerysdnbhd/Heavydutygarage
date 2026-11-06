ALTER TABLE "staff" ADD COLUMN "support_role" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Support staff are not counted in utilisation: the Supervisor, and Mega and Chin as asked (the Head Manager can change it per person).
UPDATE "staff" SET "support_role" = true WHERE "role" = 'supervisor' OR "name" ~* '\m(mega|chin)\M' OR EXISTS (SELECT 1 FROM unnest("aliases") a WHERE a ~* '\m(mega|chin)\M');
