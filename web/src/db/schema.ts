import {
  pgTable, pgEnum, serial, integer, text, varchar, boolean, date, timestamp, numeric, jsonb, uniqueIndex, index,
} from "drizzle-orm/pg-core";

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
  serialNo: varchar("serial_no", { length: 80 }).notNull(),
  engineNo: varchar("engine_no", { length: 80 }),
  plateNo: varchar("plate_no", { length: 30 }),
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
  category: jobCategoryEnum("category").notNull(),
  priority: priorityEnum("priority").notNull().default("normal"),
  status: jobStatusEnum("status").notNull().default("received"),
  statusSince: timestamp("status_since", { withTimezone: true }).notNull().defaultNow(),
  unitId: integer("unit_id").notNull().references(() => machineUnits.id),
  siteType: siteTypeEnum("site_type").notNull().default("workshop"),
  siteLocation: varchar("site_location", { length: 200 }).notNull(),
  complaint: text("complaint").notNull(),
  reportedBy: varchar("reported_by", { length: 120 }),
  diagnosis: text("diagnosis").notNull().default(""),
  recommendations: text("recommendations"),
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
