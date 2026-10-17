"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requirePermission } from "@/lib/auth";
import { BUILTIN, builtinHex, findItem, listItems, newCode, type ListName, type Priority } from "@/lib/lists";
import { loadLists } from "@/lib/lists-server";
import { builtinPlaceLabel, translator, type MessageKey, type T } from "@/i18n";

const LISTS: ListName[] = ["job_category", "machine_type", "bay", "qc_item"];
const PRIORITIES: Priority[] = ["critical", "high", "normal", "low"];
const ANCHOR: Record<ListName, string> = { job_category: "categories", machine_type: "types", bay: "bays", qc_item: "qc" };
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function done(t: T, anchor: string, msg: { ok?: MessageKey; error?: MessageKey }): never {
  revalidatePath("/", "layout");
  const q = msg.ok ? `ok=${encodeURIComponent(t(msg.ok))}` : msg.error ? `error=${encodeURIComponent(t(msg.error))}` : "";
  redirect(`/settings?${q}#${anchor}`);
}

/** The built-in name in the editor's language; typing it unchanged keeps the entry translated for everyone. */
function builtinName(t: T, list: ListName, code: string): string {
  if (list === "bay") return builtinPlaceLabel(t, code);
  const k = { job_category: `cat.${code}`, machine_type: `mtype.${code}`, qc_item: `qc.${code}` }[list];
  return t(k as MessageKey);
}

function itemFields(form: FormData, list: ListName) {
  const color = str(form, "color");
  const priority = str(form, "priority") as Priority;
  const grp = str(form, "newGroup") || str(form, "grp");
  return {
    color: list === "job_category" && /^#[0-9a-f]{6}$/i.test(color) ? color : null,
    priority: list === "job_category" && PRIORITIES.includes(priority) ? priority : null,
    grp: list === "machine_type" ? grp.slice(0, 60) || null : null,
  };
}

export async function saveItem(form: FormData) {
  const user = await requirePermission("settings.manage");
  const t = translator(user.locale);
  const list = str(form, "list") as ListName, code = str(form, "code");
  if (!LISTS.includes(list) || !findItem(list, code)) done(t, "top", { error: "set.err.unknown" });
  const anchor = ANCHOR[list];
  const builtin = BUILTIN.some((b) => b.list === list && b.code === code);
  let label: string | null = str(form, "label").slice(0, 120);
  if (!label) done(t, anchor, { error: "set.err.name" });
  if (builtin && label === builtinName(t, list, code)) label = null;
  const active = form.get("active") === "on";
  if (!active && listItems(list).length <= 1 && findItem(list, code)?.active) done(t, anchor, { error: "set.err.lastOne" });
  const f = itemFields(form, list);
  // An unchanged built-in colour keeps its theme colour (which also adapts to dark mode).
  if (builtin && f.color && f.color.toLowerCase() === builtinHex(code)?.toLowerCase()) f.color = null;
  const values = { label, active, ...f, sort: findItem(list, code)!.sort, updatedBy: user.id, updatedAt: new Date() };
  await db.insert(schema.listItems).values({ list, code, ...values })
    .onConflictDoUpdate({ target: [schema.listItems.list, schema.listItems.code], set: values });
  await loadLists();
  done(t, anchor, { ok: "set.saved" });
}

export async function addItem(form: FormData) {
  const user = await requirePermission("settings.manage");
  const t = translator(user.locale);
  const list = str(form, "list") as ListName;
  if (!LISTS.includes(list)) done(t, "top", { error: "set.err.unknown" });
  const anchor = ANCHOR[list];
  const label = str(form, "label").slice(0, 120);
  if (!label) done(t, anchor, { error: "set.err.name" });
  const all = listItems(list, { all: true });
  const lower = label.toLowerCase();
  const tl = (code: string) => (list === "bay" ? builtinPlaceLabel(t, code) : builtinName(t, list, code));
  if (all.some((i) => (i.label ?? tl(i.code)).toLowerCase() === lower || i.code.toLowerCase() === lower)) done(t, anchor, { error: "set.err.exists" });
  const f = itemFields(form, list);
  if (list === "machine_type" && !f.grp) done(t, anchor, { error: "set.err.group" });
  const sort = Math.max(0, ...all.map((i) => i.sort)) + 1;
  await db.insert(schema.listItems).values({ list, code: newCode(list, label), label, active: true, sort, ...f, priority: f.priority ?? (list === "job_category" ? "normal" : null), updatedBy: user.id });
  await loadLists();
  done(t, anchor, { ok: "set.added" });
}

/** Move an entry up or down in its list (and so in every drop-down). */
export async function moveItem(form: FormData) {
  const user = await requirePermission("settings.manage");
  const t = translator(user.locale);
  const list = str(form, "list") as ListName, code = str(form, "code"), dir = str(form, "dir") === "up" ? -1 : 1;
  if (!LISTS.includes(list)) done(t, "top", { error: "set.err.unknown" });
  const all = listItems(list, { all: true });
  const i = all.findIndex((x) => x.code === code), j = i + dir;
  if (i < 0 || j < 0 || j >= all.length) done(t, ANCHOR[list], {});
  const order = all.map((x) => x.code);
  [order[i], order[j]] = [order[j], order[i]];
  await db.transaction(async (tx) => {
    for (const [n, c] of order.entries()) {
      const it = all.find((x) => x.code === c)!;
      await tx.insert(schema.listItems).values({ list, code: c, label: it.label, grp: it.grp, color: it.builtin ? null : it.color, priority: it.builtin ? null : it.priority, active: it.active, sort: n, updatedBy: user.id })
        .onConflictDoUpdate({ target: [schema.listItems.list, schema.listItems.code], set: { sort: n } });
    }
  });
  await loadLists();
  done(t, ANCHOR[list], { ok: "set.saved" });
}

export async function saveWorkshop(form: FormData) {
  const user = await requirePermission("settings.manage");
  const t = translator(user.locale);
  const rate = Number(str(form, "labourRate")), limit = Number(str(form, "poApprovalLimit")), markup = Number(str(form, "jobPurchaseMarkup") || 25);
  if ([rate, limit, markup].some((n) => !Number.isFinite(n) || n < 0)) done(t, "workshop", { error: "set.err.number" });
  const values: Record<string, string> = {
    labourRate: String(rate), poApprovalLimit: String(limit), jobPurchaseMarkup: String(markup),
    companyName: str(form, "companyName").slice(0, 120), companyAddress: str(form, "companyAddress").slice(0, 400), companyPhone: str(form, "companyPhone").slice(0, 60), companyReg: str(form, "companyReg").slice(0, 60),
  };
  for (const [key, value] of Object.entries(values)) {
    await db.insert(schema.appSettings).values({ key, value, updatedBy: user.id })
      .onConflictDoUpdate({ target: schema.appSettings.key, set: { value, updatedBy: user.id, updatedAt: new Date() } });
  }
  await loadLists();
  done(t, "workshop", { ok: "set.saved" });
}
