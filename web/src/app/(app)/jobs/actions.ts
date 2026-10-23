"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission, requireUser, type CurrentUser } from "@/lib/auth";
import { can, canWorkOnJob, LEAD_ROLES } from "@/lib/permissions";
import { PRIORITIES, STATUSES, checkTransition, nextJobNo, type Category, type Priority, type Status } from "@/lib/jobs";
import { today } from "@/lib/format";
import { addActivity } from "@/lib/queries";
import { jobMachine, notifyRoles, notifyStaff } from "@/lib/notify";
import { ALLOWED_IMAGE_TYPES, MAX_PHOTO_BYTES, deleteStoredFile, saveFile } from "@/lib/storage";
import { changeIssuedQty, issueToJob } from "@/lib/inventory";
import { supplierByName } from "@/lib/purchasing";
import { saveMachine } from "@/lib/machines";
import { bayCodes, findItem, isCategory, itemLabel, qcSuggestions, settings } from "@/lib/lists";
import { rateMultiplier, rateTypeFor, splitHours } from "@/lib/pay";
import { markServiceDone } from "@/lib/services";
import { ensureLists } from "@/lib/lists-server";
import { translator, type MessageKey, type Vars } from "@/i18n";
import { activityText, statusLabel } from "@/i18n/labels";

const { jobs, jobTeam } = schema;

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const atVendor = (name: string) => `At vendor · ${name}`.slice(0, 200);
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const num = (f: FormData, k: string) => { const v = Number(f.get(k)); return Number.isFinite(v) ? v : NaN; };

/** Return to the job page with a message in the user's language. */
function back(user: CurrentUser, jobId: number, msg?: { error?: MessageKey; ok?: MessageKey; vars?: Vars; hash?: string }): never {
  const t = translator(user.locale);
  const vars = { ...(msg?.vars ?? {}) };
  if (typeof vars.status === "string") vars.status = statusLabel(t, vars.status as Status);
  const q = msg?.error ? `?error=${encodeURIComponent(t(msg.error, vars))}` : msg?.ok ? `?ok=${encodeURIComponent(t(msg.ok, vars))}` : "";
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/");
  redirect(`/jobs/${jobId}${q}${msg?.hash ? `#${msg.hash}` : ""}`);
}

/** Load the job and check the user may work on it. */
async function access(jobId: number, user: CurrentUser) {
  const t = translator(user.locale);
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job) throw new Error(t("err.jobNotFound"));
  const teamIds = (await db.select({ id: jobTeam.staffId }).from(jobTeam).where(eq(jobTeam.jobId, jobId))).map((r) => r.id);
  const onJob = job.leadId === user.id || teamIds.includes(user.id);
  if (!canWorkOnJob(user, { leadId: job.leadId, teamIds })) throw new Error(t("err.notOnJob"));
  return { job, teamIds, onJob };
}

async function ensureOnTeam(jobId: number, staffId: number, leadId: number | null) {
  if (staffId === leadId) return;
  await db.insert(jobTeam).values({ jobId, staffId }).onConflictDoNothing();
}

/** Where the job is done: the "where" list (a bay/area, or outside with an address). Older forms send siteType + bay. */
function locationFrom(form: FormData): { siteType: "workshop" | "field"; siteLocation: string } {
  const where = str(form, "where");
  // "__tbd": not decided yet, stored as a workshop job with no bay.
  if (where === "__tbd") return { siteType: "workshop", siteLocation: "" };
  if (where) return where === "__outside" ? { siteType: "field", siteLocation: str(form, "siteAddress") } : { siteType: "workshop", siteLocation: where };
  const siteType = str(form, "siteType") === "field" ? "field" : "workshop";
  return { siteType, siteLocation: siteType === "field" ? str(form, "siteAddress") : str(form, "bay") };
}

/** "Who does the work" fields: our crew, or an outside workshop / supplier (typed or picked; a new name is added to Suppliers). */
async function outsourceFrom(form: FormData): Promise<{ error: MessageKey } | { outsourced: false } | {
  outsourced: true; vendorId: number; vendorName: string; vendorRef: string | null; sentOutAt: string; expectedBackAt: string | null }> {
  if (str(form, "doneBy") !== "vendor") return { outsourced: false };
  const sent = str(form, "sentOutAt") || today(), back = str(form, "expectedBackAt");
  if (!isDate(sent) || sent > today() || (back && (!isDate(back) || back < sent))) return { error: "out.err.dates" };
  if (!str(form, "vendorName")) return { error: "out.err.vendor" };
  const v = (await supplierByName(str(form, "vendorName")))!;
  return { outsourced: true, vendorId: v.id, vendorName: v.name, vendorRef: str(form, "vendorRef").slice(0, 60) || null, sentOutAt: sent, expectedBackAt: back || null };
}

/** Photos attached to a form, checked; an error key if one is not acceptable. */
function photosFrom(form: FormData): { files: File[] } | { error: MessageKey; vars: Vars } {
  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  for (const f of files) {
    if (!ALLOWED_IMAGE_TYPES[f.type]) return { error: "err.photoType", vars: { file: f.name } };
    if (f.size > MAX_PHOTO_BYTES) return { error: "err.photoSize", vars: { file: f.name } };
  }
  return { files };
}

async function savePhotos(jobId: number, userId: number, files: File[], stage: "before" | "during" | "after" | "qc", caption: string | null) {
  for (const f of files) {
    const path = await saveFile("photos", Buffer.from(await f.arrayBuffer()), ALLOWED_IMAGE_TYPES[f.type]);
    await db.insert(schema.jobPhotos).values({ jobId, stage, caption, path, contentType: f.type, takenBy: userId });
  }
}

