CREATE TABLE "calendar_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"end_day" date,
	"time" varchar(5),
	"type" varchar(30) NOT NULL,
	"title" varchar(120) NOT NULL,
	"unit_id" integer,
	"customer_id" integer,
	"notes" text,
	"repeat_months" integer,
	"done_at" timestamp with time zone,
	"done_by" integer,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_unit_id_machine_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."machine_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_done_by_staff_id_fk" FOREIGN KEY ("done_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_events_day_idx" ON "calendar_events" USING btree ("day");--> statement-breakpoint
CREATE INDEX "calendar_events_unit_idx" ON "calendar_events" USING btree ("unit_id");