ALTER TABLE "parts" ADD COLUMN "bulk" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "parts" ADD COLUMN "low_flagged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "parts" ADD COLUMN "low_flagged_by" integer;--> statement-breakpoint
ALTER TABLE "parts" ADD CONSTRAINT "parts_low_flagged_by_staff_id_fk" FOREIGN KEY ("low_flagged_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Liquids and things used off a roll or from a box are bulk / consumable to start with (the Head Manager can untick any).
UPDATE "parts" SET "bulk" = true WHERE "category_id" IN (SELECT "id" FROM "part_categories" WHERE "name" IN
  ('Oils, grease & lubricants', 'Coolant & fluids', 'Electrical, sensors & switches', 'Workshop consumables', 'Paint'));
