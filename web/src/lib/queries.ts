import "server-only";
import { and, asc, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { can } from "./permissions";
import { translator, type MessageKey, type Vars } from "@/i18n";
import { activityText } from "@/i18n/labels";
import type { CurrentUser } from "./auth";
import type { Status } from "./jobs";

const { jobs, jobTeam, machineUnits, machineModels, customers, staff } = schema;

export type JobRow = {
  id: number; jobNo: string; category: typeof jobs.$inferSelect["category"]; priority: typeof jobs.$inferSelect["priority"];
  status: Status; statusSince: Date; siteType: "workshop" | "field"; siteLocation: string; openedAt: string; dueDate: string;
  closedAt: string | null; complaint: string; leadId: number | null; leadName: string | null; unitId: number;
  make: string; model: string; serialNo: string | null; plateNo: string | null; unitPhotoPath: string | null; customerName: string; teamIds: number[]; labourHours: number; partsValue: number;
};

/** Jobs the user may see. Boss and supervisor see all; crew see jobs they lead or are on. */
export async function listJobs(user: CurrentUser, opts: { open?: boolean; unitId?: number } = {}): Promise<JobRow[]> {
  const conds = [];
  if (opts.open) conds.push(ne(jobs.status, "closed"));
  if (opts.unitId) conds.push(eq(jobs.unitId, opts.unitId));
  if (!can(user.role, "job.viewAll")) {
    const mine = db.select({ id: jobTeam.jobId }).from(jobTeam).where(eq(jobTeam.staffId, user.id));
    conds.push(or(eq(jobs.leadId, user.id), inArray(jobs.id, mine)));
  }
  const rows = await db
    .select({
      id: jobs.id, jobNo: jobs.jobNo, category: jobs.category, priority: jobs.priority, status: jobs.status, statusSince: jobs.statusSince,
      siteType: jobs.siteType, siteLocation: jobs.siteLocation, openedAt: jobs.openedAt, dueDate: jobs.dueDate, closedAt: jobs.closedAt,
      complaint: jobs.complaint, leadId: jobs.leadId, leadName: staff.name, unitId: jobs.unitId,
      make: machineModels.make, model: machineModels.model, serialNo: machineUnits.serialNo, plateNo: machineUnits.plateNo, unitPhotoPath: machineUnits.photoPath, customerName: customers.name,
      teamIds: sql<number[]>`coalesce((select array_agg(${jobTeam.staffId}) from ${jobTeam} where ${jobTeam.jobId} = ${jobs.id}), '{}')`,
      labourHours: sql<string>`coalesce((select sum(${schema.labourEntries.hours}) from ${schema.labourEntries} where ${schema.labourEntries.jobId} = ${jobs.id}), 0)`,
      partsValue: sql<string>`coalesce((select sum(${schema.jobParts.qty} * ${schema.jobParts.unitPrice}) from ${schema.jobParts} where ${schema.jobParts.jobId} = ${jobs.id}), 0)
        + coalesce((select sum(${schema.jobPurchases.qty} * ${schema.jobPurchases.unitPrice}) from ${schema.jobPurchases} where ${schema.jobPurchases.jobId} = ${jobs.id}), 0)`,
    })
    .from(jobs)
    .innerJoin(machineUnits, eq(jobs.unitId, machineUnits.id))
    .innerJoin(machineModels, eq(machineUnits.modelId, machineModels.id))
    .innerJoin(customers, eq(machineUnits.customerId, customers.id))
    .leftJoin(staff, eq(jobs.leadId, staff.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(jobs.openedAt), desc(jobs.id));
  return rows.map((r) => ({ ...r, teamIds: (r.teamIds ?? []).map(Number), labourHours: Number(r.labourHours), partsValue: Number(r.partsValue) }));
}

export async function getJob(id: number) {
  const [j] = await db
    .select({ job: jobs, unit: machineUnits, model: machineModels, customer: customers })
    .from(jobs)
    .innerJoin(machineUnits, eq(jobs.unitId, machineUnits.id))
    .innerJoin(machineModels, eq(machineUnits.modelId, machineModels.id))
    .innerJoin(customers, eq(machineUnits.customerId, customers.id))
    .where(eq(jobs.id, id));
  if (!j) return null;
  const [team, tasks, qc, labour, photos, activity, parent] = await Promise.all([
    db.select({ id: staff.id, name: staff.name, role: staff.role }).from(jobTeam).innerJoin(staff, eq(jobTeam.staffId, staff.id)).where(eq(jobTeam.jobId, id)),
    db.select().from(schema.jobTasks).where(eq(schema.jobTasks.jobId, id)).orderBy(asc(schema.jobTasks.seq), asc(schema.jobTasks.id)),
    db.select().from(schema.jobQc).where(eq(schema.jobQc.jobId, id)).orderBy(asc(schema.jobQc.seq)),
    db.select({ id: schema.labourEntries.id, staffId: schema.labourEntries.staffId, name: staff.name, workDate: schema.labourEntries.workDate, hours: schema.labourEntries.hours, note: schema.labourEntries.note, payRate: staff.payRate })
      .from(schema.labourEntries).innerJoin(staff, eq(schema.labourEntries.staffId, staff.id)).where(eq(schema.labourEntries.jobId, id)).orderBy(asc(schema.labourEntries.workDate), asc(schema.labourEntries.id)),
    db.select().from(schema.jobPhotos).where(eq(schema.jobPhotos.jobId, id)).orderBy(asc(schema.jobPhotos.createdAt)),
    db.select({ id: schema.jobActivity.id, text: schema.jobActivity.text, key: schema.jobActivity.key, params: schema.jobActivity.params, createdAt: schema.jobActivity.createdAt, name: staff.name })
      .from(schema.jobActivity).leftJoin(staff, eq(schema.jobActivity.staffId, staff.id)).where(eq(schema.jobActivity.jobId, id)).orderBy(desc(schema.jobActivity.createdAt), desc(schema.jobActivity.id)),
    j.job.parentJobId ? db.select({ id: jobs.id, jobNo: jobs.jobNo }).from(jobs).where(eq(jobs.id, j.job.parentJobId)) : Promise.resolve([]),
  ]);
  const lead = j.job.leadId ? (await db.select({ id: staff.id, name: staff.name, role: staff.role }).from(staff).where(eq(staff.id, j.job.leadId)))[0] ?? null : null;
  return { ...j, lead, team, tasks, qc, labour, photos, activity, parent: parent[0] ?? null };
}
export type JobDetail = NonNullable<Awaited<ReturnType<typeof getJob>>>;

export async function activeStaff() {
  return db.select({ id: staff.id, name: staff.name, role: staff.role, skills: staff.skills }).from(staff).where(eq(staff.active, true)).orderBy(asc(staff.name));
}

export async function unitsWithNames() {
  return db
    .select({ id: machineUnits.id, serialNo: machineUnits.serialNo, plateNo: machineUnits.plateNo, hourMeter: machineUnits.hourMeter, location: machineUnits.location,
      arrivedAt: machineUnits.arrivedAt, make: machineModels.make, model: machineModels.model, type: sql<string>`coalesce(${machineUnits.category}, ${machineModels.type})`,
      customerId: customers.id, customerName: customers.name, photoPath: machineUnits.photoPath,
      nextServiceDate: machineUnits.nextServiceDate, nextServiceType: machineUnits.nextServiceType })
    .from(machineUnits)
    .innerJoin(machineModels, eq(machineUnits.modelId, machineModels.id))
    .innerJoin(customers, eq(machineUnits.customerId, customers.id))
    .orderBy(asc(machineModels.make), asc(machineModels.model), asc(sql`coalesce(${machineUnits.plateNo}, ${machineUnits.serialNo})`));
}

/** Choices for the machine form: companies, plus makes and models already in the library (typing suggestions). */
export async function machineFormOptions() {
  const [companies, models] = await Promise.all([
    db.select({ id: customers.id, name: customers.name }).from(customers).orderBy(asc(customers.name)),
    db.select({ make: machineModels.make, model: machineModels.model }).from(machineModels),
  ]);
  const uniq = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b));
  return { companies, makes: uniq(models.map((m) => m.make)), models: uniq(models.map((m) => m.model)) };
}

/** Record an activity entry. Stored as a message key + params so everyone reads it in their own language. */
export async function addActivity(jobId: number, staffId: number | null, key: MessageKey, params: Vars = {}) {
  await db.insert(schema.jobActivity).values({ jobId, staffId, key, params, text: activityText(translator("en"), { key, params, text: "" }) });
}

export { isRole } from "./queries.shared";

/** For each job, the photo to show on its card: the first "before" photo, else its first photo. */
export async function coverPhotos(jobIds: number[]): Promise<Map<number, number>> {
  if (!jobIds.length) return new Map();
  const rows = await db.execute<{ job_id: number; id: number }>(sql`
    select distinct on (job_id) job_id, id from job_photos
    where job_id in (${sql.join(jobIds.map((i) => sql`${i}`), sql`, `)})
    order by job_id, (stage = 'before') desc, id`);
  return new Map(rows.rows.map((r) => [Number(r.job_id), Number(r.id)]));
}
