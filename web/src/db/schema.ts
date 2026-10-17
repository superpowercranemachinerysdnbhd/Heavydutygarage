import {
  pgTable, pgEnum, serial, integer, text, varchar, boolean, date, timestamp, numeric, jsonb, uniqueIndex, index,
} from "drizzle-orm/pg-core";

import type { Status as JobStatus } from "@/lib/jobs";

export const roleEnum = pgEnum("role", ["boss", "supervisor", "mechanic", "assistant", "fabricator", "painter", "cleaner"]);
export const jobCategoryEnum = pgEnum("job_category", ["EMG", "DIAG", "PM", "MINOR", "MAJOR", "HYD", "FAB", "PAINT", "WARR"]);
export const jobStatusEnum = pgEnum("job_status", [
  "received", "diagnosing", "awaiting_approval", "awaiting_parts", "in_progress", "quality_check", "ready_for_pickup", "closed",
]);
export const priorityEnum = pgEnum("priority", ["critical", "high", "normal", "low"]);
export const siteTypeEnum = pgEnum("site_type", ["workshop", "field"]);
export const photoStageEnum = pgEnum("photo_stage", ["before", "during", "after", "qc"]);

/* ---------- people ---------- */
export const staff = pgTable("staff", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  role: roleEnum("role").notNull(),
  reportsTo: integer("reports_to"),
  phone: varchar("phone", { length: 30 }).notNull(),
  email: varchar("email", { length: 160 }),
  idNumber: varchar("id_number", { length: 40 }),
  permitExpiry: date("permit_expiry"),
  emergencyContact: text("emergency_contact"),
  joined: date("joined"),
  skills: text("skills").array().notNull().default([]),
  payRate: numeric("pay_rate", { precision: 10, scale: 2 }).notNull().default("0"),
  active: boolean("active").notNull().default(true),
  passwordHash: text("password_hash"),
  locale: varchar("locale", { length: 5 }).notNull().default("en"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("staff_phone_idx").on(t.phone)]);

export const certifications = pgTable("certifications", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 160 }).notNull(),
  number: varchar("number", { length: 80 }),
  expiry: date("expiry"),
});

