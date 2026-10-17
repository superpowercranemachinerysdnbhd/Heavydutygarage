"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requirePermission, requireUser } from "@/lib/auth";
import { translator } from "@/i18n";
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