/* ---------- create ---------- */
export async function createJob(form: FormData) {
  const user = await requirePermission("job.create");
  const t = translator(user.locale);
  const newMachine = str(form, "machineMode") === "new";
  let unitId = newMachine ? 0 : num(form, "unitId");
  const category = str(form, "category") as Category;
  const priority = str(form, "priority") as Priority;
  const { siteType, siteLocation } = locationFrom(form);
  const dueDate = str(form, "dueDate");
  const openedAt = str(form, "openedAt") || today();
  const complaint = str(form, "complaint");
  const leadId = num(form, "leadId") || null;
  const hourMeter = num(form, "hourMeter");
  const parentNo = str(form, "parentJobNo");
  const fail = (e: MessageKey, vars?: Vars): never => redirect(`/jobs/new?error=${encodeURIComponent(t(e, vars))}`);
  if (!newMachine && !unitId) fail("err.chooseMachine");
  await ensureLists();
  if (!isCategory(category) || !PRIORITIES.includes(priority)) fail("err.catPri");
  if (!siteLocation && siteType === "field") fail("err.siteAddress");
  if (siteType === "workshop" && siteLocation && !bayCodes().includes(siteLocation)) fail("err.bay");
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) fail("err.due");
  if (!isDate(openedAt) || openedAt > today()) fail("err.reportedDate");
  if (!complaint) fail("err.complaint");
  const before = photosFrom(form);
  if ("error" in before) fail(before.error, before.vars);
  const outR = await outsourceFrom(form);
  const out = "error" in outR ? fail(outR.error) : outR;

  let parentJobId: number | null = null;
  if (parentNo) {
    const [p] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.jobNo, parentNo.toUpperCase()));
    if (!p) fail("err.parentNotFound", { no: parentNo });
    parentJobId = p.id;
  }
  if (leadId) {
    const [l] = await db.select({ role: schema.staff.role }).from(schema.staff).where(eq(schema.staff.id, leadId));
    if (!l || !LEAD_ROLES.includes(l.role)) fail("err.leadRole");
  }
  // New machine (and new company) entered on this form: save it first, after the job fields have been checked.
  if (newMachine) {
    const saved = await saveMachine(form);
    if (!saved.ok) fail(saved.error);
    else unitId = saved.id;
  }
  const [unit] = await db.select().from(schema.machineUnits).where(eq(schema.machineUnits.id, unitId));
  if (!unit) fail("err.machineNotFound");

  const d = openedAt; // a late entry keeps its real reported date (and that year's job number)
  const en = translator("en");
  const id = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(4201)`);
    const existing = await tx.select({ no: jobs.jobNo }).from(jobs).where(sql`${jobs.jobNo} like ${`J-${d.slice(0, 4)}-%`}`);
    const jobNo = nextJobNo(Number(d.slice(0, 4)), existing.map((r) => r.no));
    const [row] = await tx.insert(jobs).values({
      jobNo, category, priority, status: form.get("deferred") === "on" ? "deferred" : "received", unitId, siteType, siteLocation, complaint,
      reportedBy: str(form, "reportedBy") || null, leadId, hourMeterIn: Number.isFinite(hourMeter) && hourMeter > 0 ? hourMeter : unit.hourMeter,
      openedAt: d, dueDate: dueDate || null, parentJobId, createdBy: user.id,
      ...(out.outsourced ? { outsourced: true, vendorId: out.vendorId, vendorRef: out.vendorRef, sentOutAt: out.sentOutAt, expectedBackAt: out.expectedBackAt } : {}),
    }).returning({ id: jobs.id });
    // Quality checks are chosen per job on the job page (suggestions come from Settings).
    const params = { no: jobNo, name: user.name };
    await tx.insert(schema.jobActivity).values({ jobId: row.id, staffId: user.id, key: "act.created", params, text: activityText(en, { key: "act.created", params, text: "" }) });
    const unitUpdate: Partial<typeof schema.machineUnits.$inferInsert> = {};
    if (Number.isFinite(hourMeter) && hourMeter > unit.hourMeter) unitUpdate.hourMeter = hourMeter;
    if (siteType === "workshop" && siteLocation) { unitUpdate.location = `Workshop · ${siteLocation}`; if (!unit.arrivedAt) unitUpdate.arrivedAt = d; }
    if (out.outsourced) unitUpdate.location = atVendor(out.vendorName);
    if (Object.keys(unitUpdate).length) await tx.update(schema.machineUnits).set(unitUpdate).where(eq(schema.machineUnits.id, unitId));
    return row.id;
  });
  if ("files" in before && before.files.length) {
    await savePhotos(id, user.id, before.files, "before", null);
    await addActivity(id, user.id, "act.photos", { count: before.files.length, stage: "before", name: user.name });
  }
  const machine = await jobMachine(id);
  if (leadId) await notifyStaff([leadId], { key: "nt.assigned", vars: { machine, name: user.name }, url: `/jobs/${id}` }, user.id);
  if (category === "EMG" || priority === "critical") await notifyRoles(["boss", "supervisor"], { key: "nt.emergency", vars: { machine, name: user.name }, url: `/jobs/${id}`, urgent: true }, user.id);
  revalidatePath("/");
  redirect(`/jobs/${id}?ok=${encodeURIComponent(t("ok.jobCreated"))}`);
}

/* ---------- status, people, details ---------- */
export async function setStatus(form: FormData) {
  const user = await requireUser();
  const jobId = num(form, "jobId"), to = str(form, "to") as Status;
  const { job, onJob } = await access(jobId, user);
  if (!STATUSES.includes(to)) back(user, jobId, { error: "err.unknownStatus" });
  const qc = await db.select({ passedAt: schema.jobQc.passedAt }).from(schema.jobQc).where(eq(schema.jobQc.jobId, jobId));
  const openTasks = await db.select({ id: schema.jobTasks.id }).from(schema.jobTasks).where(and(eq(schema.jobTasks.jobId, jobId), sql`${schema.jobTasks.doneAt} is null`));
  const check = checkTransition({ role: user.role, from: job.status, to, isOnJob: onJob, qcTotal: qc.length, qcPassed: qc.filter((q) => q.passedAt).length, signedOff: !!job.signoffAt, tasksOpen: openTasks.length });
  if (!check.ok) back(user, jobId, { error: check.reason, vars: check.vars });
  // Completion date: today, or an earlier day (not before the reported date) when the work order is entered late.
  const closedOn = str(form, "closedAt") || today();
  if (to === "closed" && (!isDate(closedOn) || closedOn > today() || closedOn < job.openedAt)) back(user, jobId, { error: "err.closedDate" });
  await db.update(jobs).set({ status: to, statusSince: new Date(), ...(to === "closed" ? { closedAt: closedOn } : {}) }).where(eq(jobs.id, jobId));
  await addActivity(jobId, user.id, "act.status", { from: job.status, to, name: user.name });
  if (!can(user.role, "job.anyStatus") && (to === "awaiting_parts" || to === "closed"))
    await notifyRoles(["supervisor"], { key: to === "closed" ? "nt.done" : "nt.waitingParts", vars: { machine: await jobMachine(jobId), name: user.name }, url: `/jobs/${jobId}` }, user.id);
  back(user, jobId, { ok: "ok.movedTo", vars: { status: to } });
}

export async function assignLead(form: FormData) {
  const user = await requirePermission("job.assign");
  const jobId = num(form, "jobId"), leadId = num(form, "leadId") || null;
  const { job } = await access(jobId, user);
  if (leadId) {
    const [l] = await db.select({ name: schema.staff.name, role: schema.staff.role }).from(schema.staff).where(eq(schema.staff.id, leadId));
    if (!l || !LEAD_ROLES.includes(l.role)) back(user, jobId, { error: "err.leadRole" });
    await db.delete(jobTeam).where(and(eq(jobTeam.jobId, jobId), eq(jobTeam.staffId, leadId)));
    await db.update(jobs).set({ leadId }).where(eq(jobs.id, jobId));
    await addActivity(jobId, user.id, "act.lead", { lead: l.name, name: user.name });
    await notifyStaff([leadId], { key: "nt.assigned", vars: { machine: await jobMachine(jobId), name: user.name }, url: `/jobs/${jobId}` }, user.id);
  } else {
    await db.update(jobs).set({ leadId: null }).where(eq(jobs.id, jobId));
    await addActivity(jobId, user.id, "act.leadNone", { name: user.name });
  }
  back(user, jobId, { ok: "ok.leadUpdated" });
}

export async function addTeamMember(form: FormData) {
  const user = await requirePermission("job.assign");
  const jobId = num(form, "jobId"), staffId = num(form, "staffId");
  const { job } = await access(jobId, user);
  const [s] = await db.select({ name: schema.staff.name }).from(schema.staff).where(eq(schema.staff.id, staffId));
  if (!s) back(user, jobId, { error: "err.choosePerson" });
  await ensureOnTeam(jobId, staffId, job.leadId);
  await addActivity(jobId, user.id, "act.teamAdd", { who: s.name, name: user.name });
  await notifyStaff([staffId], { key: "nt.assigned", vars: { machine: await jobMachine(jobId), name: user.name }, url: `/jobs/${jobId}` }, user.id);
  back(user, jobId);
}

export async function removeTeamMember(form: FormData) {
  const user = await requirePermission("job.assign");
  const jobId = num(form, "jobId"), staffId = num(form, "staffId");
  await access(jobId, user);
  const [s] = await db.select({ name: schema.staff.name }).from(schema.staff).where(eq(schema.staff.id, staffId));
  await db.delete(jobTeam).where(and(eq(jobTeam.jobId, jobId), eq(jobTeam.staffId, staffId)));
  await addActivity(jobId, user.id, "act.teamRemove", { who: s?.name ?? "?", name: user.name });
  back(user, jobId);
}

export async function updateDetails(form: FormData) {
  const user = await requirePermission("job.editDetails");
  const jobId = num(form, "jobId");
  const { job } = await access(jobId, user);
  await ensureLists();
  const t = translator(user.locale);
  const fail = (e: MessageKey): never => redirect(`/jobs/${jobId}/edit?error=${encodeURIComponent(t(e))}`);
  const category = str(form, "category") as Category, priority = str(form, "priority") as Priority, dueDate = str(form, "dueDate");
  const { siteType, siteLocation } = locationFrom(form);
  const hm = str(form, "hourMeterIn");
  if (!(isCategory(category) || category === job.category) || !PRIORITIES.includes(priority)) fail("err.catPri");
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) fail("err.due");
  if (!siteLocation && siteType === "field") fail("err.siteAddress");
  if (siteType === "workshop" && siteLocation && !bayCodes().includes(siteLocation) && siteLocation !== job.siteLocation) fail("err.bay");
  const complaint = str(form, "complaint");
  if (!complaint) fail("err.complaint");
  if (hm && !(Number.isInteger(Number(hm)) && Number(hm) >= 0)) fail("err.yearHm");
  const openedAt = str(form, "openedAt") || job.openedAt, closedAt = str(form, "closedAt") || job.closedAt;
  if (!isDate(openedAt) || openedAt > today()) fail("err.reportedDate");
  if (job.status === "closed" && closedAt && (!isDate(closedAt) || closedAt > today() || closedAt < openedAt)) fail("err.closedDate");
  const outR = await outsourceFrom(form);
  const out = "error" in outR ? fail(outR.error) : outR;
  const backAt = out.outsourced ? str(form, "backAt") || null : null;
  if (backAt && (!isDate(backAt) || backAt > today() || (out.outsourced && backAt < out.sentOutAt))) fail("out.err.dates");
  await db.update(jobs).set({
    category, priority, dueDate: dueDate || null, siteType, siteLocation, complaint, openedAt, ...(job.status === "closed" ? { closedAt } : {}),
    ...(out.outsourced
      ? { outsourced: true, vendorId: out.vendorId, vendorRef: out.vendorRef, sentOutAt: out.sentOutAt, expectedBackAt: out.expectedBackAt, backAt }
      : { outsourced: false, vendorId: null, vendorRef: null, sentOutAt: null, expectedBackAt: null, backAt: null }),
    reportedBy: str(form, "reportedBy") || null, ...(hm ? { hourMeterIn: Number(hm) } : {}),
  }).where(eq(jobs.id, jobId));
  if (siteType === "workshop" && siteLocation && siteLocation !== job.siteLocation) {
    await db.update(schema.machineUnits).set({ location: `Workshop · ${siteLocation}` }).where(eq(schema.machineUnits.id, job.unitId));
  }
  // Sent to a vendor now (and not back yet): the machine is at the vendor.
  if (out.outsourced && !backAt && job.status !== "closed" && (!job.outsourced || job.vendorId !== out.vendorId || job.backAt)) {
    await db.update(schema.machineUnits).set({ location: atVendor(out.vendorName) }).where(eq(schema.machineUnits.id, job.unitId));
  }
  await addActivity(jobId, user.id, "act.details", { name: user.name });
  back(user, jobId, { ok: "ok.detailsSaved" });
}

/** The job write-up: diagnosis, work carried out, recommendations to the customer and internal follow-up.
 *  Anyone on the job while it is open; the Head Manager and Supervisor also after it is completed. */
export async function saveWriteup(form: FormData) {
  const user = await requireUser();
  const jobId = num(form, "jobId");
  const { job } = await access(jobId, user);
  if (job.status === "closed" && !can(user.role, "job.editDetails")) back(user, jobId, { error: "err.jobClosed", hash: "writeup" });
  const fu = str(form, "followUpDate");
  await db.update(jobs).set({
    diagnosis: str(form, "diagnosis"), workDone: str(form, "workDone"), recommendations: str(form, "recommendations") || null,
    followUp: str(form, "followUp") || null, followUpDate: /^\d{4}-\d{2}-\d{2}$/.test(fu) && str(form, "followUp") ? fu : null,
  }).where(eq(jobs.id, jobId));
  await addActivity(jobId, user.id, "act.writeup", { name: user.name });
  back(user, jobId, { ok: "ok.writeupSaved", hash: "writeup" });
}

/** Reopen a completed job (Head Manager or Supervisor), e.g. to add work or parts. */
export async function reopenJob(form: FormData) {
  const user = await requirePermission("job.anyStatus");
  const jobId = num(form, "jobId");
  const { job } = await access(jobId, user);
  if (job.status !== "closed") back(user, jobId);
  await db.update(jobs).set({ status: "in_progress", statusSince: new Date(), closedAt: null }).where(eq(jobs.id, jobId));
  await addActivity(jobId, user.id, "act.reopened", { name: user.name });
  back(user, jobId, { ok: "ok.reopened" });
}

export async function saveDiagnosis(form: FormData) {
  const user = await requireUser();
  const jobId = num(form, "jobId");
  await access(jobId, user);
  await db.update(jobs).set({ diagnosis: str(form, "diagnosis") }).where(eq(jobs.id, jobId));
  await addActivity(jobId, user.id, "act.diagnosis", { name: user.name });
  back(user, jobId, { ok: "ok.diagnosisSaved" });
}

/* ---------- tasks, QC, labour, notes ---------- */
export async function addTask(form: FormData) {
  const user = await requireUser();
  const jobId = num(form, "jobId"), description = str(form, "description");
  const { job } = await access(jobId, user);
  if (!description) back(user, jobId, { error: "err.taskDesc" });
  if (job.status === "closed") back(user, jobId, { error: "err.jobClosed" });
  const assigneeId = can(user.role, "job.assign") ? num(form, "assigneeId") || null : user.id;
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${schema.jobTasks.seq}), 0)` }).from(schema.jobTasks).where(eq(schema.jobTasks.jobId, jobId));
  await db.insert(schema.jobTasks).values({ jobId, description, assigneeId, seq: Number(max) + 1 });
  if (assigneeId) await ensureOnTeam(jobId, assigneeId, job.leadId);
  back(user, jobId);
}

