CREATE TYPE "public"."job_category" AS ENUM('EMG', 'DIAG', 'PM', 'MINOR', 'MAJOR', 'HYD', 'FAB', 'PAINT', 'WARR');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('received', 'diagnosing', 'awaiting_approval', 'awaiting_parts', 'in_progress', 'quality_check', 'ready_for_pickup', 'closed');--> statement-breakpoint
CREATE TYPE "public"."photo_stage" AS ENUM('before', 'during', 'after', 'qc');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('critical', 'high', 'normal', 'low');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('boss', 'supervisor', 'mechanic', 'assistant', 'fabricator', 'painter', 'cleaner');--> statement-breakpoint
CREATE TYPE "public"."site_type" AS ENUM('workshop', 'field');--> statement-breakpoint
CREATE TABLE "certifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"name" varchar(160) NOT NULL,
	"number" varchar(80),
	"expiry" date
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"contact_name" varchar(120),
	"phone" varchar(30),
	"email" varchar(160),
	"address" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_activity" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"staff_id" integer,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"stage" "photo_stage" NOT NULL,
	"caption" text,
	"path" varchar(200) NOT NULL,
	"content_type" varchar(60) NOT NULL,
	"taken_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_qc" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"seq" integer DEFAULT 0 NOT NULL,
	"item" text NOT NULL,
	"passed_at" timestamp with time zone,
	"passed_by" integer
);
--> statement-breakpoint
CREATE TABLE "job_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"seq" integer DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"assignee_id" integer,
	"done_at" timestamp with time zone,
	"done_by" integer
);
--> statement-breakpoint
CREATE TABLE "job_team" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"staff_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_no" varchar(20) NOT NULL,
	"category" "job_category" NOT NULL,
	"priority" "priority" DEFAULT 'normal' NOT NULL,
	"status" "job_status" DEFAULT 'received' NOT NULL,
	"status_since" timestamp with time zone DEFAULT now() NOT NULL,
	"unit_id" integer NOT NULL,
	"site_type" "site_type" DEFAULT 'workshop' NOT NULL,
	"site_location" varchar(200) NOT NULL,
	"complaint" text NOT NULL,
	"reported_by" varchar(120),
	"diagnosis" text DEFAULT '' NOT NULL,
	"recommendations" text,
	"lead_id" integer,
	"hour_meter_in" integer,
	"opened_at" date NOT NULL,
	"due_date" date NOT NULL,
	"closed_at" date,
	"parent_job_id" integer,
	"signoff_name" varchar(120),
	"signoff_hour_meter" integer,
	"signoff_at" timestamp with time zone,
	"signoff_by" integer,
	"signature_path" varchar(200),
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "known_issues" (
	"id" serial PRIMARY KEY NOT NULL,
	"model_id" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"fix" text NOT NULL,
	"added_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "labour_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"staff_id" integer NOT NULL,
	"work_date" date NOT NULL,
	"hours" numeric(6, 2) NOT NULL,
	"note" text,
	"logged_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "machine_models" (
	"id" serial PRIMARY KEY NOT NULL,
	"make" varchar(80) NOT NULL,
	"model" varchar(80) NOT NULL,
	"type" varchar(80) NOT NULL,
	"specs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"service_intervals" integer[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "machine_units" (
	"id" serial PRIMARY KEY NOT NULL,
	"model_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"serial_no" varchar(80) NOT NULL,
	"engine_no" varchar(80),
	"plate_no" varchar(30),
	"year" integer,
	"hour_meter" integer DEFAULT 0 NOT NULL,
	"location" varchar(160) DEFAULT 'Customer site' NOT NULL,
	"arrived_at" date,
	"next_service_date" date,
	"next_service_type" varchar(80),
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"staff_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"role" "role" NOT NULL,
	"reports_to" integer,
	"phone" varchar(30) NOT NULL,
	"email" varchar(160),
	"id_number" varchar(40),
	"permit_expiry" date,
	"emergency_contact" text,
	"joined" date,
	"skills" text[] DEFAULT '{}' NOT NULL,
	"pay_rate" numeric(10, 2) DEFAULT '0' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"password_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_activity" ADD CONSTRAINT "job_activity_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_activity" ADD CONSTRAINT "job_activity_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_photos" ADD CONSTRAINT "job_photos_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_photos" ADD CONSTRAINT "job_photos_taken_by_staff_id_fk" FOREIGN KEY ("taken_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_qc" ADD CONSTRAINT "job_qc_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_qc" ADD CONSTRAINT "job_qc_passed_by_staff_id_fk" FOREIGN KEY ("passed_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_tasks" ADD CONSTRAINT "job_tasks_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_tasks" ADD CONSTRAINT "job_tasks_assignee_id_staff_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_tasks" ADD CONSTRAINT "job_tasks_done_by_staff_id_fk" FOREIGN KEY ("done_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_team" ADD CONSTRAINT "job_team_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_team" ADD CONSTRAINT "job_team_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_unit_id_machine_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."machine_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_lead_id_staff_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_signoff_by_staff_id_fk" FOREIGN KEY ("signoff_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "known_issues" ADD CONSTRAINT "known_issues_model_id_machine_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."machine_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "known_issues" ADD CONSTRAINT "known_issues_added_by_staff_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labour_entries" ADD CONSTRAINT "labour_entries_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labour_entries" ADD CONSTRAINT "labour_entries_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labour_entries" ADD CONSTRAINT "labour_entries_logged_by_staff_id_fk" FOREIGN KEY ("logged_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_units" ADD CONSTRAINT "machine_units_model_id_machine_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."machine_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_units" ADD CONSTRAINT "machine_units_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_job_idx" ON "job_activity" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_team_idx" ON "job_team" USING btree ("job_id","staff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_no_idx" ON "jobs" USING btree ("job_no");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "jobs_unit_idx" ON "jobs" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "units_customer_idx" ON "machine_units" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_idx" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_phone_idx" ON "staff" USING btree ("phone");