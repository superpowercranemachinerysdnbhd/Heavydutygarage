"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission, requireUser, type CurrentUser } from "@/lib/auth";
import { can, canWorkOnJob, LEAD_ROLES } from "@/lib/permissions";
import { BAYS, CATEGORY_KEYS, PRIORITIES, STATUSES, STATUS_LABEL, checkTransition, nextJobNo, qcTemplate, type Category, type Priority, type Status } from "@/lib/jobs";
import { today } from "@/lib/format";
import { addActivity } from "@/lib/queries";
import { ALLOWED_IMAGE_TYPES, MAX_PHOTO_BYTES, saveFile } from "@/lib/storage";

const { jobs, jobTeam } = schema;

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => { const v = Number(f.get(k)); return Number.isFinite(v) ? v : NaN; };

function back(jobId: number, msg?: { error?: string; ok?: string }): never {
  const q = msg?.error ? `?error=${encodeURIComponent(msg.error)}` : msg?.ok ? `?ok=${encodeURIComponent(msg.ok)}` : "";
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/");
  redirect(`/jobs/${jobId}${q}`);
}

/** Load the job and check the user may work on it. */
async function access(jobId: number, user: CurrentUser) {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job) throw new Error("Job not found.");
  const teamIds = (await db.select({ id: jobTeam.staffId }).from(jobTeam).where(eq(jobTeam.jobId, jobId))).map((r) => r.id);
  const onJob = job.leadId === user.id || teamIds.includes(user.id);
  if (!canWorkOnJob(user, { leadId: job.leadId, teamIds })) throw new Error("You can only update jobs you are working on.");
  return { job, teamIds, onJob };
}

async function ensureOnTeam(jobId: number, staffId: number, leadId: number | null) {
  if (staffId === leadId) return;
  await db.insert(jobTeam).values({ jobId, staffId }).onConflictDoNothing();
}