export async function toggleTask(form: FormData) {
  const user = await requireUser();
  const jobId = num(form, "jobId"), taskId = num(form, "taskId");
  const { job } = await access(jobId, user);
  if (job.status === "closed") back(user, jobId, { error: "err.jobClosed" });
  const [t] = await db.select().from(schema.jobTasks).where(and(eq(schema.jobTasks.id, taskId), eq(schema.jobTasks.jobId, jobId)));
  if (!t) back(user, jobId, { error: "err.taskNotFound" });
  const done = !t.doneAt;
  await db.update(schema.jobTasks).set(done ? { doneAt: new Date(), doneBy: user.id } : { doneAt: null, doneBy: null }).where(eq(schema.jobTasks.id, taskId));
  await addActivity(jobId, user.id, done ? "act.taskDone" : "act.taskReopen", { task: t.description, name: user.name });
  back(user, jobId);
}

/** A task the user may change: Supervisor / Head Manager any task; crew the tasks assigned to them. Open work orders only. */
async function editableTask(user: CurrentUser, form: FormData) {
  const jobId = num(form, "jobId"), taskId = num(form, "taskId");
  const { job } = await access(jobId, user);
  if (job.status === "closed") back(user, jobId, { error: "err.jobClosed" });
  const [task] = await db.select().from(schema.jobTasks).where(and(eq(schema.jobTasks.id, taskId), eq(schema.jobTasks.jobId, jobId)));
  if (!task) back(user, jobId, { error: "err.taskNotFound" });
  if (!can(user.role, "job.assign") && task.assigneeId !== user.id) back(user, jobId, { error: "err.notOnJob" });
  return { job, task };
}

