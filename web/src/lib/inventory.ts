import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { today } from "./format";
import { latestPrices, sellFromMarkup, stockAfterIssue, weightedAverage } from "./stock";

const { parts, partCategories, supplierPrices, suppliers, poLines, purchaseOrders, stockMovements, jobParts } = schema;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const n = (v: string | number | null | undefined) => Number(v ?? 0);

/** Quantity on open POs (approved, not yet received), per part. */
export async function onOrderMap(partIds?: number[]): Promise<Map<number, number>> {
  const rows = await db
    .select({ partId: poLines.partId, q: sql<string>`sum(${poLines.qty} - ${poLines.receivedQty})` })
    .from(poLines).innerJoin(purchaseOrders, eq(poLines.poId, purchaseOrders.id))
    .where(and(inArray(purchaseOrders.status, ["ordered", "partially_received"]), partIds?.length ? inArray(poLines.partId, partIds) : undefined))
    .groupBy(poLines.partId);
  return new Map(rows.map((r) => [r.partId, n(r.q)]));
}

/** All price history rows for some parts, with supplier names. */
export async function priceHistory(partIds: number[]) {
  if (!partIds.length) return [];
  const rows = await db
    .select({ id: supplierPrices.id, partId: supplierPrices.partId, supplierId: supplierPrices.supplierId, supplierName: suppliers.name, price: supplierPrices.price,
      priceDate: supplierPrices.priceDate, source: supplierPrices.source, ref: supplierPrices.ref, leadTimeDays: suppliers.leadTimeDays })
    .from(supplierPrices).innerJoin(suppliers, eq(supplierPrices.supplierId, suppliers.id))
    .where(inArray(supplierPrices.partId, partIds))
    .orderBy(desc(supplierPrices.priceDate), desc(supplierPrices.id));
  return rows.map((r) => ({ ...r, price: n(r.price) }));
}
export type PriceRow = Awaited<ReturnType<typeof priceHistory>>[number];

/** Latest price per supplier for each part (cheapest first). */
export async function latestPricesByPart(partIds: number[]): Promise<Map<number, PriceRow[]>> {
  const hist = await priceHistory(partIds);
  const m = new Map<number, PriceRow[]>();
  for (const id of partIds) m.set(id, latestPrices(hist.filter((h) => h.partId === id)));
  return m;
}

export async function listParts() {
  const rows = await db
    .select({ p: parts, category: partCategories.name, markupPct: partCategories.markupPct, targetMarginPct: partCategories.targetMarginPct,
      models: sql<string[]>`coalesce((select array_agg(${schema.machineModels.model} order by ${schema.machineModels.model}) from ${schema.partModels} join ${schema.machineModels} on ${schema.machineModels.id} = ${schema.partModels.modelId} where ${schema.partModels.partId} = ${parts.id}), '{}')`,
      modelIds: sql<number[]>`coalesce((select array_agg(${schema.partModels.modelId}) from ${schema.partModels} where ${schema.partModels.partId} = ${parts.id}), '{}')` })
    .from(parts).innerJoin(partCategories, eq(parts.categoryId, partCategories.id))
    .where(eq(parts.active, true))
    .orderBy(asc(partCategories.name), asc(parts.description));
  const onOrder = await onOrderMap();
  return rows.map((r) => ({
    ...r.p, category: r.category, markupPct: n(r.markupPct), targetMarginPct: n(r.targetMarginPct), models: r.models ?? [], modelIds: (r.modelIds ?? []).map(Number),
    onHand: n(r.p.onHand), minLevel: n(r.p.minLevel), reorderQty: n(r.p.reorderQty), avgCost: n(r.p.avgCost), lastCost: r.p.lastCost === null ? null : n(r.p.lastCost),
    sellPrice: n(r.p.sellPrice), onOrder: onOrder.get(r.p.id) ?? 0,
  }));
}
export type PartRow = Awaited<ReturnType<typeof listParts>>[number];

/** Parts that fit a machine model (or fit all models). */
export async function partsForModel(modelId: number) {
  return (await listParts()).filter((p) => p.fitsAll || p.modelIds.includes(modelId));
}

/** Every stock part for a job, with the ones that fit the machine first (`fits`). */
export async function partsForJob(modelId: number) {
  const all = (await listParts()).map((p) => ({ ...p, fits: p.fitsAll || p.modelIds.includes(modelId) }));
  return [...all.filter((p) => p.fits), ...all.filter((p) => !p.fits)];
}

