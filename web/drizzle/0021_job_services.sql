CREATE TABLE "job_services" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"item" varchar(60) NOT NULL,
	"done_on" date NOT NULL,
	"next_due" date,
	"recorded_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_services" ADD CONSTRAINT "job_services_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_services" ADD CONSTRAINT "job_services_recorded_by_staff_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_services_job_item_idx" ON "job_services" USING btree ("job_id","item");--> statement-breakpoint
-- Services already recorded on work orders (only the latest per machine and item was kept until now).
INSERT INTO "job_services" ("job_id", "item", "done_on", "next_due", "recorded_by")
SELECT "last_job_id", "item", "last_done", "next_due", "updated_by" FROM "machine_services"
WHERE "last_job_id" IS NOT NULL AND "last_done" IS NOT NULL
ON CONFLICT DO NOTHING;