export async function updateTask(form: FormData) {
  const user = await requireUser();
  const { job, task } = await editableTask(user, form);
  const description = str(form, "description");
  if (!description) back(user, job.id, { error: "err.taskDesc" });
  const assigneeId = can(user.role, "job.assign") ? num(form, "assigneeId") || null : task.assigneeId;
  await db.update(schema.jobTasks).set({ description, assigneeId }).where(eq(schema.jobTasks.id, task.id));
  if (assigneeId && assigneeId !== task.assigneeId) await ensureOnTeam(job.id, assigneeId, job.leadId);
  if (description !== task.description) await addActivity(job.id, user.id, "act.taskEdited", { from: task.description, task: description, name: user.name });
  back(user, job.id, { ok: "task.saved" });
}

export async function removeTask(form: FormData) {
  const user = await requireUser();
  const { job, task } = await editableTask(user, form);
  await db.delete(schema.jobTasks).where(eq(schema.jobTasks.id, task.id));
  await addActivity(job.id, user.id, "act.taskRemoved", { task: task.description, name: user.name });
  back(user, job.id, { ok: "task.removed" });
}

export async function toggleQc(form: FormData) {
  const user = await requirePermission("job.qc");
  const jobId = num(form, "jobId"), qcId = num(form, "qcId");
  const { job } = await access(jobId, user);
  if (job.status === "closed") back(user, jobId, { error: "err.jobClosed", hash: "qc" });
  const [q] = await db.select().from(schema.jobQc).where(and(eq(schema.jobQc.id, qcId), eq(schema.jobQc.jobId, jobId)));
  if (!q) back(user, jobId, { error: "err.qcNotFound" });
  await db.update(schema.jobQc).set(q.passedAt ? { passedAt: null, passedBy: null } : { passedAt: new Date(), passedBy: user.id }).where(eq(schema.jobQc.id, qcId));
  const left = await db.select({ id: schema.jobQc.id }).from(schema.jobQc).where(and(eq(schema.jobQc.jobId, jobId), sql`${schema.jobQc.passedAt} is null`));
  if (!left.length) await addActivity(jobId, user.id, "act.qcDone", { name: user.name });
  back(user, jobId);
}

export async function logLabour(form: FormData) {
  const user = await requireUser();
  const jobId = num(form, "jobId");
  const { job } = await access(jobId, user);
  const staffId = can(user.role, "job.assign") ? num(form, "staffId") : user.id;
  const workDate = str(form, "workDate") || today();
  // "From – to" clock times: split at the time overtime starts (15:00–19:00 → 2 h normal + 2 h overtime). Sundays are all Sunday rate.
  const from = str(form, "timeFrom"), to = str(form, "timeTo");
  if (from || to) {
    const split = splitHours(from, to, settings().otStart);
    if (!split) back(user, jobId, { error: "lab.err.times", hash: "labour" });
    if (workDate > today()) back(user, jobId, { error: "err.futureDate" });
    if (job.status === "closed") back(user, jobId, { error: "err.jobClosed" });
    const [s] = await db.select({ name: schema.staff.name, noOvertime: schema.staff.noOvertime }).from(schema.staff).where(eq(schema.staff.id, staffId));
    if (!s) back(user, jobId, { error: "err.choosePerson" });
    const note = str(form, "note") || null, sunday = rateTypeFor("normal", workDate) === "sunday", ot = settings().otStart;
    const parts = sunday ? [{ type: "sunday" as const, hours: split.normal + split.ot, a: from, b: to }]
      : [{ type: "normal" as const, hours: split.normal, a: from, b: split.ot ? ot : to }, { type: "ot" as const, hours: split.ot, a: split.normal ? ot : from, b: to }].filter((p) => p.hours > 0);
    await db.insert(schema.labourEntries).values(parts.map((p) => ({ jobId, staffId, workDate, hours: String(p.hours), rateType: p.type, rateMult: String(rateMultiplier(p.type, settings(), s.noOvertime)),
      timeFrom: p.a, timeTo: p.b, note, loggedBy: user.id })));
    await ensureOnTeam(jobId, staffId, job.leadId);
    await addActivity(jobId, user.id, "act.labour", { hours: split.normal + split.ot, who: s.name });
    back(user, jobId, { ok: split.ot && !sunday ? "lab.splitSaved" : "ok.timeLogged", vars: { n: split.normal, ot: split.ot }, hash: "labour" });
  }
  const hours = num(form, "hours");
  if (!(hours > 0 && hours <= 24)) back(user, jobId, { error: "err.hours" });
  if (workDate > today()) back(user, jobId, { error: "err.futureDate" });
  if (job.status === "closed") back(user, jobId, { error: "err.jobClosed" });
  const [s] = await db.select({ name: schema.staff.name, noOvertime: schema.staff.noOvertime }).from(schema.staff).where(eq(schema.staff.id, staffId));
  if (!s) back(user, jobId, { error: "err.choosePerson" });
  const rateType = rateTypeFor(str(form, "rateType"), workDate);
  await db.insert(schema.labourEntries).values({ jobId, staffId, hours: String(hours), workDate, rateType, rateMult: String(rateMultiplier(rateType, settings(), s.noOvertime)), note: str(form, "note") || null, loggedBy: user.id });
  await ensureOnTeam(jobId, staffId, job.leadId);
  await addActivity(jobId, user.id, "act.labour", { hours, who: s.name });
  back(user, jobId, { ok: "ok.timeLogged", hash: "labour" });
}

/** A time entry the user may change: supervisors any entry (also on completed jobs, like other job details);
 *  crew only their own time, while the job is open. */
