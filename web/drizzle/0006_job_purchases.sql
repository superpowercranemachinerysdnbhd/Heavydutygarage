CREATE TABLE "job_purchases" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"description" varchar(200) NOT NULL,
	"part_no" varchar(60),
	"supplier_id" integer,
	"supplier_name" varchar(160),
	"qty" numeric(12, 2) NOT NULL,
	"uom" varchar(20) DEFAULT 'pc' NOT NULL,
	"unit_cost" numeric(12, 2) NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"ref" varchar(60),
	"purchased_at" date NOT NULL,
	"added_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_purchases" ADD CONSTRAINT "job_purchases_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_purchases" ADD CONSTRAINT "job_purchases_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_purchases" ADD CONSTRAINT "job_purchases_added_by_staff_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_purchases_job_idx" ON "job_purchases" USING btree ("job_id");