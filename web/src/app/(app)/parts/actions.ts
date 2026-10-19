"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { adjustStock, recordPrice } from "@/lib/inventory";
import { isBigPriceChange, priceChangePct, sellFromMarkup } from "@/lib/stock";
import { STANDARD_PART_CATEGORIES } from "@/lib/part-categories";
import { translator, type MessageKey, type Vars } from "@/i18n";

const { parts, partCategories, partModels, suppliers, supplierParts, supplierPrices } = schema;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => { const v = Number(String(f.get(k) ?? "").replace(/,/g, "")); return Number.isFinite(v) ? v : NaN; };

function goto(path: string, locale: Parameters<typeof translator>[0], kind: "error" | "ok", key: MessageKey, vars?: Vars): never {
  revalidatePath(path);
  revalidatePath("/parts");
  redirect(`${path}?${kind}=${encodeURIComponent(translator(locale)(key, vars))}`);
}

/** Create a supplier from inline fields (used on part and PO pages). Returns its id. */
export async function ensureSupplier(f: { id?: number; name?: string; phone?: string; terms?: string; leadTimeDays?: number | null }): Promise<number | null> {
  if (f.id) return f.id;
  const name = (f.name ?? "").trim();
  if (!name) return null;
  const [existing] = await db.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.name, name));
  if (existing) return existing.id;
  const [row] = await db.insert(suppliers).values({ name, phone: f.phone?.trim() || null, paymentTerms: f.terms?.trim() || null, leadTimeDays: f.leadTimeDays ?? null }).returning({ id: suppliers.id });
  return row.id;
}

export async function savePart(form: FormData) {
  const user = await requirePermission("stock.manage");
  const id = num(form, "id") || null;
  const back = id ? `/parts/${id}` : "/parts/new";
  const sku = str(form, "sku").toUpperCase(), description = str(form, "description");
  let categoryId = num(form, "categoryId");
  const newCat = str(form, "newCategory");
  if (!sku || !description) goto(back, user.locale, "error", "err.partFields");
  const [dupe] = await db.select({ id: parts.id }).from(parts).where(id ? and(eq(parts.sku, sku), ne(parts.id, id)) : eq(parts.sku, sku));
  if (dupe) goto(back, user.locale, "error", "err.skuUsed", { sku });
  if (newCat) {
    const [c] = await db.insert(partCategories).values({ name: newCat }).onConflictDoNothing().returning({ id: partCategories.id });
    categoryId = c?.id ?? (await db.select({ id: partCategories.id }).from(partCategories).where(eq(partCategories.name, newCat)))[0].id;
  }
  if (!categoryId) goto(back, user.locale, "error", "err.partCategory");
  const values = {
    sku, description, categoryId, oemPartNo: str(form, "oemPartNo") || null, uom: str(form, "uom") || "pc", bin: str(form, "bin") || null,
    minLevel: String(Math.max(0, num(form, "minLevel") || 0)), reorderQty: String(Math.max(0, num(form, "reorderQty") || 0)),
    fitsAll: form.get("fitsAll") === "on", notes: str(form, "notes") || null,
  };
  const modelIds = form.getAll("modelIds").map(Number).filter(Boolean);
  const partId = await db.transaction(async (tx) => {
    let pid = id;
    if (pid) await tx.update(parts).set(values).where(eq(parts.id, pid));
    else pid = (await tx.insert(parts).values(values).returning({ id: parts.id }))[0].id;
    await tx.delete(partModels).where(eq(partModels.partId, pid));
    if (modelIds.length && !values.fitsAll) await tx.insert(partModels).values(modelIds.map((m) => ({ partId: pid!, modelId: m })));
    return pid;
  });
  goto(`/parts/${partId}`, user.locale, "ok", "ok.saved");
}

export async function setPricing(form: FormData) {
  const user = await requirePermission("price.set");
  const id = num(form, "id"), mode = str(form, "pricingMode") === "fixed" ? "fixed" : "markup";
  const [p] = await db.select({ avg: parts.avgCost, markup: partCategories.markupPct }).from(parts).innerJoin(partCategories, eq(parts.categoryId, partCategories.id)).where(eq(parts.id, id));
  const sell = mode === "fixed" ? num(form, "sellPrice") : sellFromMarkup(Number(p.avg), Number(p.markup));
  if (!(sell >= 0)) goto(`/parts/${id}`, user.locale, "error", "err.sellPrice");
  await db.update(parts).set({ pricingMode: mode, sellPrice: sell.toFixed(2) }).where(eq(parts.id, id));
  goto(`/parts/${id}`, user.locale, "ok", "ok.saved");
}