async function editableLabour(user: CurrentUser, form: FormData) {
  const jobId = num(form, "jobId"), entryId = num(form, "entryId");
  const { job } = await access(jobId, user);
  const L = schema.labourEntries;
  const [e] = await db.select().from(L).where(and(eq(L.id, entryId), eq(L.jobId, jobId)));
  if (!e) back(user, jobId, { error: "lab.err.notFound", hash: "labour" });
  if (job.status === "closed" && !can(user.role, "job.editDetails")) back(user, jobId, { error: "err.jobClosed", hash: "labour" });
  if (!can(user.role, "job.assign") && e.staffId !== user.id && e.loggedBy !== user.id) back(user, jobId, { error: "lab.err.notYours", hash: "labour" });
  return { job, e };
}

export async function updateLabour(form: FormData) {
  const user = await requireUser();
  const { job, e } = await editableLabour(user, form);
  const hours = num(form, "hours"), workDate = str(form, "workDate") || e.workDate;
  const staffId = can(user.role, "job.assign") && num(form, "staffId") > 0 ? num(form, "staffId") : e.staffId;
  if (!(hours > 0 && hours <= 24)) back(user, job.id, { error: "err.hours", hash: "labour" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate) || workDate > today()) back(user, job.id, { error: "err.futureDate", hash: "labour" });
  const [s] = await db.select({ name: schema.staff.name, noOvertime: schema.staff.noOvertime }).from(schema.staff).where(eq(schema.staff.id, staffId));
  if (!s) back(user, job.id, { error: "err.choosePerson", hash: "labour" });
  // The multiplier is kept from when it was logged unless the type of hour or the person changes.
  const rateType = rateTypeFor(str(form, "rateType") || e.rateType, workDate);
  const rateMult = rateType === e.rateType && staffId === e.staffId ? e.rateMult : String(rateMultiplier(rateType, settings(), s.noOvertime));
  await db.update(schema.labourEntries).set({ hours: String(hours), workDate, staffId, rateType, rateMult, note: str(form, "note") || null }).where(eq(schema.labourEntries.id, e.id));
  if (staffId !== e.staffId) await ensureOnTeam(job.id, staffId, job.leadId);
  await addActivity(job.id, user.id, "act.labourEdit", { who: s.name, from: Number(e.hours), hours, name: user.name });
  back(user, job.id, { ok: "lab.saved", hash: "labour" });
}

export async function removeLabour(form: FormData) {
  const user = await requireUser();
  const { job, e } = await editableLabour(user, form);
  const [s] = await db.select({ name: schema.staff.name }).from(schema.staff).where(eq(schema.staff.id, e.staffId));
  await db.delete(schema.labourEntries).where(eq(schema.labourEntries.id, e.id));
  await addActivity(job.id, user.id, "act.labourRemoved", { who: s?.name ?? "", hours: Number(e.hours), name: user.name });
  back(user, job.id, { ok: "lab.removed", hash: "labour" });
}

export async function addNote(form: FormData) {
  const user = await requireUser();
  const jobId = num(form, "jobId"), text = str(form, "text");
  await access(jobId, user);
  if (!text) back(user, jobId);
  await addActivity(jobId, user.id, "act.note", { text, name: user.name });
  back(user, jobId);
}

/* ---------- photos ---------- */
export async function uploadPhotos(form: FormData) {
  const user = await requireUser();
  const jobId = num(form, "jobId");
  await access(jobId, user);
  const stage = str(form, "stage") as "before" | "during" | "after" | "qc";
  if (!["before", "during", "after", "qc"].includes(stage)) back(user, jobId, { error: "err.stage" });
  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) back(user, jobId, { error: "err.noPhotos" });
  for (const f of files) {
    if (!ALLOWED_IMAGE_TYPES[f.type]) back(user, jobId, { error: "err.photoType", vars: { file: f.name } });
    if (f.size > MAX_PHOTO_BYTES) back(user, jobId, { error: "err.photoSize", vars: { file: f.name } });
  }
  const caption = str(form, "caption") || null;
  for (const f of files) {
    const path = await saveFile("photos", Buffer.from(await f.arrayBuffer()), ALLOWED_IMAGE_TYPES[f.type]);
    await db.insert(schema.jobPhotos).values({ jobId, stage, caption, path, contentType: f.type, takenBy: user.id });
  }
  await addActivity(jobId, user.id, "act.photos", { count: files.length, stage, name: user.name });
  back(user, jobId, { ok: "ok.photosAdded" });
}

/** Delete a photo: whoever took it while the job is open; Supervisor / Head Manager any time. */
export async function removePhoto(form: FormData) {
  const user = await requireUser();
  const jobId = num(form, "jobId"), id = num(form, "photoId");
  const { job } = await access(jobId, user);
  const P = schema.jobPhotos;
  const [p] = await db.select().from(P).where(and(eq(P.id, id), eq(P.jobId, jobId)));
  if (!p) back(user, jobId);
  const allowed = can(user.role, "job.assign") ? (job.status !== "closed" || can(user.role, "job.editDetails")) : (job.status !== "closed" && p.takenBy === user.id);
  if (!allowed) back(user, jobId, { error: "err.notOnJob" });
  await db.delete(P).where(eq(P.id, id));
  await deleteStoredFile(p.path).catch(() => {});
  await addActivity(jobId, user.id, "act.photoRemoved", { stage: p.stage, name: user.name });
  back(user, jobId, { ok: "ph.removed" });
}

/* ---------- handover & report ---------- */
export async function handover(form: FormData) {
  const user = await requirePermission("job.handover");
  const jobId = num(form, "jobId");
  const { job } = await access(jobId, user);
  const name = str(form, "name"), hm = num(form, "hourMeter"), sig = str(form, "signature");
  if (job.status !== "closed" || job.signoffAt) back(user, jobId, { error: "err.handoverStatus" });
  if (!name) back(user, jobId, { error: "err.handoverFields" });
  const hmOut = Number.isFinite(hm) && hm > 0 ? hm : null; // optional: some machines have no hour meter
  const m = sig.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!m || m[1].length < 200) back(user, jobId, { error: "err.signature" });
  const png = Buffer.from(m[1], "base64");
  if (png.length > 2 * 1024 * 1024) back(user, jobId, { error: "err.sigLarge" });
  const signaturePath = await saveFile("signatures", png, "png");
  const params = { customer: name, hm: hmOut ? `${hmOut.toLocaleString("en-MY")} h` : "—", name: user.name };
  await db.transaction(async (tx) => {
    await tx.update(jobs).set({
      signoffName: name, signoffHourMeter: hmOut, signoffAt: new Date(), signoffBy: user.id, signaturePath,
    }).where(eq(jobs.id, jobId));
    const [unit] = await tx.select().from(schema.machineUnits).where(eq(schema.machineUnits.id, job.unitId));
    await tx.update(schema.machineUnits).set({ ...(hmOut ? { hourMeter: Math.max(unit.hourMeter, hmOut) } : {}), location: "Customer site", arrivedAt: null }).where(eq(schema.machineUnits.id, job.unitId));
    await tx.insert(schema.jobActivity).values({ jobId, staffId: user.id, key: "act.handover", params, text: activityText(translator("en"), { key: "act.handover", params, text: "" }) });
  });
  back(user, jobId, { ok: "ok.handedOver" });
}