/** Parts bought from a supplier for one job (not from stock). */
export async function jobPurchasesFor(jobId: number) {
  const P = schema.jobPurchases;
  const rows = await db.select({ p: P, supplier: schema.suppliers.name, by: schema.staff.name }).from(P)
    .leftJoin(schema.suppliers, eq(P.supplierId, schema.suppliers.id)).leftJoin(schema.staff, eq(P.addedBy, schema.staff.id))
    .where(eq(P.jobId, jobId)).orderBy(asc(P.purchasedAt), asc(P.id));
  return rows.map(({ p, supplier, by }) => ({ ...p, supplier: supplier ?? p.supplierName, by, qty: n(p.qty), unitCost: n(p.unitCost), unitPrice: n(p.unitPrice) }));
}

/** Record a supplier price (never overwrites history). */
export async function recordPrice(tx: Tx, v: { partId: number; supplierId: number; price: number; source: "quote" | "po" | "invoice" | "import"; ref?: string | null; staffId: number | null; date?: string }) {
  await tx.insert(supplierPrices).values({ partId: v.partId, supplierId: v.supplierId, price: v.price.toFixed(2), priceDate: v.date ?? today(), source: v.source, ref: v.ref ?? null, createdBy: v.staffId });
}

/** Re-price a markup-priced part from its average cost. */
async function repriceIfMarkup(tx: Tx, partId: number) {
  const [p] = await tx.select({ mode: parts.pricingMode, avg: parts.avgCost, markup: partCategories.markupPct }).from(parts).innerJoin(partCategories, eq(parts.categoryId, partCategories.id)).where(eq(parts.id, partId));
  if (p?.mode === "markup") await tx.update(parts).set({ sellPrice: sellFromMarkup(n(p.avg), n(p.markup)).toFixed(2) }).where(eq(parts.id, partId));
}

/** Goods in: stock up, weighted average cost, last cost, movement. */
export async function receiveStock(tx: Tx, v: { partId: number; qty: number; unitCost: number; poId: number; staffId: number; note?: string }) {
  const [p] = await tx.select().from(parts).where(eq(parts.id, v.partId)).for("update");
  const onHand = n(p.onHand), avg = weightedAverage(onHand, n(p.avgCost), v.qty, v.unitCost), after = onHand + v.qty;
  await tx.update(parts).set({ onHand: after.toFixed(2), avgCost: avg.toFixed(4), lastCost: v.unitCost.toFixed(2), lowFlaggedAt: null, lowFlaggedBy: null }).where(eq(parts.id, v.partId));
  await tx.insert(stockMovements).values({ partId: v.partId, type: "receive", qty: v.qty.toFixed(2), unitCost: v.unitCost.toFixed(4), balanceAfter: after.toFixed(2), poId: v.poId, staffId: v.staffId, note: v.note ?? null });
  await repriceIfMarkup(tx, v.partId);
}

/** Parts out to a job at today's average cost (the last price paid if there is no average yet). Returns false if not
 *  enough on the shelf; bulk parts are always issued, and `force` issues a normal part beyond the count. */
export async function issueToJob(tx: Tx, v: { partId: number; qty: number; jobId: number; staffId: number; force?: boolean }): Promise<boolean> {
  const [p] = await tx.select().from(parts).where(eq(parts.id, v.partId)).for("update");
  const onHand = n(p.onHand);
  const after = stockAfterIssue(onHand, v.qty, p.bulk, v.force);
  if (after === null) return false;
  const cost = n(p.avgCost) > 0 ? p.avgCost : p.lastCost ?? p.avgCost;
  const note = onHand >= v.qty ? null : p.bulk ? `Bulk: ${v.qty} used, count showed ${onHand}` : `Issued beyond the count (showed ${onHand})`;
  await tx.update(parts).set({ onHand: after.toFixed(2) }).where(eq(parts.id, v.partId));
  await tx.insert(stockMovements).values({ partId: v.partId, type: "issue", qty: (after - onHand).toFixed(2), unitCost: cost, balanceAfter: after.toFixed(2), jobId: v.jobId, staffId: v.staffId, note });
  await tx.insert(jobParts).values({ jobId: v.jobId, partId: v.partId, qty: v.qty.toFixed(2), unitCost: cost, unitPrice: p.sellPrice, issuedBy: v.staffId });
  return true;
}

