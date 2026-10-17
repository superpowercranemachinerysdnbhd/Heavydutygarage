CREATE TABLE "machine_services" (
	"id" serial PRIMARY KEY NOT NULL,
	"unit_id" integer NOT NULL,
	"item" varchar(60) NOT NULL,
	"interval_months" integer,
	"last_done" date,
	"next_due" date,
	"notes" text,
	"last_job_id" integer,
	"updated_by" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "list_items" ADD COLUMN "num" integer;--> statement-breakpoint
ALTER TABLE "machine_services" ADD CONSTRAINT "machine_services_unit_id_machine_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."machine_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_services" ADD CONSTRAINT "machine_services_last_job_id_jobs_id_fk" FOREIGN KEY ("last_job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_services" ADD CONSTRAINT "machine_services_updated_by_staff_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "machine_services_unit_item_idx" ON "machine_services" USING btree ("unit_id","item");--> statement-breakpoint
CREATE INDEX "machine_services_due_idx" ON "machine_services" USING btree ("next_due");