export async function saveRecommendations(form: FormData) {
  const user = await requirePermission("job.report");
  const jobId = num(form, "jobId");
  await access(jobId, user);
  await db.update(jobs).set({ recommendations: str(form, "recommendations") }).where(eq(jobs.id, jobId));
  revalidatePath(`/jobs/${jobId}/report`);
  const q = new URLSearchParams({ prices: str(form, "prices"), photos: str(form, "photos"), qc: str(form, "qc"), labour: str(form, "labour"), lang: str(form, "lang"), ok: translator(user.locale)("ok.recSaved") });
  redirect(`/jobs/${jobId}/report?${q}`);
}

/* ---------- parts ---------- */
export async function requestPart(form: FormData) {
  const user = await requireUser();
  const jobId = num(form, "jobId"), partId = num(form, "partId"), qty = num(form, "qty");
  const { job } = await access(jobId, user);
  if (job.status === "closed") back(user, jobId, { error: "err.jobClosed" });
  if (!partId) back(user, jobId, { error: "err.choosePart" });
  if (!(qty > 0)) back(user, jobId, { error: "err.qty" });
  const [p] = await db.select({ description: schema.parts.description, uom: schema.parts.uom }).from(schema.parts).where(eq(schema.parts.id, partId));
  if (!p) back(user, jobId, { error: "err.choosePart" });
  await db.insert(schema.partRequests).values({ jobId, partId, qty: String(qty), note: str(form, "note") || null, requestedBy: user.id });
  await addActivity(jobId, user.id, "act.partRequested", { qty, uom: p.uom, part: p.description, name: user.name });
  await notifyRoles(["supervisor", "boss"], { key: "nt.partRequest", vars: { machine: await jobMachine(jobId), name: user.name, qty, uom: p.uom, part: p.description }, url: `/jobs/${jobId}#parts` }, user.id);
  back(user, jobId, { ok: "ok.partRequested" });
}

async function issue(user: CurrentUser, jobId: number, partId: number, qty: number, requestId?: number, requestedBy?: number | null, force = false) {
  const [p] = await db.select({ description: schema.parts.description, uom: schema.parts.uom, onHand: schema.parts.onHand, bin: schema.parts.bin }).from(schema.parts).where(eq(schema.parts.id, partId));
  if (!p) back(user, jobId, { error: "err.choosePart" });
  const ok = await db.transaction(async (tx) => {
    const done = await issueToJob(tx, { partId, qty, jobId, staffId: user.id, force });
    if (done && requestId) await tx.update(schema.partRequests).set({ status: "issued", handledBy: user.id, handledAt: new Date() }).where(eq(schema.partRequests.id, requestId));
    return done;
  });
  // Not enough by the count: ask whether the count is wrong and it should be issued anyway (the job page shows the question).
  if (!ok) {
    revalidatePath(`/jobs/${jobId}`);
    redirect(`/jobs/${jobId}?short=${partId}~${qty}~${requestId ?? ""}#parts`);
  }
  await addActivity(jobId, user.id, "act.partIssued", { qty, uom: p.uom, part: p.description, bin: p.bin ?? "—", name: user.name });
  if (requestedBy) await notifyStaff([requestedBy], { key: "nt.partIssued", vars: { qty, uom: p.uom, part: p.description, bin: p.bin ?? "—" }, url: `/jobs/${jobId}#parts` }, user.id);
  revalidatePath("/parts");
  back(user, jobId, { ok: "ok.partIssued" });
}

export async function issueRequest(form: FormData) {
  const user = await requirePermission("stock.manage");
  const jobId = num(form, "jobId"), requestId = num(form, "requestId");
  await access(jobId, user);
  const [r] = await db.select().from(schema.partRequests).where(and(eq(schema.partRequests.id, requestId), eq(schema.partRequests.jobId, jobId)));
  if (!r || r.status !== "requested") back(user, jobId, { error: "err.requestHandled" });
  await issue(user, jobId, r.partId, Number(r.qty), r.id, r.requestedBy, form.get("force") === "1");
}

export async function issueDirect(form: FormData) {
  const user = await requirePermission("stock.manage");
  const jobId = num(form, "jobId"), partId = num(form, "partId"), qty = num(form, "qty");
  const { job } = await access(jobId, user);
  if (job.status === "closed") back(user, jobId, { error: "err.jobClosed" });
  if (!(qty > 0)) back(user, jobId, { error: "err.qty" });
  await issue(user, jobId, partId, qty, undefined, undefined, form.get("force") === "1");
}

/** Change the quantity of a part issued from stock, or remove it (qty 0): the difference goes back on the shelf.
 *  Supervisor / Head Manager, while the work order is open (and after completion for those who may edit details). */
export async function updateIssuedPart(form: FormData) {
  const user = await requirePermission("stock.manage");
  const jobId = num(form, "jobId"), id = num(form, "jobPartId");
  const { job } = await access(jobId, user);
  if (job.status === "closed" && !can(user.role, "job.editDetails")) back(user, jobId, { error: "tr.closed", hash: "parts" });
  const qty = form.get("remove") === "1" ? 0 : num(form, "qty");
  if (!(qty >= 0)) back(user, jobId, { error: "err.qty", hash: "parts" });
  const [jp] = await db.select({ qty: schema.jobParts.qty, description: schema.parts.description, uom: schema.parts.uom, onHand: schema.parts.onHand })
    .from(schema.jobParts).innerJoin(schema.parts, eq(schema.jobParts.partId, schema.parts.id)).where(and(eq(schema.jobParts.id, id), eq(schema.jobParts.jobId, jobId)));
  if (!jp) back(user, jobId, { hash: "parts" });
  const ok = await db.transaction((tx) => changeIssuedQty(tx, { jobPartId: id, jobId, qty, staffId: user.id, note: `${job.jobNo}: ${Number(jp.qty)} → ${qty}` }));
  if (!ok) back(user, jobId, { error: "err.notEnoughStock", vars: { n: Number(jp.onHand), uom: jp.uom }, hash: "parts" });
  await addActivity(jobId, user.id, qty ? "act.partChanged" : "act.partReturned", { part: jp.description, from: Number(jp.qty), qty, uom: jp.uom, name: user.name });
  revalidatePath("/parts");
  back(user, jobId, { ok: qty ? "jp.changed" : "jp.returned", hash: "parts" });
}

/** Correct a line bought for the work order (part no., description, qty, unit price). */
export async function updateJobPurchase(form: FormData) {
  const user = await requirePermission("stock.manage");
  const jobId = num(form, "jobId"), id = num(form, "purchaseId");
  const { job } = await access(jobId, user);
  const P = schema.jobPurchases;
  const [line] = await db.select().from(P).where(and(eq(P.id, id), eq(P.jobId, jobId)));
  if (!line) back(user, jobId, { hash: "parts" });
  if (job.status === "closed" && !(line.kind === "service" && can(user.role, "job.editDetails"))) back(user, jobId, { error: "tr.closed", hash: "parts" });
  const qty = line.kind === "service" ? 1 : num(form, "qty"), cost = num(form, "unitCost"), description = str(form, "description").slice(0, 200) || str(form, "partNo");
  if (!description || !(qty > 0) || !(cost >= 0)) back(user, jobId, { error: "bl.err", hash: "parts" });
  await db.update(P).set({ description, partNo: str(form, "partNo").slice(0, 60) || null, qty: String(qty), unitCost: cost.toFixed(2), unitPrice: cost.toFixed(2), ref: str(form, "ref").slice(0, 60) || null }).where(eq(P.id, id));
  await addActivity(jobId, user.id, "act.boughtEdited", { what: description, name: user.name });
  back(user, jobId, { ok: "jp.changed", hash: "parts" });
}

