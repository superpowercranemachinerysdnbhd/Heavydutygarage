CREATE TYPE "public"."movement_type" AS ENUM('receive', 'issue', 'return', 'adjust');--> statement-breakpoint
CREATE TYPE "public"."po_status" AS ENUM('awaiting_approval', 'ordered', 'partially_received', 'received', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."price_source" AS ENUM('quote', 'po', 'invoice', 'import');--> statement-breakpoint
CREATE TYPE "public"."pricing_mode" AS ENUM('markup', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('requested', 'issued', 'rejected');--> statement-breakpoint
CREATE TABLE "job_parts" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"part_id" integer NOT NULL,
	"qty" numeric(12, 2) NOT NULL,
	"unit_cost" numeric(12, 4) NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"issued_by" integer,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "part_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(80) NOT NULL,
	"markup_pct" numeric(6, 2) DEFAULT '40' NOT NULL,
	"target_margin_pct" numeric(6, 2) DEFAULT '25' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "part_models" (
	"id" serial PRIMARY KEY NOT NULL,
	"part_id" integer NOT NULL,
	"model_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "part_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"part_id" integer NOT NULL,
	"qty" numeric(12, 2) NOT NULL,
	"note" text,
	"status" "request_status" DEFAULT 'requested' NOT NULL,
	"requested_by" integer,
	"handled_by" integer,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parts" (
	"id" serial PRIMARY KEY NOT NULL,
	"sku" varchar(60) NOT NULL,
	"oem_part_no" varchar(60),
	"description" varchar(200) NOT NULL,
	"category_id" integer NOT NULL,
	"uom" varchar(20) DEFAULT 'pc' NOT NULL,
	"bin" varchar(30),
	"fits_all" boolean DEFAULT false NOT NULL,
	"on_hand" numeric(12, 2) DEFAULT '0' NOT NULL,
	"min_level" numeric(12, 2) DEFAULT '0' NOT NULL,
	"reorder_qty" numeric(12, 2) DEFAULT '0' NOT NULL,
	"avg_cost" numeric(12, 4) DEFAULT '0' NOT NULL,
	"last_cost" numeric(12, 2),
	"pricing_mode" "pricing_mode" DEFAULT 'markup' NOT NULL,
	"sell_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "po_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"po_id" integer NOT NULL,
	"part_id" integer NOT NULL,
	"qty" numeric(12, 2) NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"received_qty" numeric(12, 2) DEFAULT '0' NOT NULL,
	"supplier_part_no" varchar(60)
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"po_no" varchar(20) NOT NULL,
	"supplier_id" integer NOT NULL,
	"status" "po_status" NOT NULL,
	"job_id" integer,
	"order_date" date NOT NULL,
	"eta" date,
	"notes" text,
	"created_by" integer,
	"approved_by" integer,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipt_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"receipt_id" integer NOT NULL,
	"po_line_id" integer NOT NULL,
	"qty" numeric(12, 2) NOT NULL,
	"po_price" numeric(12, 2) NOT NULL,
	"invoice_price" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" serial PRIMARY KEY NOT NULL,
	"po_id" integer NOT NULL,
	"invoice_no" varchar(60),
	"received_by" integer,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"part_id" integer NOT NULL,
	"type" "movement_type" NOT NULL,
	"qty" numeric(12, 2) NOT NULL,
	"unit_cost" numeric(12, 4),
	"balance_after" numeric(12, 2) NOT NULL,
	"po_id" integer,
	"job_id" integer,
	"note" text,
	"staff_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_parts" (
	"id" serial PRIMARY KEY NOT NULL,
	"part_id" integer NOT NULL,
	"supplier_id" integer NOT NULL,
	"supplier_part_no" varchar(60)
);
--> statement-breakpoint
CREATE TABLE "supplier_prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"part_id" integer NOT NULL,
	"supplier_id" integer NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"price_date" date NOT NULL,
	"source" "price_source" NOT NULL,
	"ref" varchar(80),
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"contact_name" varchar(120),
	"phone" varchar(30),
	"email" varchar(160),
	"address" text,
	"payment_terms" varchar(60),
	"lead_time_days" integer,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_parts" ADD CONSTRAINT "job_parts_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_parts" ADD CONSTRAINT "job_parts_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_parts" ADD CONSTRAINT "job_parts_issued_by_staff_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_models" ADD CONSTRAINT "part_models_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_models" ADD CONSTRAINT "part_models_model_id_machine_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."machine_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_requests" ADD CONSTRAINT "part_requests_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_requests" ADD CONSTRAINT "part_requests_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_requests" ADD CONSTRAINT "part_requests_requested_by_staff_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_requests" ADD CONSTRAINT "part_requests_handled_by_staff_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parts" ADD CONSTRAINT "parts_category_id_part_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."part_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_lines" ADD CONSTRAINT "po_lines_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_lines" ADD CONSTRAINT "po_lines_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_approved_by_staff_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_po_line_id_po_lines_id_fk" FOREIGN KEY ("po_line_id") REFERENCES "public"."po_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_received_by_staff_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_parts" ADD CONSTRAINT "supplier_parts_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_parts" ADD CONSTRAINT "supplier_parts_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_prices" ADD CONSTRAINT "supplier_prices_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_prices" ADD CONSTRAINT "supplier_prices_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_prices" ADD CONSTRAINT "supplier_prices_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "part_categories_name_idx" ON "part_categories" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "part_models_idx" ON "part_models" USING btree ("part_id","model_id");--> statement-breakpoint
CREATE INDEX "requests_status_idx" ON "part_requests" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "parts_sku_idx" ON "parts" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "parts_oem_idx" ON "parts" USING btree ("oem_part_no");--> statement-breakpoint
CREATE UNIQUE INDEX "po_no_idx" ON "purchase_orders" USING btree ("po_no");--> statement-breakpoint
CREATE INDEX "po_status_idx" ON "purchase_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "movements_part_idx" ON "stock_movements" USING btree ("part_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_parts_idx" ON "supplier_parts" USING btree ("part_id","supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_prices_part_idx" ON "supplier_prices" USING btree ("part_id","supplier_id");