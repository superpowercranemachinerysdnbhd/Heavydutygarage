CREATE TABLE "crew_plan" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"day" date NOT NULL,
	"kind" varchar(10) NOT NULL,
	"job_id" integer,
	"note" text,
	"updated_by" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"day" date PRIMARY KEY NOT NULL,
	"name" varchar(80) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crew_plan" ADD CONSTRAINT "crew_plan_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_plan" ADD CONSTRAINT "crew_plan_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_plan" ADD CONSTRAINT "crew_plan_updated_by_staff_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "crew_plan_staff_day_idx" ON "crew_plan" USING btree ("staff_id","day");--> statement-breakpoint
CREATE INDEX "crew_plan_day_idx" ON "crew_plan" USING btree ("day");