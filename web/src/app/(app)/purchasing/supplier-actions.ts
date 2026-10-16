"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, desc, eq, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/lib/auth";
import { recordPrice } from "@/lib/inventory";
import { isBigPriceChange, parsePriceCsv, priceChangePct } from "@/lib/stock";
import { translator } from "@/i18n";

const { suppliers, parts, supplierParts, supplierPrices } = schema;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const values = (f: FormData) => ({
  name: str(f, "name"), contactName: str(f, "contactName") || null, phone: str(f, "phone") || null, email: str(f, "email") || null,
  address: str(f, "address") || null, paymentTerms: str(f, "paymentTerms") || null, leadTimeDays: Number(f.get("leadTimeDays")) || null,
  notes: str(f, "notes") || null,
});

export async function saveSupplier(form: FormData) {
  const user = await requirePermission("po.create");
  const t = translator(user.locale);
  const id = Number(form.get("id")) || null, v = values(form);
  if (!v.name) redirect(`${id ? `/purchasing/suppliers/${id}` : "/purchasing/suppliers"}?error=${encodeURIComponent(t("err.supplierName"))}`);
  let sid = id;
  if (id) await db.update(suppliers).set({ ...v, active: form.get("active") !== "0" }).where(eq(suppliers.id, id));
  else sid = (await db.insert(suppliers).values(v).returning({ id: suppliers.id }))[0].id;
  revalidatePath("/purchasing/suppliers");
  redirect(`/purchasing/suppliers/${sid}?ok=${encodeURIComponent(t("ok.saved"))}`);
}

/** Called from the PO builder without leaving the page. */
export async function quickSupplier(input: { name: string; phone?: string; paymentTerms?: string; leadTimeDays?: number | null }): Promise<{ id: number; name: string } | { error: string }> {
  const user = await requirePermission("po.create");
  const name = input.name.trim();
  if (!name) return { error: translator(user.locale)("err.supplierName") };
  const [existing] = await db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).where(eq(suppliers.name, name));
  if (existing) return existing;
  const [row] = await db.insert(suppliers).values({ name, phone: input.phone?.trim() || null, paymentTerms: input.paymentTerms?.trim() || null, leadTimeDays: input.leadTimeDays || null }).returning({ id: suppliers.id, name: suppliers.name });
  return row;
}

export type ImportResult = { error?: string; updated?: number; unchanged?: number; unmatched?: { line: number; partNo: string }[]; problems?: { line: number; reason: string }[]; bigChanges?: { sku: string; from: number; to: number; pct: number }[] };

export async function importPrices(_: ImportResult, form: FormData): Promise<ImportResult> {
  const user = await requirePermission("po.create");
  const t = translator(user.locale);
  const supplierId = Number(form.get("supplierId"));
  const file = form.get("file");
  if (!supplierId) return { error: t("err.chooseSupplier") };
  if (!(file instanceof File) || !file.size) return { error: t("imp.noFile") };
  if (file.size > 2 * 1024 * 1024) return { error: t("imp.tooBig") };
  const parsed = parsePriceCsv(await file.text());
  if (!parsed.ok) return { error: t("imp.badHeader") };
  const date = /^\d{4}-\d{2}-\d{2}$/.test(str(form, "date")) ? str(form, "date") : undefined;
  let updated = 0, unchanged = 0;
  const unmatched: { line: number; partNo: string }[] = [], bigChanges: ImportResult["bigChanges"] = [];
  await db.transaction(async (tx) => {
    for (const r of parsed.rows) {
      const key = r.partNo.toUpperCase();
      const [byCode] = await tx.select({ partId: supplierParts.partId }).from(supplierParts).where(and(eq(supplierParts.supplierId, supplierId), eq(supplierParts.supplierPartNo, r.partNo)));
      const [p] = byCode ? [{ id: byCode.partId }] : await tx.select({ id: parts.id }).from(parts).where(or(eq(parts.sku, key), eq(parts.oemPartNo, r.partNo), eq(parts.oemPartNo, key)));
      if (!p) { unmatched.push({ line: r.line, partNo: r.partNo }); continue; }
      const [last] = await tx.select({ price: supplierPrices.price }).from(supplierPrices).where(and(eq(supplierPrices.partId, p.id), eq(supplierPrices.supplierId, supplierId))).orderBy(desc(supplierPrices.priceDate), desc(supplierPrices.id)).limit(1);
      const old = last ? Number(last.price) : null;
      if (old === r.price) { unchanged++; continue; }
      await recordPrice(tx, { partId: p.id, supplierId, price: r.price, source: "import", ref: file.name.slice(0, 80), staffId: user.id, date });
      if (r.supplierPartNo) await tx.insert(supplierParts).values({ partId: p.id, supplierId, supplierPartNo: r.supplierPartNo }).onConflictDoUpdate({ target: [supplierParts.partId, supplierParts.supplierId], set: { supplierPartNo: r.supplierPartNo } });
      if (isBigPriceChange(old, r.price)) bigChanges.push({ sku: r.partNo, from: old!, to: r.price, pct: priceChangePct(old, r.price)! });
      updated++;
    }
  });
  revalidatePath("/parts");
  return { updated, unchanged, unmatched, bigChanges, problems: parsed.problems.map((p) => ({ line: p.line, reason: t(p.reason === "noPrice" ? "imp.noPrice" : "imp.noPartNo") })) };
}