export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  staffId: integer("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("sessions_token_idx").on(t.tokenHash)]);

/* ---------- customers & machines ---------- */
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  contactName: varchar("contact_name", { length: 120 }),
  phone: varchar("phone", { length: 30 }),
  email: varchar("email", { length: 160 }),
  address: text("address"),
  notes: text("notes"),
  locale: varchar("locale", { length: 5 }).notNull().default("en"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const machineModels = pgTable("machine_models", {
  id: serial("id").primaryKey(),
  make: varchar("make", { length: 80 }).notNull(),
  model: varchar("model", { length: 80 }).notNull(),
  type: varchar("type", { length: 80 }).notNull(),
  specs: jsonb("specs").$type<Record<string, string>>().notNull().default({}),
  serviceIntervals: integer("service_intervals").array().notNull().default([]),
});

export const knownIssues = pgTable("known_issues", {
  id: serial("id").primaryKey(),
  modelId: integer("model_id").notNull().references(() => machineModels.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }).notNull(),
  fix: text("fix").notNull(),
  addedBy: integer("added_by").references(() => staff.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const machineUnits = pgTable("machine_units", {
  id: serial("id").primaryKey(),
  modelId: integer("model_id").notNull().references(() => machineModels.id),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  /** Machine type key (see lib/machine-types). Falls back to the model's type for older records. */
  category: varchar("category", { length: 40 }),
  /** Plate number is the usual reference; machines without one are identified by serial number. At least one is required. */
  plateNo: varchar("plate_no", { length: 30 }),
  serialNo: varchar("serial_no", { length: 80 }),
  engineNo: varchar("engine_no", { length: 80 }),
  engineModel: varchar("engine_model", { length: 80 }),
  transmissionModel: varchar("transmission_model", { length: 80 }),
  pumpModel: varchar("pump_model", { length: 80 }),
  photoPath: varchar("photo_path", { length: 200 }),
  photoType: varchar("photo_type", { length: 40 }),
  year: integer("year"),
  hourMeter: integer("hour_meter").notNull().default(0),
  location: varchar("location", { length: 160 }).notNull().default("Customer site"),
  arrivedAt: date("arrived_at"),
  nextServiceDate: date("next_service_date"),
  nextServiceType: varchar("next_service_type", { length: 80 }),
  notes: text("notes"),
}, (t) => [index("units_customer_idx").on(t.customerId)]);

/* ---------- jobs ---------- */
export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  jobNo: varchar("job_no", { length: 20 }).notNull(),
  /** Job category code (built-in such as "EMG", or one added in Settings). */
  category: varchar("category", { length: 30 }).notNull(),
  priority: priorityEnum("priority").notNull().default("normal"),
  // The enum keeps two retired values (diagnosing, awaiting_approval) that no job uses since migration 0004.
  status: jobStatusEnum("status").$type<JobStatus>().notNull().default("received"),
  statusSince: timestamp("status_since", { withTimezone: true }).notNull().defaultNow(),
  unitId: integer("unit_id").notNull().references(() => machineUnits.id),
  siteType: siteTypeEnum("site_type").notNull().default("workshop"),
  siteLocation: varchar("site_location", { length: 200 }).notNull(),
  complaint: text("complaint").notNull(),
  reportedBy: varchar("reported_by", { length: 120 }),
  diagnosis: text("diagnosis").notNull().default(""),
  recommendations: text("recommendations"),
  /** What was done, written by the mechanic or supervisor; printed on the service report. */
  workDone: text("work_done").notNull().default(""),
  /** Internal follow-up / status remarks and when to follow up (shows on the dashboard when due). */
  followUp: text("follow_up"),
  followUpDate: date("follow_up_date"),
  leadId: integer("lead_id").references(() => staff.id),
  hourMeterIn: integer("hour_meter_in"),
  openedAt: date("opened_at").notNull(),
  dueDate: date("due_date").notNull(),
  closedAt: date("closed_at"),
  parentJobId: integer("parent_job_id"),
  signoffName: varchar("signoff_name", { length: 120 }),
  signoffHourMeter: integer("signoff_hour_meter"),
  signoffAt: timestamp("signoff_at", { withTimezone: true }),
  signoffBy: integer("signoff_by").references(() => staff.id),
  signaturePath: varchar("signature_path", { length: 200 }),
  createdBy: integer("created_by").references(() => staff.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("jobs_no_idx").on(t.jobNo), index("jobs_status_idx").on(t.status), index("jobs_unit_idx").on(t.unitId)]);

export const jobTeam = pgTable("job_team", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  staffId: integer("staff_id").notNull().references(() => staff.id),
}, (t) => [uniqueIndex("job_team_idx").on(t.jobId, t.staffId)]);

export const jobTasks = pgTable("job_tasks", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  seq: integer("seq").notNull().default(0),
  description: text("description").notNull(),
  assigneeId: integer("assignee_id").references(() => staff.id),
  doneAt: timestamp("done_at", { withTimezone: true }),
  doneBy: integer("done_by").references(() => staff.id),
});

export const jobQc = pgTable("job_qc", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  seq: integer("seq").notNull().default(0),
  item: text("item").notNull(),
  itemKey: varchar("item_key", { length: 40 }),
  passedAt: timestamp("passed_at", { withTimezone: true }),
  passedBy: integer("passed_by").references(() => staff.id),
});