/* ---------- create ---------- */
export async function createJob(form: FormData) {
  const user = await requirePermission("job.create");
  const unitId = num(form, "unitId");
  const category = str(form, "category") as Category;
  const priority = str(form, "priority") as Priority;
  const siteType = str(form, "siteType") === "field" ? "field" : "workshop";
  const siteLocation = siteType === "field" ? str(form, "siteAddress") : str(form, "bay");
  const dueDate = str(form, "dueDate");
  const complaint = str(form, "complaint");
  const leadId = num(form, "leadId") || null;
  const hourMeter = num(form, "hourMeter");
  const parentNo = str(form, "parentJobNo");
  const fail = (e: string): never => redirect(`/jobs/new?error=${encodeURIComponent(e)}`);
  if (!unitId) fail("Choose the machine.");
  if (!CATEGORY_KEYS.includes(category) || !PRIORITIES.includes(priority)) fail("Choose a category and priority.");
  if (!siteLocation) fail(siteType === "field" ? "Enter the site address." : "Choose the bay.");
  if (siteType === "workshop" && !BAYS.includes(siteLocation)) fail("Choose a valid bay.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) fail("Set a target due date.");
  if (!complaint) fail("Enter the customer complaint.");

  const [unit] = await db.select().from(schema.machineUnits).where(eq(schema.machineUnits.id, unitId));
  if (!unit) fail("Machine not found.");
  let parentJobId: number | null = null;
  if (parentNo) {
    const [p] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.jobNo, parentNo.toUpperCase()));
    if (!p) fail(`Original job ${parentNo} not found.`);
    parentJobId = p.id;
  }
  if (leadId) {
    const [l] = await db.select({ role: schema.staff.role }).from(schema.staff).where(eq(schema.staff.id, leadId));
    if (!l || !LEAD_ROLES.includes(l.role)) fail("The lead must be a mechanic, fabricator or painter.");
  }

  const d = today();
  const id = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(4201)`);
    const existing = await tx.select({ no: jobs.jobNo }).from(jobs).where(sql`${jobs.jobNo} like ${`J-${d.slice(0, 4)}-%`}`);
    const jobNo = nextJobNo(Number(d.slice(0, 4)), existing.map((r) => r.no));
    const [row] = await tx.insert(jobs).values({
      jobNo, category, priority, status: leadId ? "diagnosing" : "received", unitId, siteType, siteLocation, complaint,
      reportedBy: str(form, "reportedBy") || null, leadId, hourMeterIn: Number.isFinite(hourMeter) && hourMeter > 0 ? hourMeter : unit.hourMeter,
      openedAt: d, dueDate, parentJobId, createdBy: user.id,
    }).returning({ id: jobs.id });
    await tx.insert(schema.jobQc).values(qcTemplate(category).map((item, i) => ({ jobId: row.id, seq: i, item })));
    await tx.insert(schema.jobActivity).values({ jobId: row.id, staffId: user.id, text: `Job ${jobNo} created by ${user.name}.` });
    const unitUpdate: Partial<typeof schema.machineUnits.$inferInsert> = {};
    if (Number.isFinite(hourMeter) && hourMeter > unit.hourMeter) unitUpdate.hourMeter = hourMeter;
    if (siteType === "workshop") { unitUpdate.location = `Workshop · ${siteLocation}`; if (!unit.arrivedAt) unitUpdate.arrivedAt = d; }
    if (Object.keys(unitUpdate).length) await tx.update(schema.machineUnits).set(unitUpdate).where(eq(schema.machineUnits.id, unitId));
    return row.id;
  });
  revalidatePath("/");
  redirect(`/jobs/${id}?ok=${encodeURIComponent("Job created.")}`);
}

/* ---------- status, people, details ---------- */
export async function setStatus(form: FormData) {
  const user = await requireUser();
  const jobId = num(form, "jobId"), to = str(form, "to") as Status;
  const { job, onJob } = await access(jobId, user);
  if (!STATUSES.includes(to)) back(jobId, { error: "Unknown status." });
  const qc = await db.select({ passedAt: schema.jobQc.passedAt }).from(schema.jobQc).where(eq(schema.jobQc.jobId, jobId));
  const openTasks = await db.select({ id: schema.jobTasks.id }).from(schema.jobTasks).where(and(eq(schema.jobTasks.jobId, jobId), sql`${schema.jobTasks.doneAt} is null`));
  const check = checkTransition({ role: user.role, from: job.status, to, isOnJob: onJob, qcTotal: qc.length, qcPassed: qc.filter((q) => q.passedAt).length, signedOff: !!job.signoffAt, tasksOpen: openTasks.length });
  if (!check.ok) back(jobId, { error: check.reason });
  await db.update(jobs).set({ status: to, statusSince: new Date(), ...(to === "closed" ? { closedAt: today() } : {}) }).where(eq(jobs.id, jobId));
  await addActivity(jobId, user.id, `Status ${STATUS_LABEL[job.status]} → ${STATUS_LABEL[to]} by ${user.name}.`);
  back(jobId, { ok: `Moved to ${STATUS_LABEL[to]}.` });
}

export async function assignLead(form: FormData) {
  const user = await requirePermission("job.assign");
  const jobId = num(form, "jobId"), leadId = num(form, "leadId") || null;
  const { job } = await access(jobId, user);
  let name = "nobody";
  if (leadId) {
    const [l] = await db.select({ name: schema.staff.name, role: schema.staff.role }).from(schema.staff).where(eq(schema.staff.id, leadId));
    if (!l || !LEAD_ROLES.includes(l.role)) back(jobId, { error: "The lead must be a mechanic, fabricator or painter." });
    name = l.name;
    await db.delete(jobTeam).where(and(eq(jobTeam.jobId, jobId), eq(jobTeam.staffId, leadId)));
  }
  await db.update(jobs).set({ leadId, ...(leadId && job.status === "received" ? { status: "diagnosing" as const, statusSince: new Date() } : {}) }).where(eq(jobs.id, jobId));
  await addActivity(jobId, user.id, `Lead set to ${name} by ${user.name}.${leadId && job.status === "received" ? " Status moved to Diagnosing." : ""}`);
  back(jobId, { ok: "Lead updated." });
}

export async function addTeamMember(form: FormData) {
  const user = await requirePermission("job.assign");
  const jobId = num(form, "jobId"), staffId = num(form, "staffId");
  const { job } = await access(jobId, user);
  const [s] = await db.select({ name: schema.staff.name }).from(schema.staff).where(eq(schema.staff.id, staffId));
  if (!s) back(jobId, { error: "Choose a person." });
  await ensureOnTeam(jobId, staffId, job.leadId);
  await addActivity(jobId, user.id, `${s.name} added to the team by ${user.name}.`);
  back(jobId);
}

export async function removeTeamMember(form: FormData) {
  const user = await requirePermission("job.assign");
  const jobId = num(form, "jobId"), staffId = num(form, "staffId");
  await access(jobId, user);
  const [s] = await db.select({ name: schema.staff.name }).from(schema.staff).where(eq(schema.staff.id, staffId));
  await db.delete(jobTeam).where(and(eq(jobTeam.jobId, jobId), eq(jobTeam.staffId, staffId)));
  await addActivity(jobId, user.id, `${s?.name ?? "Someone"} removed from the team by ${user.name}.`);
  back(jobId);
}

export async function updateDetails(form: FormData) {
  const user = await requirePermission("job.editDetails");
  const jobId = num(form, "jobId");
  await access(jobId, user);
  const category = str(form, "category") as Category, priority = str(form, "priority") as Priority, dueDate = str(form, "dueDate");
  const siteType = str(form, "siteType") === "field" ? "field" : "workshop";
  const siteLocation = siteType === "field" ? str(form, "siteAddress") : str(form, "bay");
  if (!CATEGORY_KEYS.includes(category) || !PRIORITIES.includes(priority) || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !siteLocation) back(jobId, { error: "Check the category, priority, due date and location." });
  await db.update(jobs).set({ category, priority, dueDate, siteType, siteLocation, complaint: str(form, "complaint") || undefined }).where(eq(jobs.id, jobId));
  await addActivity(jobId, user.id, `Job details updated by ${user.name}.`);
  back(jobId, { ok: "Details saved." });
}

export async function saveDiagnosis(form: FormData) {
  const user = await requireUser();
  const jobId = num(form, "jobId");
  await access(jobId, user);
  await db.update(jobs).set({ diagnosis: str(form, "diagnosis") }).where(eq(jobs.id, jobId));
  await addActivity(jobId, user.id, `Diagnosis updated by ${user.name}.`);
  back(jobId, { ok: "Diagnosis saved." });
}

/* ---------- tasks, QC, labour, notes ---------- */
export async function addTask(form: FormData) {
  const user = await requireUser();
  const jobId = num(form, "jobId"), description = str(form, "description");
  const { job } = await access(jobId, user);
  if (!description) back(jobId, { error: "Describe the task." });
  if (job.status === "closed") back(jobId, { error: "The job is closed." });
  const assigneeId = can(user.role, "job.assign") ? num(form, "assigneeId") || null : user.id;
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${schema.jobTasks.seq}), 0)` }).from(schema.jobTasks).where(eq(schema.jobTasks.jobId, jobId));
  await db.insert(schema.jobTasks).values({ jobId, description, assigneeId, seq: Number(max) + 1 });
  if (assigneeId) await ensureOnTeam(jobId, assigneeId, job.leadId);
  back(jobId);
}

