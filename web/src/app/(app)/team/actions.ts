"use server";
import { mergeStaff } from "@/lib/merge-staff";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/lib/auth";
import { hashPassword, passwordProblem } from "@/lib/password";
import { normalisePhone } from "@/lib/phone";
import { isRole } from "@/lib/queries";
import { hourlyFromSalary } from "@/lib/pay";
import { loadLists } from "@/lib/lists-server";
import { fmtDate } from "@/lib/format";
import { ensurePayBaseline, payHistory, syncCurrentPay } from "@/lib/pay-server";
import { isLocale, translator, type MessageKey, type Vars } from "@/i18n";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const optDate = (f: FormData, k: string) => { const v = str(f, k); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; };

/** Monthly salary → hourly rate (salary ÷ normal hours a month); without a salary, the hourly rate as typed (casual workers). */
function pay(f: FormData) {
  const salary = Number(str(f, "monthlySalary")) || 0, hours = Number(str(f, "monthlyHours")) || 195;
  return salary > 0
    ? { monthlySalary: salary.toFixed(2), monthlyHours: String(hours), payRate: hourlyFromSalary(salary, hours).toFixed(2) }
    : { monthlySalary: null, monthlyHours: String(hours), payRate: String(Number(str(f, "payRate")) || 0) };
}

function values(f: FormData) {
  const role = str(f, "role"), locale = str(f, "locale");
  return {
    name: str(f, "name"), role: isRole(role) ? role : null, phone: normalisePhone(str(f, "phone")), email: str(f, "email") || null,
    reportsTo: Number(f.get("reportsTo")) || null, idNumber: str(f, "idNumber") || null, permitExpiry: optDate(f, "permitExpiry"),
    emergencyContact: str(f, "emergencyContact") || null, joined: optDate(f, "joined"),
    skills: str(f, "skills").split(",").map((s) => s.trim()).filter(Boolean), ...pay(f),
    locale: isLocale(locale) ? locale : "en",
  };
}

async function boss() {
  const me = await requirePermission("staff.manage");
  const t = translator(me.locale);
  const go = (path: string, kind: "error" | "ok", key: MessageKey, vars?: Vars): never => redirect(`${path}?${kind}=${encodeURIComponent(t(key, vars))}`);
  return { me, t, go };
}

export async function createStaff(form: FormData) {
  const { t, go } = await boss();
  const v = values(form), pw = str(form, "password");
  if (!v.name || !v.role || v.phone.length < 9) go("/team/new", "error", "err.staffFields");
  const problem = passwordProblem(pw);
  if (problem) go("/team/new", "error", "err.tempPw", { problem: t(problem) });
  const [dupe] = await db.select({ id: schema.staff.id }).from(schema.staff).where(eq(schema.staff.phone, v.phone));
  if (dupe) go("/team/new", "error", "err.phoneUsed");
  const [row] = await db.insert(schema.staff).values({ ...v, role: v.role!, passwordHash: await hashPassword(pw) }).returning({ id: schema.staff.id });
  await ensurePayBaseline(row.id, null);
  revalidatePath("/team");
  go(`/team/${row.id}`, "ok", "ok.staffAdded");
}

export async function updateStaff(form: FormData) {
  const { me, go } = await boss();
  const id = Number(form.get("id")), v = values(form);
  if (!v.name || !v.role || v.phone.length < 9) go(`/team/${id}`, "error", "err.staffFields");
  if (id === me.id && v.role !== "boss") go(`/team/${id}`, "error", "err.ownRole");
  const [dupe] = await db.select({ id: schema.staff.id }).from(schema.staff).where(and(eq(schema.staff.phone, v.phone), ne(schema.staff.id, id)));
  if (dupe) go(`/team/${id}`, "error", "err.phoneUsed");
  const { payRate: _p, monthlySalary: _s, monthlyHours: _h, ...rest } = v;
  void _p; void _s; void _h; // pay changes go through "Change pay" (dated history)
  await db.update(schema.staff).set({ ...rest, role: v.role! }).where(eq(schema.staff.id, id));
  revalidatePath(`/team/${id}`);
  go(`/team/${id}`, "ok", "ok.saved");
}

export async function resetPassword(form: FormData) {
  const { t, go } = await boss();
  const id = Number(form.get("id")), pw = str(form, "password");
  const problem = passwordProblem(pw);
  if (problem) redirect(`/team/${id}?error=${encodeURIComponent(t(problem))}`);
  await db.update(schema.staff).set({ passwordHash: await hashPassword(pw) }).where(eq(schema.staff.id, id));
  await db.delete(schema.sessions).where(eq(schema.sessions.staffId, id));
  go(`/team/${id}`, "ok", "ok.pwReset");
}