export async function addQuote(form: FormData) {
  const user = await requirePermission("po.create");
  const partId = num(form, "partId"), price = num(form, "price");
  const supplierId = await ensureSupplier({ id: num(form, "supplierId") || undefined, name: str(form, "newSupplier"), phone: str(form, "newPhone") });
  if (!supplierId) goto(`/parts/${partId}`, user.locale, "error", "err.chooseSupplier");
  if (!(price > 0)) goto(`/parts/${partId}`, user.locale, "error", "err.price");
  const [last] = await db.select({ price: supplierPrices.price }).from(supplierPrices).where(and(eq(supplierPrices.partId, partId), eq(supplierPrices.supplierId, supplierId)))
    .orderBy(desc(supplierPrices.priceDate), desc(supplierPrices.id)).limit(1);
  await db.transaction(async (tx) => {
    await recordPrice(tx, { partId, supplierId, price, source: "quote", ref: str(form, "ref") || null, staffId: user.id });
    const code = str(form, "supplierPartNo");
    if (code) await tx.insert(supplierParts).values({ partId, supplierId, supplierPartNo: code }).onConflictDoUpdate({ target: [supplierParts.partId, supplierParts.supplierId], set: { supplierPartNo: code } });
  });
  const old = last ? Number(last.price) : null;
  if (isBigPriceChange(old, price)) goto(`/parts/${partId}`, user.locale, "ok", "ok.priceSavedBig", { pct: priceChangePct(old, price)! });
  goto(`/parts/${partId}`, user.locale, "ok", "ok.priceSaved");
}

export async function stockTake(form: FormData) {
  const user = await requirePermission("stock.manage");
  const partId = num(form, "partId"), counted = num(form, "counted"), note = str(form, "note");
  if (!(counted >= 0)) goto(`/parts/${partId}`, user.locale, "error", "err.counted");
  if (!note) goto(`/parts/${partId}`, user.locale, "error", "err.adjustNote");
  const diff = await db.transaction((tx) => adjustStock(tx, { partId, counted, note, staffId: user.id }));
  goto(`/parts/${partId}`, user.locale, "ok", diff === 0 ? "ok.noChange" : "ok.stockAdjusted", { diff: diff > 0 ? `+${diff}` : String(diff) });
}

/** Rename a category (Supervisor, Head Manager); the Head Manager also sets its markup and target margin. */
export async function saveCategory(form: FormData) {
  const user = await requirePermission("stock.manage");
  const id = num(form, "id"), name = str(form, "name").slice(0, 80);
  if (name) {
    const [dup] = await db.select({ id: partCategories.id }).from(partCategories).where(sql`lower(${partCategories.name}) = lower(${name})`);
    if (dup && dup.id !== id) goto("/parts/categories", user.locale, "error", "err.categoryTaken");
    await db.update(partCategories).set({ name }).where(eq(partCategories.id, id));
  }
  if (!can(user.role, "price.set") || !form.has("markupPct")) goto("/parts/categories", user.locale, "ok", "ok.saved");
  const markup = num(form, "markupPct"), target = num(form, "targetMarginPct");
  if (!(markup >= 0) || !(target >= 0 && target < 100)) goto("/parts/categories", user.locale, "error", "err.percent");
  await db.transaction(async (tx) => {
    await tx.update(partCategories).set({ markupPct: String(markup), targetMarginPct: String(target) }).where(eq(partCategories.id, id));
    const list = await tx.select({ id: parts.id, avg: parts.avgCost }).from(parts).where(and(eq(parts.categoryId, id), eq(parts.pricingMode, "markup")));
    for (const p of list) await tx.update(parts).set({ sellPrice: sellFromMarkup(Number(p.avg), markup).toFixed(2) }).where(eq(parts.id, p.id));
  });
  goto("/parts/categories", user.locale, "ok", "ok.markupSaved");
}

/** Delete a category that no part uses. */
export async function deleteCategory(form: FormData) {
  const user = await requirePermission("stock.manage");
  const id = num(form, "id");
  const [used] = await db.select({ id: parts.id }).from(parts).where(eq(parts.categoryId, id)).limit(1);
  if (used) goto("/parts/categories", user.locale, "error", "err.categoryUsed");
  await db.delete(partCategories).where(eq(partCategories.id, id));
  goto("/parts/categories", user.locale, "ok", "ok.categoryDeleted");
}

/** Add any of the standard heavy-machinery categories that are missing. */
export async function addStandardCategories() {
  const user = await requirePermission("stock.manage");
  await db.insert(partCategories).values(STANDARD_PART_CATEGORIES.map(([name, m]) => ({ name, markupPct: String(m) }))).onConflictDoNothing();
  goto("/parts/categories", user.locale, "ok", "ok.saved");
}

export async function addCategory(form: FormData) {
  const user = await requirePermission("stock.manage");
  const name = str(form, "name");
  if (!name) goto("/parts/categories", user.locale, "error", "err.partCategory");
  await db.insert(partCategories).values({ name, ...(can(user.role, "price.set") ? { markupPct: String(num(form, "markupPct") || 40) } : {}) }).onConflictDoNothing();
  goto("/parts/categories", user.locale, "ok", "ok.saved");
}