export async function toggleTask(form: FormData) {
  const user = await requireUser();
  const jobId = num(form, "jobId"), taskId = num(form, "taskId");
  const { job } = await access(jobId, user);
  if (job.status === "closed") back(jobId, { error: "The job is closed." });
  const [t] = await db.select().from(schema.jobTasks).where(and(eq(schema.jobTasks.id, taskId), eq(schema.jobTasks.jobId, jobId)));
  if (!t) back(jobId, { error: "Task not found." });
  const done = !t.doneAt;
  await db.update(schema.jobTasks).set(done ? { doneAt: new Date(), doneBy: user.id } : { doneAt: null, doneBy: null }).where(eq(schema.jobTasks.id, taskId));
  await addActivity(jobId, user.id, `${done ? "Done" : "Reopened"}: ${t.description} (${user.name}).`);
  back(jobId);
}

export async function toggleQc(form: FormData) {
  const user = await requirePermission("job.qc");
  const jobId = num(form, "jobId"), qcId = num(form, "qcId");
  const { job } = await access(jobId, user);
  if (job.status !== "quality_check") back(jobId, { error: "QC can only be ticked while the job is in Quality Check." });
  const [q] = await db.select().from(schema.jobQc).where(and(eq(schema.jobQc.id, qcId), eq(schema.jobQc.jobId, jobId)));
  if (!q) back(jobId, { error: "QC item not found." });
  await db.update(schema.jobQc).set(q.passedAt ? { passedAt: null, passedBy: null } : { passedAt: new Date(), passedBy: user.id }).where(eq(schema.jobQc.id, qcId));
  const left = await db.select({ id: schema.jobQc.id }).from(schema.jobQc).where(and(eq(schema.jobQc.jobId, jobId), sql`${schema.jobQc.passedAt} is null`));
  if (!left.length) await addActivity(jobId, user.id, `QC checklist completed by ${user.name}.`);
  back(jobId);
}

