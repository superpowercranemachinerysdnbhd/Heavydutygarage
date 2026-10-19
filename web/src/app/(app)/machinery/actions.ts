"use server";
import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requirePermission, requireUser } from "@/lib/auth";
import { translator, type MessageKey } from "@/i18n";
import { findItem, listItems } from "@/lib/lists";
import { nextDueFrom } from "@/lib/service-rules";
import { markServiceDone } from "@/lib/services";
import { today } from "@/lib/format";
import { saveMachine } from "@/lib/machines";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function createModel(form: FormData) {
  const t = translator((await requirePermission("machine.manage")).locale);
  const make = str(form, "make"), model = str(form, "model"), type = str(form, "type");
  if (!make || !model || !type) redirect("/machinery/models?error=" + encodeURIComponent(t("err.modelFields")));
  const specs: Record<string, string> = {};
  for (const line of str(form, "specs").split("\n")) { const [k, ...v] = line.split(":"); if (k?.trim() && v.join(":").trim()) specs[k.trim()] = v.join(":").trim(); }
  const intervals = str(form, "intervals").split(/[,\s/]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const [row] = await db.insert(schema.machineModels).values({ make, model, type, specs, serviceIntervals: intervals }).returning({ id: schema.machineModels.id });
  revalidatePath("/machinery/models");
  redirect(`/machinery/models/${row.id}?ok=${encodeURIComponent(t("mod.added"))}`);
}

const specsFrom = (form: FormData) => {
  const specs: Record<string, string> = {};
  for (const line of str(form, "specs").split("\n")) { const [k, ...v] = line.split(":"); if (k?.trim() && v.join(":").trim()) specs[k.trim()] = v.join(":").trim(); }
  return specs;
};
const intervalsFrom = (form: FormData) => str(form, "intervals").split(/[,\s/]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0);

export async function updateModel(form: FormData) {
  const t = translator((await requirePermission("machine.manage")).locale);
  const id = Number(form.get("modelId"));
  const make = str(form, "make"), model = str(form, "model"), type = str(form, "type");
  const back = (q: string): never => redirect(`/machinery/models/${id}?${q}`);
  if (!make || !model || !type) back("error=" + encodeURIComponent(t("err.modelFields")));
  const M = schema.machineModels;
  const [dup] = await db.select({ id: M.id }).from(M).where(and(sql`lower(${M.make}) = lower(${make})`, sql`lower(${M.model}) = lower(${model})`, ne(M.id, id)));
  if (dup) back("error=" + encodeURIComponent(t("mod.duplicate")));
  await db.update(M).set({ make, model, type, specs: specsFrom(form), serviceIntervals: intervalsFrom(form) }).where(eq(M.id, id));
  revalidatePath("/machinery", "layout");
  back("ok=" + encodeURIComponent(t("mod.saved")));
}

export async function addKnownIssue(form: FormData) {
  const user = await requireUser();
  const t = translator(user.locale);
  const modelId = Number(form.get("modelId")), title = str(form, "title"), fix = str(form, "fix");
  if (!title || !fix) redirect(`/machinery/models/${modelId}?error=${encodeURIComponent(t("err.issueFields"))}`);
  await db.insert(schema.knownIssues).values({ modelId, title, fix, addedBy: user.id });
  revalidatePath(`/machinery/models/${modelId}`);
  redirect(`/machinery/models/${modelId}?ok=${encodeURIComponent(t("mod.issueAdded"))}`);
}

export async function createUnit(form: FormData) {
  const t = translator((await requirePermission("machine.manage")).locale);
  const r = await saveMachine(form, { full: true });
  if (!r.ok) redirect("/machinery/new?error=" + encodeURIComponent(t(r.error)));
  revalidatePath("/machinery");
  redirect(`/machinery/${r.id}?ok=${encodeURIComponent(t("mach.added"))}`);
}

export async function updateUnit(form: FormData) {
  const t = translator((await requirePermission("machine.manage")).locale);
  const id = Number(form.get("unitId"));
  const r = await saveMachine(form, { unitId: id, full: true });
  if (!r.ok) redirect(`/machinery/${id}?error=${encodeURIComponent(t(r.error))}`);
  revalidatePath(`/machinery/${id}`);
  redirect(`/machinery/${id}?ok=${encodeURIComponent(t("mach.updated"))}`);
}

/* ---------- service schedule ---------- */
const isoOrNull = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const backToServices = (unitId: number, t: (k: MessageKey) => string, msg: { ok?: MessageKey; error?: MessageKey }): never =>
  redirect(`/machinery/${unitId}?${msg.ok ? `ok=${encodeURIComponent(t(msg.ok))}` : `error=${encodeURIComponent(t(msg.error!))}`}#services`);

/** Add or update one service item on a machine: last done, interval (months), next due (blank = worked out), notes. */
export async function saveService(form: FormData) {
  const user = await requirePermission("machine.manage");
  const t = translator(user.locale);
  const unitId = Number(form.get("unitId")), item = str(form, "item");
  if (!unitId || !item || !findItem("service_item", item)) backToServices(unitId, t, { error: "svc.err.item" });
  const monthsRaw = str(form, "intervalMonths");
  const months = monthsRaw === "" ? findItem("service_item", item)?.num ?? null : Number(monthsRaw);
  if (months !== null && !(Number.isInteger(months) && months > 0 && months <= 120)) backToServices(unitId, t, { error: "svc.err.months" });
  const lastDone = isoOrNull(str(form, "lastDone"));
  const values = { intervalMonths: months, lastDone, nextDue: nextDueFrom(lastDone, months, isoOrNull(str(form, "nextDue"))), notes: str(form, "notes") || null, updatedBy: user.id, updatedAt: new Date() };
  const S = schema.machineServices;
  await db.insert(S).values({ unitId, item, ...values }).onConflictDoUpdate({ target: [S.unitId, S.item], set: values });
  revalidatePath(`/machinery/${unitId}`);
  backToServices(unitId, t, { ok: "svc.saved" });
}

/** Add every service item from Settings that the machine does not have yet (dates left blank). */
export async function addStandardServices(form: FormData) {
  const user = await requirePermission("machine.manage");
  const t = translator(user.locale);
  const unitId = Number(form.get("unitId"));
  const S = schema.machineServices;
  const have = new Set((await db.select({ item: S.item }).from(S).where(eq(S.unitId, unitId))).map((r) => r.item));
  const add = listItems("service_item").filter((i) => !have.has(i.code));
  if (add.length) await db.insert(S).values(add.map((i) => ({ unitId, item: i.code, intervalMonths: i.num, updatedBy: user.id })));
  revalidatePath(`/machinery/${unitId}`);
  backToServices(unitId, t, { ok: "svc.saved" });
}

export async function serviceDoneToday(form: FormData) {
  const user = await requirePermission("machine.manage");
  const t = translator(user.locale);
  const unitId = Number(form.get("unitId")), item = str(form, "item");
  await markServiceDone(unitId, item, today(), user.id, null);
  revalidatePath(`/machinery/${unitId}`);
  backToServices(unitId, t, { ok: "svc.doneTodayOk" });
}

export async function removeService(form: FormData) {
  const user = await requirePermission("machine.manage");
  const t = translator(user.locale);
  const unitId = Number(form.get("unitId")), item = str(form, "item");
  await db.delete(schema.machineServices).where(and(eq(schema.machineServices.unitId, unitId), eq(schema.machineServices.item, item)));
  revalidatePath(`/machinery/${unitId}`);
  backToServices(unitId, t, { ok: "svc.removed" });
}

/** A new QR sticker secret for a machine (old stickers stop working, e.g. when one was lost or misused). */
export async function newReportToken(form: FormData) {
  const user = await requirePermission("machine.manage");
  const id = Number(form.get("id"));
  const token = randomBytes(10).toString("hex");
  await db.update(schema.machineUnits).set({ reportToken: token }).where(eq(schema.machineUnits.id, id));
  redirect(`/machinery/${id}/qr?ok=${encodeURIComponent(translator(user.locale)("qr.newDone"))}`);
}