export async function rejectRequest(form: FormData) {
  const user = await requirePermission("stock.manage");
  const jobId = num(form, "jobId"), requestId = num(form, "requestId");
  await access(jobId, user);
  const [r] = await db.select({ r: schema.partRequests, description: schema.parts.description }).from(schema.partRequests).innerJoin(schema.parts, eq(schema.partRequests.partId, schema.parts.id))
    .where(and(eq(schema.partRequests.id, requestId), eq(schema.partRequests.jobId, jobId)));
  if (!r || r.r.status !== "requested") back(user, jobId, { error: "err.requestHandled" });
  await db.update(schema.partRequests).set({ status: "rejected", handledBy: user.id, handledAt: new Date() }).where(eq(schema.partRequests.id, requestId));
  await addActivity(jobId, user.id, "act.partRejected", { part: r.description, name: user.name });
  if (r.r.requestedBy) await notifyStaff([r.r.requestedBy], { key: "nt.partRejected", vars: { part: r.description, name: user.name }, url: `/jobs/${jobId}#parts` }, user.id);
  back(user, jobId);
}

/* ---------- quality checks chosen per job ---------- */
export async function addQcItem(form: FormData) {
  const user = await requireUser();
  const jobId = num(form, "jobId");
  const { job } = await access(jobId, user);
  if (job.status === "closed") back(user, jobId, { error: "tr.closed", hash: "qc" });
  const texts = form.get("standard") ? null : [str(form, "item").slice(0, 300)];
  if (texts && !texts[0]) back(user, jobId, { error: "qc.err.empty", hash: "qc" });
  const t = translator(user.locale);
  const sugg = qcSuggestions(job.category, t);
  const existing = await db.select().from(schema.jobQc).where(eq(schema.jobQc.jobId, jobId));
  const have = (x: { itemKey: string | null; item: string }) => existing.some((e) => (x.itemKey && e.itemKey === x.itemKey) || e.item.toLowerCase() === x.item.toLowerCase());
  // Typed text that matches a suggestion keeps its key, so it shows in each reader's language.
  const rows = texts ? texts.map((item) => sugg.find((g) => g.item.toLowerCase() === item.toLowerCase()) ?? { itemKey: null, item }) : sugg;
  const fresh = rows.filter((r) => !have(r));
  let seq = Math.max(-1, ...existing.map((e) => e.seq));
  if (fresh.length) await db.insert(schema.jobQc).values(fresh.map((r) => ({ jobId, seq: ++seq, itemKey: r.itemKey, item: r.item })));
  back(user, jobId, { ok: "qc.added", hash: "qc" });
}

export async function removeQcItem(form: FormData) {
  const user = await requirePermission("job.qc");
  const jobId = num(form, "jobId"), qcId = num(form, "qcId");
  await access(jobId, user);
  const [q] = await db.select().from(schema.jobQc).where(and(eq(schema.jobQc.id, qcId), eq(schema.jobQc.jobId, jobId)));
  if (!q) back(user, jobId, { error: "err.qcNotFound", hash: "qc" });
  if (q.passedAt) back(user, jobId, { error: "qc.err.passed", hash: "qc" });
  await db.delete(schema.jobQc).where(eq(schema.jobQc.id, qcId));
  back(user, jobId, { ok: "qc.removed", hash: "qc" });
}

/* ---------- parts bought for a job (not from stock) ---------- */
export async function addJobPurchase(form: FormData) {
  const user = await requirePermission("stock.manage");
  const jobId = num(form, "jobId");
  const { job } = await access(jobId, user);
  // Outside work: one amount from the vendor's invoice. It often arrives after the work order is completed.
  const kind = str(form, "kind") === "service" ? "service" : "part";
  if (job.status === "closed" && !(kind === "service" && can(user.role, "job.editDetails"))) back(user, jobId, { error: "tr.closed", hash: "parts" });
  const description = str(form, "description").slice(0, 200), qty = kind === "service" ? 1 : Number(str(form, "qty")), cost = Number(str(form, "unitCost"));
  if (!description || !(qty > 0) || !(cost >= 0)) back(user, jobId, { error: "jp.err.fields", hash: "parts" });
  // Work orders are costed, not priced: the price column simply mirrors the cost.
  const price = cost;
  // Supplier: typed or picked by name; a name not on the list becomes a new supplier.
  const supplierId = (await supplierByName(str(form, "supplierName")))?.id ?? null;
  const date = str(form, "purchasedAt");
  await db.insert(schema.jobPurchases).values({
    jobId, kind, description, partNo: kind === "part" ? str(form, "partNo") || null : null, supplierId, supplierName: null,
    qty: String(qty), uom: kind === "service" ? "job" : str(form, "uom") || "pc", unitCost: cost.toFixed(2), unitPrice: price.toFixed(2), ref: str(form, "ref") || null,
    purchasedAt: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today(), addedBy: user.id,
  });
  await addActivity(jobId, user.id, kind === "service" ? "act.outsideCost" : "act.bought", { what: kind === "service" ? description : `${qty} × ${description}`, name: user.name });
  back(user, jobId, { ok: kind === "service" ? "out.added" : "jp.added", hash: "parts" });
}

/** Parts bought on one supplier invoice: the supplier, invoice no. and date once, then one line per item.
 *  Empty lines are skipped; a line needs a part no. or a description, a quantity and a unit price. */
export async function addJobPurchases(form: FormData) {
  const user = await requirePermission("stock.manage");
  const jobId = num(form, "jobId");
  const { job } = await access(jobId, user);
  if (job.status === "closed") back(user, jobId, { error: "tr.closed", hash: "parts" });
  const col = (k: string) => form.getAll(k).map((v) => String(v).trim());
  const [partNos, descs, qtys, uoms, costs] = [col("partNo"), col("description"), col("qty"), col("uom"), col("unitCost")];
  const real = descs.map((d, i) => ({ partNo: (partNos[i] ?? "").slice(0, 60), description: (d || partNos[i] || "").slice(0, 200), qty: Number(qtys[i]), uom: uoms[i] || "pc", cost: costs[i] === "" ? NaN : Number(costs[i]) }))
    .filter((l, i) => l.description || costs[i]); // a line with nothing typed is skipped
  if (!real.length || real.some((l) => !l.description || !(l.qty > 0) || !(l.cost >= 0))) back(user, jobId, { error: "bl.err", hash: "parts" });
  const supplierId = (await supplierByName(str(form, "supplierName")))?.id ?? null;
  const date = str(form, "purchasedAt"), ref = str(form, "ref").slice(0, 60) || null;
  const purchasedAt = isDate(date) && date <= today() ? date : today();
  await db.insert(schema.jobPurchases).values(real.map((l) => ({
    jobId, kind: "part" as const, description: l.description, partNo: l.partNo || null, supplierId, supplierName: null, qty: String(l.qty), uom: l.uom.slice(0, 20),
    unitCost: l.cost.toFixed(2), unitPrice: l.cost.toFixed(2), ref, purchasedAt, addedBy: user.id,
  })));
  const total = real.reduce((a, l) => a + l.qty * l.cost, 0);
  await addActivity(jobId, user.id, "act.boughtInvoice", { n: real.length, ref: ref ?? "—", total: total.toFixed(2), name: user.name });
  back(user, jobId, { ok: "bl.saved", vars: { n: real.length }, hash: "parts" });
}