export async function logLabour(form: FormData) {
  const user = await requireUser();
  const jobId = num(form, "jobId"), hours = num(form, "hours");
  const { job } = await access(jobId, user);
  const staffId = can(user.role, "job.assign") ? num(form, "staffId") : user.id;
  const workDate = str(form, "workDate") || today();
  if (!(hours > 0 && hours <= 24)) back(jobId, { error: "Enter hours between 0.25 and 24." });
  if (workDate > today()) back(jobId, { error: "Labour cannot be logged for a future date." });
  if (job.status === "closed") back(jobId, { error: "The job is closed." });
  const [s] = await db.select({ name: schema.staff.name }).from(schema.staff).where(eq(schema.staff.id, staffId));
  if (!s) back(jobId, { error: "Choose a person." });
  await db.insert(schema.labourEntries).values({ jobId, staffId, hours: String(hours), workDate, note: str(form, "note") || null, loggedBy: user.id });
  await ensureOnTeam(jobId, staffId, job.leadId);
  await addActivity(jobId, user.id, `${hours} h logged for ${s.name}.`);
  back(jobId, { ok: "Time logged." });
}

export async function addNote(form: FormData) {
  const user = await requireUser();
  const jobId = num(form, "jobId"), text = str(form, "text");
  await access(jobId, user);
  if (!text) back(jobId);
  await addActivity(jobId, user.id, `${text} — ${user.name}`);
  back(jobId);
}

/* ---------- photos ---------- */
export async function uploadPhotos(form: FormData) {
  const user = await requireUser();
  const jobId = num(form, "jobId");
  await access(jobId, user);
  const stage = str(form, "stage") as "before" | "during" | "after" | "qc";
  if (!["before", "during", "after", "qc"].includes(stage)) back(jobId, { error: "Choose before, during, after or QC." });
  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) back(jobId, { error: "Choose at least one photo." });
  for (const f of files) {
    const ext = ALLOWED_IMAGE_TYPES[f.type];
    if (!ext) back(jobId, { error: `${f.name} is not a JPG, PNG, WebP or HEIC photo.` });
    if (f.size > MAX_PHOTO_BYTES) back(jobId, { error: `${f.name} is larger than 10 MB.` });
  }
  const caption = str(form, "caption") || null;
  for (const f of files) {
    const path = await saveFile("photos", Buffer.from(await f.arrayBuffer()), ALLOWED_IMAGE_TYPES[f.type]);
    await db.insert(schema.jobPhotos).values({ jobId, stage, caption, path, contentType: f.type, takenBy: user.id });
  }
  await addActivity(jobId, user.id, `${files.length} ${stage} photo${files.length > 1 ? "s" : ""} added by ${user.name}.`);
  back(jobId, { ok: "Photos added." });
}

/* ---------- handover & report ---------- */
export async function handover(form: FormData) {
  const user = await requirePermission("job.handover");
  const jobId = num(form, "jobId");
  const { job } = await access(jobId, user);
  const name = str(form, "name"), hm = num(form, "hourMeter"), sig = str(form, "signature");
  if (job.status !== "ready_for_pickup") back(jobId, { error: "Handover is recorded when the job is Ready for Pickup." });
  if (!name || !(hm > 0)) back(jobId, { error: "Enter the customer's name and the hour meter reading." });
  const m = sig.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!m || m[1].length < 200) back(jobId, { error: "Ask the customer to sign in the box." });
  const png = Buffer.from(m[1], "base64");
  if (png.length > 2 * 1024 * 1024) back(jobId, { error: "Signature image is too large." });
  const signaturePath = await saveFile("signatures", png, "png");
  await db.transaction(async (tx) => {
    await tx.update(jobs).set({
      signoffName: name, signoffHourMeter: hm, signoffAt: new Date(), signoffBy: user.id, signaturePath,
      status: "closed", statusSince: new Date(), closedAt: today(),
    }).where(eq(jobs.id, jobId));
    const [unit] = await tx.select().from(schema.machineUnits).where(eq(schema.machineUnits.id, job.unitId));
    await tx.update(schema.machineUnits).set({ hourMeter: Math.max(unit.hourMeter, hm), location: "Customer site", arrivedAt: null }).where(eq(schema.machineUnits.id, job.unitId));
    await tx.insert(schema.jobActivity).values({ jobId, staffId: user.id, text: `Handed over to ${name} at ${hm.toLocaleString()} h. Customer signed. Job closed by ${user.name}.` });
  });
  back(jobId, { ok: "Handed over and closed. The final service report is ready." });
}

export async function saveRecommendations(form: FormData) {
  const user = await requirePermission("job.report");
  const jobId = num(form, "jobId");
  await access(jobId, user);
  await db.update(jobs).set({ recommendations: str(form, "recommendations") }).where(eq(jobs.id, jobId));
  revalidatePath(`/jobs/${jobId}/report`);
  redirect(`/jobs/${jobId}/report?${new URLSearchParams({ prices: str(form, "prices"), photos: str(form, "photos"), qc: str(form, "qc"), ok: "Recommendations saved." })}`);
}
