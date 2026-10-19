"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission, type CurrentUser } from "@/lib/auth";
import { isDay } from "@/lib/calendar";
import { isAttStatus } from "@/lib/attendance";
import { sheetStaff } from "@/lib/attendance-server";
import { today } from "@/lib/format";
import { translator, type MessageKey } from "@/i18n";

const A = schema.attendance;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const hhmm = (v: string) => (/^\d{2}:\d{2}$/.test(v) ? v : null);

function back(user: CurrentUser, day: string, msg: { ok?: MessageKey; error?: MessageKey }): never {
  const t = translator(user.locale);
  revalidatePath("/team/attendance"); revalidatePath("/");
  redirect(`/team/attendance?d=${day}&${msg.error ? `error=${encodeURIComponent(t(msg.error))}` : `ok=${encodeURIComponent(t(msg.ok!))}`}`);
}

/** Save the day's sheet: fields s_<id> (status or empty), in_<id>, out_<id>, n_<id>. */
export async function saveAttendance(form: FormData) {
  const user = await requirePermission("job.assign");
  const day = str(form, "day");
  if (!isDay(day) || day > today()) back(user, today(), { error: "att.err.day" });
  const people = await sheetStaff();
  await db.transaction(async (tx) => {
    for (const { id } of people) {
      if (!form.has(`s_${id}`)) continue;
      const status = str(form, `s_${id}`);
      if (!isAttStatus(status)) { await tx.delete(A).where(and(eq(A.staffId, id), eq(A.day, day))); continue; }
      const values = { status, timeIn: hhmm(str(form, `in_${id}`)), timeOut: hhmm(str(form, `out_${id}`)), note: str(form, `n_${id}`).slice(0, 200) || null, updatedBy: user.id, updatedAt: new Date() };
      await tx.insert(A).values({ staffId: id, day, ...values }).onConflictDoUpdate({ target: [A.staffId, A.day], set: values });
    }
  });
  back(user, day, { ok: "att.saved" });
}

/** Everyone not yet marked: leave / MC / off from the crew plan, otherwise Present. */
export async function markAllPresent(form: FormData) {
  const user = await requirePermission("job.assign");
  const day = str(form, "day");
  if (!isDay(day) || day > today()) back(user, today(), { error: "att.err.day" });
  const ids = (await sheetStaff()).map((p) => p.id);
  if (!ids.length) back(user, day, { ok: "att.saved" });
  const [done, plan] = await Promise.all([
    db.select({ staffId: A.staffId }).from(A).where(and(eq(A.day, day), inArray(A.staffId, ids))),
    db.select({ staffId: schema.crewPlan.staffId, kind: schema.crewPlan.kind }).from(schema.crewPlan).where(eq(schema.crewPlan.day, day)),
  ]);
  const marked = new Set(done.map((r) => r.staffId));
  const rows = ids.filter((id) => !marked.has(id)).map((id) => {
    const k = plan.find((p) => p.staffId === id)?.kind;
    return { staffId: id, day, status: (k && k !== "job" ? k : "present") as "present" | "leave" | "mc" | "off", updatedBy: user.id };
  });
  if (rows.length) await db.insert(A).values(rows).onConflictDoNothing();
  back(user, day, { ok: "att.allMarked" });
}
