"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, between, eq, inArray, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission, type CurrentUser } from "@/lib/auth";
import { CREW_ROLES } from "@/lib/permissions";
import { addDays } from "@/lib/format";
import { ABSENCE, isDay, weekDays, weekStart, type PlanKind } from "@/lib/calendar";
import { translator, type MessageKey } from "@/i18n";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function back(user: CurrentUser, path: string, msg: { ok?: MessageKey; error?: MessageKey }): never {
  const t = translator(user.locale);
  revalidatePath("/calendar");
  revalidatePath("/");
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${msg.error ? `error=${encodeURIComponent(t(msg.error))}` : `ok=${encodeURIComponent(t(msg.ok!))}`}`);
}

/** Save the whole week's crew plan from one form: fields c_<staffId>_<day> = "" | leave | mc | off | <jobId>. */
export async function savePlan(form: FormData) {
  const user = await requirePermission("job.assign");
  const w = str(form, "week");
  if (!isDay(w)) back(user, "/calendar?view=week", { error: "cal.err.week" });
  const start = weekStart(w), days = weekDays(start);
  const crew = await db.select({ id: schema.staff.id }).from(schema.staff).where(and(eq(schema.staff.active, true), inArray(schema.staff.role, CREW_ROLES)));
  const openJobs = await db.select({ id: schema.jobs.id, leadId: schema.jobs.leadId }).from(schema.jobs).where(ne(schema.jobs.status, "closed"));
  const jobLead = new Map(openJobs.map((j) => [j.id, j.leadId]));
  const P = schema.crewPlan;
  await db.transaction(async (tx) => {
    for (const s of crew) for (const day of days) {
      const key = `c_${s.id}_${day}`;
      if (!form.has(key)) continue;
      const v = str(form, key);
      const kind: PlanKind | null = v === "" ? null : (ABSENCE as string[]).includes(v) ? (v as PlanKind) : jobLead.has(Number(v)) ? "job" : null;
      if (!kind) { await tx.delete(P).where(and(eq(P.staffId, s.id), eq(P.day, day))); continue; }
      const jobId = kind === "job" ? Number(v) : null;
      const values = { kind, jobId, updatedBy: user.id, updatedAt: new Date() };
      await tx.insert(P).values({ staffId: s.id, day, ...values }).onConflictDoUpdate({ target: [P.staffId, P.day], set: values });
      // Planning someone onto a job puts them on the job team.
      if (jobId && jobLead.get(jobId) !== s.id) await tx.insert(schema.jobTeam).values({ jobId, staffId: s.id }).onConflictDoNothing();
    }
  });
  back(user, `/calendar?view=week&w=${start}`, { ok: "cal.saved" });
}

/** Copy last week's plan into this week where a day is still empty (jobs since completed are skipped). */
export async function copyLastWeek(form: FormData) {
  const user = await requirePermission("job.assign");
  const w = str(form, "week");
  if (!isDay(w)) back(user, "/calendar?view=week", { error: "cal.err.week" });
  const start = weekStart(w), prev = addDays(start, -7);
  const P = schema.crewPlan;
  const [last, open] = await Promise.all([
    db.select().from(P).where(between(P.day, prev, addDays(prev, 5))),
    db.select({ id: schema.jobs.id }).from(schema.jobs).where(ne(schema.jobs.status, "closed")),
  ]);
  const openIds = new Set(open.map((j) => j.id));
  let n = 0;
  for (const r of last) {
    if (r.kind === "job" && (!r.jobId || !openIds.has(r.jobId))) continue;
    const res = await db.insert(P).values({ staffId: r.staffId, day: addDays(r.day, 7), kind: r.kind, jobId: r.jobId, note: r.note, updatedBy: user.id })
      .onConflictDoNothing().returning({ id: P.id });
    n += res.length;
  }
  back(user, `/calendar?view=week&w=${start}`, { ok: n ? "cal.copied" : "cal.copiedNone" });
}

export async function addHoliday(form: FormData) {
  const user = await requirePermission("job.assign");
  const day = str(form, "day"), name = str(form, "name").slice(0, 80);
  const m = str(form, "m");
  if (!isDay(day) || !name) back(user, `/calendar?m=${m}#holidays`, { error: "cal.err.holiday" });
  await db.insert(schema.holidays).values({ day, name }).onConflictDoUpdate({ target: schema.holidays.day, set: { name } });
  back(user, `/calendar?m=${day.slice(0, 7)}`, { ok: "cal.holidayAdded" });
}

export async function removeHoliday(form: FormData) {
  const user = await requirePermission("job.assign");
  const day = str(form, "day");
  if (isDay(day)) await db.delete(schema.holidays).where(eq(schema.holidays.day, day));
  back(user, `/calendar?m=${day.slice(0, 7)}`, { ok: "cal.holidayRemoved" });
}