/** Stock-take: set the counted quantity and log the difference. */
export async function adjustStock(tx: Tx, v: { partId: number; counted: number; note: string; staffId: number }) {
  const [p] = await tx.select().from(parts).where(eq(parts.id, v.partId)).for("update");
  const diff = v.counted - n(p.onHand);
  if (diff === 0) return 0;
  await tx.update(parts).set({ onHand: v.counted.toFixed(2), ...(diff > 0 ? { lowFlaggedAt: null, lowFlaggedBy: null } : {}) }).where(eq(parts.id, v.partId));
  await tx.insert(stockMovements).values({ partId: v.partId, type: "adjust", qty: diff.toFixed(2), unitCost: p.avgCost, balanceAfter: v.counted.toFixed(2), staffId: v.staffId, note: v.note });
  return diff;
}

/** Parts issued to a job, with names. */
export async function jobPartsFor(jobId: number) {
  const rows = await db.select({ id: jobParts.id, partId: jobParts.partId, sku: parts.sku, oem: parts.oemPartNo, description: parts.description, uom: parts.uom, qty: jobParts.qty, unitCost: jobParts.unitCost, unitPrice: jobParts.unitPrice, issuedAt: jobParts.issuedAt })
    .from(jobParts).innerJoin(parts, eq(jobParts.partId, parts.id)).where(eq(jobParts.jobId, jobId)).orderBy(asc(jobParts.issuedAt));
  return rows.map((r) => ({ ...r, qty: n(r.qty), unitCost: n(r.unitCost), unitPrice: n(r.unitPrice) }));
}

/** Part requests on a job, with names. */
export async function requestsFor(jobId?: number, onlyOpen = false) {
  const rows = await db.select({ r: schema.partRequests, sku: parts.sku, oem: parts.oemPartNo, description: parts.description, uom: parts.uom, onHand: parts.onHand, bin: parts.bin, by: schema.staff.name, jobNo: schema.jobs.jobNo })
    .from(schema.partRequests).innerJoin(parts, eq(schema.partRequests.partId, parts.id)).innerJoin(schema.jobs, eq(schema.partRequests.jobId, schema.jobs.id))
    .leftJoin(schema.staff, eq(schema.partRequests.requestedBy, schema.staff.id))
    .where(and(jobId ? eq(schema.partRequests.jobId, jobId) : undefined, onlyOpen ? eq(schema.partRequests.status, "requested") : undefined))
    .orderBy(desc(schema.partRequests.createdAt));
  return rows.map((x) => ({ ...x.r, qty: n(x.r.qty), sku: x.sku, oem: x.oem, description: x.description, uom: x.uom, onHand: n(x.onHand), bin: x.bin, by: x.by, jobNo: x.jobNo }));
}

export const UNCATEGORISED = "Uncategorised";

/** A new part from a quick form (purchase order, record a purchase). No part no.: a workshop number ITEM-0001…
 *  Returns null if the part no. is already used (any case). */
export async function createQuickPart(tx: Tx | typeof db, v: { sku: string; description: string; uom: string; categoryId: number; bulk: boolean }) {
  let sku = v.sku.trim().slice(0, 60);
  if (sku) {
    const [dupe] = await tx.select({ id: parts.id }).from(parts).where(sql`lower(${parts.sku}) = lower(${sku})`);
    if (dupe) return null;
  } else {
    const [{ n: last }] = await tx.select({ n: sql<number>`coalesce(max(substring(${parts.sku} from '^ITEM-(\\d+)$')::int), 0)` }).from(parts);
    sku = `ITEM-${String(Number(last) + 1).padStart(4, "0")}`;
  }
  // No category chosen: "Uncategorised" (sort it out later on the part page).
  let categoryId = v.categoryId;
  if (!categoryId) {
    const C = schema.partCategories;
    const [c] = await tx.insert(C).values({ name: UNCATEGORISED }).onConflictDoNothing().returning({ id: C.id });
    categoryId = c?.id ?? (await tx.select({ id: C.id }).from(C).where(eq(C.name, UNCATEGORISED)))[0].id;
  }
  const [row] = await tx.insert(parts).values({ sku, oemPartNo: v.sku.trim() || null, description: v.description.trim().slice(0, 200), uom: v.uom.trim().slice(0, 20) || "pc",
    categoryId, fitsAll: true, bulk: v.bulk }).returning({ id: parts.id, sku: parts.sku, description: parts.description, uom: parts.uom, bulk: parts.bulk });
  return row;
}
