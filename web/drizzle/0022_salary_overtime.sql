ALTER TABLE "labour_entries" ADD COLUMN "rate_type" varchar(10) DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "labour_entries" ADD COLUMN "rate_mult" numeric(4, 2) DEFAULT '1' NOT NULL;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "monthly_salary" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "monthly_hours" numeric(6, 1) DEFAULT '195' NOT NULL;