export const labourEntries = pgTable("labour_entries", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  staffId: integer("staff_id").notNull().references(() => staff.id),
  workDate: date("work_date").notNull(),
  hours: numeric("hours", { precision: 6, scale: 2 }).notNull(),
  note: text("note"),
  loggedBy: integer("logged_by").references(() => staff.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobPhotos = pgTable("job_photos", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  stage: photoStageEnum("stage").notNull(),
  caption: text("caption"),
  path: varchar("path", { length: 200 }).notNull(),
  contentType: varchar("content_type", { length: 60 }).notNull(),
  takenBy: integer("taken_by").references(() => staff.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobActivity = pgTable("job_activity", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  staffId: integer("staff_id").references(() => staff.id),
  /** English rendering, kept for search and as a fallback. */
  text: text("text").notNull(),
  /** Message key (e.g. "act.status") and its parameters, rendered in each reader's language. */
  key: varchar("key", { length: 40 }),
  params: jsonb("params").$type<Record<string, string | number>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("activity_job_idx").on(t.jobId)]);

/* ======================= Phase 2: parts, suppliers, purchasing ======================= */
export const priceSourceEnum = pgEnum("price_source", ["quote", "po", "invoice", "import"]);
export const poStatusEnum = pgEnum("po_status", ["awaiting_approval", "ordered", "partially_received", "received", "cancelled"]);
export const movementTypeEnum = pgEnum("movement_type", ["receive", "issue", "return", "adjust"]);
export const requestStatusEnum = pgEnum("request_status", ["requested", "issued", "rejected"]);
export const pricingModeEnum = pgEnum("pricing_mode", ["markup", "fixed"]);

export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  contactName: varchar("contact_name", { length: 120 }),
  phone: varchar("phone", { length: 30 }),
  email: varchar("email", { length: 160 }),
  address: text("address"),
  paymentTerms: varchar("payment_terms", { length: 60 }),
  leadTimeDays: integer("lead_time_days"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const partCategories = pgTable("part_categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 80 }).notNull(),
  /** Selling price = average cost × (1 + markup%) for parts priced by markup. */
  markupPct: numeric("markup_pct", { precision: 6, scale: 2 }).notNull().default("40"),
  /** Boss is alerted when a fixed-price part's margin falls below this. */
  targetMarginPct: numeric("target_margin_pct", { precision: 6, scale: 2 }).notNull().default("25"),
}, (t) => [uniqueIndex("part_categories_name_idx").on(t.name)]);

export const parts = pgTable("parts", {
  id: serial("id").primaryKey(),
  sku: varchar("sku", { length: 60 }).notNull(),
  oemPartNo: varchar("oem_part_no", { length: 60 }),
  description: varchar("description", { length: 200 }).notNull(),
  categoryId: integer("category_id").notNull().references(() => partCategories.id),
  uom: varchar("uom", { length: 20 }).notNull().default("pc"),
  bin: varchar("bin", { length: 30 }),
  fitsAll: boolean("fits_all").notNull().default(false),
  onHand: numeric("on_hand", { precision: 12, scale: 2 }).notNull().default("0"),
  minLevel: numeric("min_level", { precision: 12, scale: 2 }).notNull().default("0"),
  reorderQty: numeric("reorder_qty", { precision: 12, scale: 2 }).notNull().default("0"),
  avgCost: numeric("avg_cost", { precision: 12, scale: 4 }).notNull().default("0"),
  lastCost: numeric("last_cost", { precision: 12, scale: 2 }),
  pricingMode: pricingModeEnum("pricing_mode").notNull().default("markup"),
  sellPrice: numeric("sell_price", { precision: 12, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("parts_sku_idx").on(t.sku), index("parts_oem_idx").on(t.oemPartNo)]);

export const partModels = pgTable("part_models", {
  id: serial("id").primaryKey(),
  partId: integer("part_id").notNull().references(() => parts.id, { onDelete: "cascade" }),
  modelId: integer("model_id").notNull().references(() => machineModels.id, { onDelete: "cascade" }),
}, (t) => [uniqueIndex("part_models_idx").on(t.partId, t.modelId)]);

/** A supplier's own code for one of our parts. */
export const supplierParts = pgTable("supplier_parts", {
  id: serial("id").primaryKey(),
  partId: integer("part_id").notNull().references(() => parts.id, { onDelete: "cascade" }),
  supplierId: integer("supplier_id").notNull().references(() => suppliers.id, { onDelete: "cascade" }),
  supplierPartNo: varchar("supplier_part_no", { length: 60 }),
}, (t) => [uniqueIndex("supplier_parts_idx").on(t.partId, t.supplierId)]);

/** Every price ever quoted or paid. Never updated: a new price is a new row. */
export const supplierPrices = pgTable("supplier_prices", {
  id: serial("id").primaryKey(),
  partId: integer("part_id").notNull().references(() => parts.id, { onDelete: "cascade" }),
  supplierId: integer("supplier_id").notNull().references(() => suppliers.id, { onDelete: "cascade" }),
  price: numeric("price", { precision: 12, scale: 2 }).notNull(),
  priceDate: date("price_date").notNull(),
  source: priceSourceEnum("source").notNull(),
  ref: varchar("ref", { length: 80 }),
  createdBy: integer("created_by").references(() => staff.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("supplier_prices_part_idx").on(t.partId, t.supplierId)]);

export const purchaseOrders = pgTable("purchase_orders", {
  id: serial("id").primaryKey(),
  poNo: varchar("po_no", { length: 20 }).notNull(),
  supplierId: integer("supplier_id").notNull().references(() => suppliers.id),
  status: poStatusEnum("status").notNull(),
  jobId: integer("job_id").references(() => jobs.id),
  orderDate: date("order_date").notNull(),
  eta: date("eta"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => staff.id),
  approvedBy: integer("approved_by").references(() => staff.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("po_no_idx").on(t.poNo), index("po_status_idx").on(t.status)]);

export const poLines = pgTable("po_lines", {
  id: serial("id").primaryKey(),
  poId: integer("po_id").notNull().references(() => purchaseOrders.id, { onDelete: "cascade" }),
  partId: integer("part_id").notNull().references(() => parts.id),
  qty: numeric("qty", { precision: 12, scale: 2 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  receivedQty: numeric("received_qty", { precision: 12, scale: 2 }).notNull().default("0"),
  supplierPartNo: varchar("supplier_part_no", { length: 60 }),
});

export const receipts = pgTable("receipts", {
  id: serial("id").primaryKey(),
  poId: integer("po_id").notNull().references(() => purchaseOrders.id),
  invoiceNo: varchar("invoice_no", { length: 60 }),
  receivedBy: integer("received_by").references(() => staff.id),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

export const receiptLines = pgTable("receipt_lines", {
  id: serial("id").primaryKey(),
  receiptId: integer("receipt_id").notNull().references(() => receipts.id, { onDelete: "cascade" }),
  poLineId: integer("po_line_id").notNull().references(() => poLines.id),
  qty: numeric("qty", { precision: 12, scale: 2 }).notNull(),
  poPrice: numeric("po_price", { precision: 12, scale: 2 }).notNull(),
  invoicePrice: numeric("invoice_price", { precision: 12, scale: 2 }).notNull(),
});

export const stockMovements = pgTable("stock_movements", {
  id: serial("id").primaryKey(),
  partId: integer("part_id").notNull().references(() => parts.id),
  type: movementTypeEnum("type").notNull(),
  qty: numeric("qty", { precision: 12, scale: 2 }).notNull(),
  unitCost: numeric("unit_cost", { precision: 12, scale: 4 }),
  balanceAfter: numeric("balance_after", { precision: 12, scale: 2 }).notNull(),
  poId: integer("po_id").references(() => purchaseOrders.id),
  jobId: integer("job_id").references(() => jobs.id),
  note: text("note"),
  staffId: integer("staff_id").references(() => staff.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("movements_part_idx").on(t.partId)]);

export const jobParts = pgTable("job_parts", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  partId: integer("part_id").notNull().references(() => parts.id),
  qty: numeric("qty", { precision: 12, scale: 2 }).notNull(),
  unitCost: numeric("unit_cost", { precision: 12, scale: 4 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  issuedBy: integer("issued_by").references(() => staff.id),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
});

export const partRequests = pgTable("part_requests", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  partId: integer("part_id").notNull().references(() => parts.id),
  qty: numeric("qty", { precision: 12, scale: 2 }).notNull(),
  note: text("note"),
  status: requestStatusEnum("status").notNull().default("requested"),
  requestedBy: integer("requested_by").references(() => staff.id),
  handledBy: integer("handled_by").references(() => staff.id),
  handledAt: timestamp("handled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("requests_status_idx").on(t.status)]);

/* ======================= Chat ======================= */
export const chatKindEnum = pgEnum("chat_kind", ["team", "direct", "job"]);

export const chatThreads = pgTable("chat_threads", {
  id: serial("id").primaryKey(),
  kind: chatKindEnum("kind").notNull(),
  jobId: integer("job_id").references(() => jobs.id, { onDelete: "cascade" }),
  /** For direct threads: "smallerId:largerId", so each pair has one thread. */
  directKey: varchar("direct_key", { length: 30 }),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("chat_job_idx").on(t.jobId), uniqueIndex("chat_direct_idx").on(t.directKey)]);

/** Members of direct threads. Team = all active staff; job = whoever can work on the job. */
export const chatMembers = pgTable("chat_members", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id").notNull().references(() => chatThreads.id, { onDelete: "cascade" }),
  staffId: integer("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
}, (t) => [uniqueIndex("chat_members_idx").on(t.threadId, t.staffId)]);

export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id").notNull().references(() => chatThreads.id, { onDelete: "cascade" }),
  staffId: integer("staff_id").notNull().references(() => staff.id),
  body: text("body").notNull().default(""),
  photoPath: varchar("photo_path", { length: 200 }),
  photoType: varchar("photo_type", { length: 60 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("chat_messages_thread_idx").on(t.threadId, t.id)]);

/** Last message each person has read in each thread. */
export const chatReads = pgTable("chat_reads", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id").notNull().references(() => chatThreads.id, { onDelete: "cascade" }),
  staffId: integer("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  lastReadId: integer("last_read_id").notNull().default(0),
}, (t) => [uniqueIndex("chat_reads_idx").on(t.threadId, t.staffId)]);

/* ---------- settings (Head Manager) ---------- */
/** Changes to the built-in lists and custom entries. See lib/lists for the built-ins. */
export const listItems = pgTable("list_items", {
  id: serial("id").primaryKey(),
  list: varchar("list", { length: 20 }).$type<"job_category" | "machine_type" | "bay" | "qc_item">().notNull(),
  code: varchar("code", { length: 60 }).notNull(),
  label: varchar("label", { length: 120 }),
  grp: varchar("grp", { length: 60 }),
  color: varchar("color", { length: 30 }),
  priority: priorityEnum("priority"),
  sort: integer("sort").notNull().default(0),
  active: boolean("active").notNull().default(true),
  updatedBy: integer("updated_by").references(() => staff.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("list_items_list_code_idx").on(t.list, t.code)]);

export const appSettings = pgTable("app_settings", {
  key: varchar("key", { length: 40 }).primaryKey(),
  value: text("value").notNull(),
  updatedBy: integer("updated_by").references(() => staff.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Parts bought from a supplier for one job (not stock): what was bought, from whom, cost and selling price. */
export const jobPurchases = pgTable("job_purchases", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  description: varchar("description", { length: 200 }).notNull(),
  partNo: varchar("part_no", { length: 60 }),
  supplierId: integer("supplier_id").references(() => suppliers.id),
  supplierName: varchar("supplier_name", { length: 160 }),
  qty: numeric("qty", { precision: 12, scale: 2 }).notNull(),
  uom: varchar("uom", { length: 20 }).notNull().default("pc"),
  unitCost: numeric("unit_cost", { precision: 12, scale: 2 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  ref: varchar("ref", { length: 60 }),
  purchasedAt: date("purchased_at").notNull(),
  addedBy: integer("added_by").references(() => staff.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("job_purchases_job_idx").on(t.jobId)]);
