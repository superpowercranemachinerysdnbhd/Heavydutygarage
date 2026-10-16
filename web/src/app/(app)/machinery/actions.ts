"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission, requireUser } from "@/lib/auth";
import { translator, type MessageKey } from "@/i18n";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const optInt = (f: FormData, k: string) => { const v = str(f, k); return v === "" ? null : Number.isInteger(Number(v)) ? Number(v) : NaN; };
const optDate = (f: FormData, k: string) => { const v = str(f, k); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; };

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

export async function addKnownIssue(form: FormData) {
  const user = await requireUser();
  const t = translator(user.locale);
  const modelId = Number(form.get("modelId")), title = str(form, "title"), fix = str(form, "fix");
  if (!title || !fix) redirect(`/machinery/models/${modelId}?error=${encodeURIComponent(t("err.issueFields"))}`);
  await db.insert(schema.knownIssues).values({ modelId, title, fix, addedBy: user.id });
  revalidatePath(`/machinery/models/${modelId}`);
  redirect(`/machinery/models/${modelId}?ok=${encodeURIComponent(t("mod.issueAdded"))}`);
}

function unitValues(form: FormData) {
  return {
    modelId: Number(form.get("modelId")), customerId: Number(form.get("customerId")), serialNo: str(form, "serialNo"),
    engineNo: str(form, "engineNo") || null, plateNo: str(form, "plateNo") || null, year: optInt(form, "year"),
    hourMeter: optInt(form, "hourMeter") ?? 0, location: str(form, "location") || "Customer site", arrivedAt: optDate(form, "arrivedAt"),
    nextServiceDate: optDate(form, "nextServiceDate"), nextServiceType: str(form, "nextServiceType") || null, notes: str(form, "notes") || null,
  };
}
function unitProblem(v: ReturnType<typeof unitValues>): MessageKey | null {
  if (!v.modelId || !v.customerId) return "err.unitModelOwner";
  if (!v.serialNo) return "err.serial";
  if (Number.isNaN(v.year) || Number.isNaN(v.hourMeter) || (v.hourMeter ?? 0) < 0) return "err.yearHm";
  return null;
}

export async function createUnit(form: FormData) {
  const t = translator((await requirePermission("machine.manage")).locale);
  const v = unitValues(form), p = unitProblem(v);
  if (p) redirect("/machinery/new?error=" + encodeURIComponent(t(p)));
  const [row] = await db.insert(schema.machineUnits).values(v).returning({ id: schema.machineUnits.id });
  revalidatePath("/machinery");
  redirect(`/machinery/${row.id}?ok=${encodeURIComponent(t("mach.added"))}`);
}

export async function updateUnit(form: FormData) {
  const t = translator((await requirePermission("machine.manage")).locale);
  const id = Number(form.get("unitId")), v = unitValues(form), p = unitProblem(v);
  if (p) redirect(`/machinery/${id}?error=${encodeURIComponent(t(p))}`);
  await db.update(schema.machineUnits).set(v).where(eq(schema.machineUnits.id, id));
  revalidatePath(`/machinery/${id}`);
  redirect(`/machinery/${id}?ok=${encodeURIComponent(t("mach.updated"))}`);
}
