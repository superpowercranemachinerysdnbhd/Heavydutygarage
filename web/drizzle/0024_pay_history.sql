CREATE TABLE "staff_pay_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"effective_from" date NOT NULL,
	"monthly_salary" numeric(10, 2),
	"monthly_hours" numeric(6, 1),
	"hourly_rate" numeric(10, 4) NOT NULL,
	"note" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_pay_rates" ADD CONSTRAINT "staff_pay_rates_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_pay_rates" ADD CONSTRAINT "staff_pay_rates_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_pay_rates_staff_from_idx" ON "staff_pay_rates" USING btree ("staff_id","effective_from");--> statement-breakpoint
-- Everyone's current pay becomes the first entry of their history ("from the start").
INSERT INTO "staff_pay_rates" ("staff_id", "effective_from", "monthly_salary", "monthly_hours", "hourly_rate", "note")
SELECT "id", '2000-01-01', "monthly_salary", "monthly_hours", "pay_rate", 'Pay before the history was kept' FROM "staff"
ON CONFLICT DO NOTHING;