export async function removeJobPurchase(form: FormData) {
  const user = await requirePermission("stock.manage");
  const jobId = num(form, "jobId"), id = num(form, "purchaseId");
  const { job } = await access(jobId, user);
  const [line] = await db.select({ kind: schema.jobPurchases.kind }).from(schema.jobPurchases).where(and(eq(schema.jobPurchases.id, id), eq(schema.jobPurchases.jobId, jobId)));
  if (job.status === "closed" && !(line?.kind === "service" && can(user.role, "job.editDetails"))) back(user, jobId, { error: "tr.closed", hash: "parts" });
  await db.delete(schema.jobPurchases).where(and(eq(schema.jobPurchases.id, id), eq(schema.jobPurchases.jobId, jobId)));
  back(user, jobId, { ok: "jp.removed", hash: "parts" });
}

/* ---------- services done on this job (updates the machine's service schedule) ---------- */
export async function recordServices(form: FormData) {
  const user = await requireUser();
  const jobId = num(form, "jobId");
  const { job } = await access(jobId, user);
  const items = form.getAll("items").map(String).filter((i) => findItem("service_item", i));
  if (!items.length) back(user, jobId, { error: "svc.err.none", hash: "services" });
  const date = /^\d{4}-\d{2}-\d{2}$/.test(str(form, "date")) ? str(form, "date") : today();
  for (const item of items) await markServiceDone(job.unitId, item, date, user.id, jobId);
  const t = translator("en");
  await addActivity(jobId, user.id, "act.services", { what: items.map((i) => itemLabel(t, "service_item", i)).join(", "), name: user.name });
  revalidatePath(`/machinery/${job.unitId}`);
  back(user, jobId, { ok: "svc.recorded", hash: "services" });
}

/** Take a service off this work order's record (ticked by mistake). The machine's schedule is not changed. */
export async function removeJobService(form: FormData) {
  const user = await requirePermission("job.assign");
  const jobId = num(form, "jobId");
  await access(jobId, user);
  await db.delete(schema.jobServices).where(and(eq(schema.jobServices.id, num(form, "id")), eq(schema.jobServices.jobId, jobId)));
  back(user, jobId, { ok: "svc.removedHere", hash: "services" });
}

/** Delete a work order entered by mistake (Head Manager). Parts issued from stock go back on the shelf; purchase
 *  orders and stock history that pointed at it are kept, without the link. Everything else on it is removed. */
export async function deleteJob(form: FormData) {
  const user = await requirePermission("job.delete");
  const jobId = num(form, "jobId");
  const [job] = await db.select({ id: schema.jobs.id, jobNo: schema.jobs.jobNo }).from(schema.jobs).where(eq(schema.jobs.id, jobId));
  if (!job) back(user, jobId, { error: "err.jobNotFound" });
  if (form.get("confirm") !== "on") redirect(`/jobs/${jobId}/edit?error=${encodeURIComponent(translator(user.locale)("job.delConfirmErr"))}#delete`);
  await db.transaction(async (tx) => {
    const issued = await tx.select({ partId: schema.jobParts.partId, qty: schema.jobParts.qty }).from(schema.jobParts).where(eq(schema.jobParts.jobId, jobId));
    const moved = await tx.select({ id: schema.stockMovements.id }).from(schema.stockMovements).where(and(eq(schema.stockMovements.jobId, jobId), eq(schema.stockMovements.type, "issue"))).limit(1);
    // Only parts that really left the shelf (a stock movement exists) go back; imported history did not move stock.
    if (moved.length) for (const it of issued) {
      const [p] = await tx.select({ onHand: schema.parts.onHand, avg: schema.parts.avgCost }).from(schema.parts).where(eq(schema.parts.id, it.partId)).for("update");
      const after = Number(p.onHand) + Number(it.qty);
      await tx.update(schema.parts).set({ onHand: after.toFixed(2) }).where(eq(schema.parts.id, it.partId));
      await tx.insert(schema.stockMovements).values({ partId: it.partId, type: "return", qty: Number(it.qty).toFixed(2), unitCost: p.avg, balanceAfter: after.toFixed(2), staffId: user.id, note: `Work order ${job.jobNo} deleted` });
    }
    await tx.update(schema.stockMovements).set({ jobId: null }).where(eq(schema.stockMovements.jobId, jobId));
    await tx.update(schema.purchaseOrders).set({ jobId: null }).where(eq(schema.purchaseOrders.jobId, jobId));
    await tx.update(schema.jobs).set({ parentJobId: null }).where(eq(schema.jobs.parentJobId, jobId));
    await tx.delete(schema.jobs).where(eq(schema.jobs.id, jobId));
  });
  revalidatePath("/jobs"); revalidatePath("/");
  redirect(`/jobs?ok=${encodeURIComponent(translator(user.locale)("job.deleted", { no: job.jobNo }))}`);
}

/** The machine (or part) is back from the outside workshop. */
export async function markBackFromVendor(form: FormData) {
  const user = await requirePermission("job.assign");
  const jobId = num(form, "jobId");
  const { job } = await access(jobId, user);
  if (!job.outsourced || job.backAt) back(user, jobId);
  const day = str(form, "backAt") || today();
  if (!isDate(day) || day > today() || (job.sentOutAt && day < job.sentOutAt)) back(user, jobId, { error: "out.err.dates" });
  await db.update(jobs).set({ backAt: day }).where(eq(jobs.id, jobId));
  const location = job.siteType === "workshop" && job.siteLocation ? `Workshop · ${job.siteLocation}` : "Own yard";
  await db.update(schema.machineUnits).set({ location }).where(eq(schema.machineUnits.id, job.unitId));
  await addActivity(jobId, user.id, "act.backFromVendor", { name: user.name });
  back(user, jobId, { ok: "out.backSaved" });
}

/** "No invoice for this job" (warranty, free check…), or undo it: stops / restarts the invoice-pending reminder. */
export async function setNoInvoice(form: FormData) {
  const user = await requirePermission("job.assign");
  const jobId = num(form, "jobId");
  const { job } = await access(jobId, user);
  if (!job.outsourced) back(user, jobId);
  const none = str(form, "none") === "1";
  await db.update(jobs).set({ invoiceStatus: none ? "none" : null }).where(eq(jobs.id, jobId));
  await addActivity(jobId, user.id, none ? "act.noInvoice" : "act.invoiceExpected", { name: user.name });
  back(user, jobId, { ok: none ? "inv.noneSaved" : "inv.expectedSaved" });
}
