"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission, type CurrentUser } from "@/lib/auth";
import { readStoredFile, saveFile } from "@/lib/storage";
import { applyImport, parseAppSheet } from "@/lib/import-appsheet";
import { translator, type MessageKey, type Vars } from "@/i18n";

const FILE = /^imports\/[0-9a-f-]{36}\.xlsx$/;
const MAX = 15 * 1024 * 1024;

function go(user: CurrentUser, q: string, msg?: { error?: MessageKey; ok?: MessageKey; vars?: Vars }): never {
  const t = translator(user.locale);
  const m = msg?.error ? `error=${encodeURIComponent(t(msg.error, msg.vars))}` : msg?.ok ? `ok=${encodeURIComponent(t(msg.ok, msg.vars))}` : "";
  redirect(`/settings/import?${[q, m].filter(Boolean).join("&")}`);
}

/** Step 1: keep the uploaded workbook and show what it contains. */
export async function uploadWorkbook(form: FormData) {
  const user = await requirePermission("settings.manage");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) go(user, "", { error: "as.err.noFile" });
  if (file.size > MAX || !/\.xlsx$/i.test(file.name)) go(user, "", { error: "as.err.type" });
  const buf = Buffer.from(await file.arrayBuffer());
  try { parseAppSheet(buf); } catch { go(user, "", { error: "as.err.read" }); }
  const rel = await saveFile("imports", buf, "xlsx");
  go(user, `f=${encodeURIComponent(rel)}`);
}

/** Step 2: import (adds only what is missing, so running it twice changes nothing). */
export async function runImport(form: FormData) {
  const user = await requirePermission("settings.manage");
  const rel = String(form.get("f") ?? "");
  if (!FILE.test(rel)) go(user, "", { error: "as.err.noFile" });
  const data = parseAppSheet(await readStoredFile(rel));
  const r = await applyImport(data, user.id, Number(form.get("owner")) || undefined);
  revalidatePath("/", "layout");
  go(user, `f=${encodeURIComponent(rel)}&done=1`, { ok: "as.done", vars: { wo: r.workOrders, m: r.machines, s: r.staff, p: r.parts, sup: r.suppliers, l: r.labour, b: r.bills + r.usedParts } });
}
