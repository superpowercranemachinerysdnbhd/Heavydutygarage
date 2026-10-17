CREATE TABLE "app_settings" (
	"key" varchar(40) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "list_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"list" varchar(20) NOT NULL,
	"code" varchar(60) NOT NULL,
	"label" varchar(120),
	"grp" varchar(60),
	"color" varchar(30),
	"priority" "priority",
	"sort" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "category" SET DATA TYPE varchar(30) USING "category"::text;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_staff_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_updated_by_staff_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "list_items_list_code_idx" ON "list_items" USING btree ("list","code");