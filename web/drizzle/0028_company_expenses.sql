CREATE TABLE "company_expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"category" varchar(30) NOT NULL,
	"description" varchar(200),
	"amount" numeric(12, 2) NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_expenses" ADD CONSTRAINT "company_expenses_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_expenses_day_idx" ON "company_expenses" USING btree ("day");