export async function setActive(form: FormData) {
  const { me, go } = await boss();
  const id = Number(form.get("id")), active = form.get("active") === "1";
  if (id === me.id) go(`/team/${id}`, "error", "err.selfDeactivate");
  await db.update(schema.staff).set({ active }).where(eq(schema.staff.id, id));
  if (!active) await db.delete(schema.sessions).where(eq(schema.sessions.staffId, id));
  revalidatePath("/team");
  go(`/team/${id}`, "ok", active ? "ok.reactivated" : "ok.deactivated");
}

export async function addCert(form: FormData) {
  const me = await requirePermission("staff.view");
  const staffId = Number(form.get("staffId")), name = str(form, "name");
  if (!name) redirect(`/team/${staffId}?error=${encodeURIComponent(translator(me.locale)("err.certName"))}`);
  await db.insert(schema.certifications).values({ staffId, name, number: str(form, "number") || null, expiry: optDate(form, "expiry") });
  revalidatePath(`/team/${staffId}`);
  redirect(`/team/${staffId}`);
}

export async function removeCert(form: FormData) {
  await requirePermission("staff.view");
  const staffId = Number(form.get("staffId"));
  await db.delete(schema.certifications).where(and(eq(schema.certifications.id, Number(form.get("certId"))), eq(schema.certifications.staffId, staffId)));
  revalidatePath(`/team/${staffId}`);
  redirect(`/team/${staffId}`);
}

/** "Same person": merge a duplicate staff record into another (Head Manager). */
export async function mergeInto(form: FormData) {
  const user = await requirePermission("staff.manage");
  const t = translator(user.locale);
  const fromId = Number(form.get("id")), toId = Number(form.get("into"));
  if (!toId || toId === fromId || fromId === user.id || form.get("confirm") !== "on")
    redirect(`/team/${fromId}?error=${encodeURIComponent(t("team.mergeErr"))}#merge`);
  await mergeStaff(fromId, toId);
  revalidatePath("/team"); revalidatePath("/jobs");
  redirect(`/team/${toId}?ok=${encodeURIComponent(t("team.merged"))}`);
}

/** A pay change from a date (raise, new salary). Work before that date keeps the old rate. */
export async function changePay(form: FormData) {
  const { me, go } = await boss();
  const id = Number(form.get("id"));
  const from = optDate(form, "effectiveFrom");
  const p = pay(form);
  if (!from) go(`/team/${id}`, "error", "pay.err.date");
  if (!(Number(p.payRate) > 0)) go(`/team/${id}`, "error", "pay.err.amount");
  await ensurePayBaseline(id, me.id);
  const R = schema.staffPayRates, v = { monthlySalary: p.monthlySalary, monthlyHours: p.monthlyHours, hourlyRate: p.monthlySalary ? hourlyFromSalary(Number(p.monthlySalary), Number(p.monthlyHours)).toFixed(4) : p.payRate, note: str(form, "note") || null, createdBy: me.id };
  await db.insert(R).values({ staffId: id, effectiveFrom: from!, ...v }).onConflictDoUpdate({ target: [R.staffId, R.effectiveFrom], set: v });
  await syncCurrentPay(id);
  revalidatePath(`/team/${id}`);
  go(`/team/${id}`, "ok", "pay.saved", { date: fmtDate(from!, true, me.locale) });
}

/** Remove a pay change entered by mistake (the first entry stays). */
export async function removePayChange(form: FormData) {
  const { go } = await boss();
  const id = Number(form.get("id")), rowId = Number(form.get("rowId"));
  const rows = await payHistory(id);
  if (rows.length > 1 && rows[0].id !== rowId) await db.delete(schema.staffPayRates).where(and(eq(schema.staffPayRates.id, rowId), eq(schema.staffPayRates.staffId, id)));
  await syncCurrentPay(id);
  revalidatePath(`/team/${id}`);
  go(`/team/${id}`, "ok", "pay.removed");
}

/** Paid overtime or not (e.g. the Supervisor is not). Changes the cost of overtime hours already logged too. */
export async function setOvertimeRule(form: FormData) {
  const { go } = await boss();
  const id = Number(form.get("id")), noOvertime = form.get("noOvertime") === "on";
  await db.update(schema.staff).set({ noOvertime }).where(eq(schema.staff.id, id));
  const s = (await loadLists()).settings;
  await db.update(schema.labourEntries).set({ rateMult: String(noOvertime ? 1 : s.otMultiplier) }).where(and(eq(schema.labourEntries.staffId, id), eq(schema.labourEntries.rateType, "ot")));
  revalidatePath(`/team/${id}`);
  go(`/team/${id}`, "ok", noOvertime ? "pay.noOtSaved" : "pay.otSaved");
}
