"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission, type CurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { addDays, today } from "@/lib/format";
import { receiveStock, recordPrice } from "@/lib/inventory";
import { needsApproval, nextPoNo, poStatusAfterReceive } from "@/lib/stock";
import { addActivity } from "@/lib/queries";
import { translator, type MessageKey, type Vars } from "@/i18n";

const { purchaseOrders, poLines, suppliers, supplierParts, supplierPrices } = schema;
const n = (v: unknown) => Number(v ?? 0);

function back(user: CurrentUser, poId: number, kind: "error" | "ok", key: MessageKey, vars?: Vars): never {
  revalidatePath(`/purchasing/${poId}`);
  revalidatePath("/purchasing");
  revalidatePath("/parts");
  revalidatePath("/");
  redirect(`/purchasing/${poId}?${kind}=${encodeURIComponent(translator(user.locale)(key, vars))}`);
}

export type NewPoLine = { partId: number; supplierId: number; qty: number; price: number };

/** Raise one PO per supplier from the builder. New prices are added to each supplier's price history. */
export async function createPurchaseOrders(input: { lines: NewPoLine[]; jobId?: number | null; notes?: string }): Promise<{ error: string } | { ids: number[]; nos: string[]; awaiting: number }> {
  const user = await requirePermission("po.create");
  const t = translator(user.locale);
  const lines = input.lines.filter((l) => l.partId && l.supplierId && l.qty > 0);
  if (!lines.length) return { error: t("err.poNoLines") };
  if (lines.some((l) => !(l.price > 0))) return { error: t("err.price") };
  const supIds = [...new Set(lines.map((l) => l.supplierId))];
  const sups = await db.select().from(suppliers).where(inArray(suppliers.id, supIds));
  if (sups.length !== supIds.length) return { error: t("err.chooseSupplier") };
  const d = today(), year = Number(d.slice(0, 4));
  const made = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(4202)`);
    const existing = (await tx.select({ no: purchaseOrders.poNo }).from(purchaseOrders)).map((r) => r.no);
    const out: { id: number; no: string; awaiting: boolean }[] = [];
    for (const sup of sups) {
      const ls = lines.filter((l) => l.supplierId === sup.id);
      const total = ls.reduce((a, l) => a + l.qty * l.price, 0);
      const awaiting = needsApproval(user.role, total);
      const poNo = nextPoNo(year, [...existing, ...out.map((o) => o.no)]);
      const [po] = await tx.insert(purchaseOrders).values({
        poNo, supplierId: sup.id, status: awaiting ? "awaiting_approval" : "ordered", jobId: input.jobId || null, orderDate: d,
        eta: addDays(d, sup.leadTimeDays ?? 3), notes: input.notes?.trim() || null, createdBy: user.id,
        ...(awaiting ? {} : { approvedBy: user.id, approvedAt: new Date() }),
      }).returning({ id: purchaseOrders.id });
      for (const l of ls) {
        const [code] = await tx.select({ c: supplierParts.supplierPartNo }).from(supplierParts).where(and(eq(supplierParts.partId, l.partId), eq(supplierParts.supplierId, sup.id)));
        await tx.insert(poLines).values({ poId: po.id, partId: l.partId, qty: l.qty.toFixed(2), unitPrice: l.price.toFixed(2), supplierPartNo: code?.c ?? null });
        const [last] = await tx.select({ price: supplierPrices.price }).from(supplierPrices).where(and(eq(supplierPrices.partId, l.partId), eq(supplierPrices.supplierId, sup.id)))
          .orderBy(desc(supplierPrices.priceDate), desc(supplierPrices.id)).limit(1);
        if (!last || Number(last.price) !== Number(l.price.toFixed(2))) await recordPrice(tx, { partId: l.partId, supplierId: sup.id, price: l.price, source: "po", ref: poNo, staffId: user.id });
      }
      out.push({ id: po.id, no: poNo, awaiting });
    }
    return out;
  });
  if (input.jobId) for (const m of made) await addActivity(input.jobId, user.id, "act.poRaised", { po: m.no, name: user.name });
  revalidatePath("/purchasing");
  revalidatePath("/parts");
  return { ids: made.map((m) => m.id), nos: made.map((m) => m.no), awaiting: made.filter((m) => m.awaiting).length };
}

export async function approvePo(form: FormData) {
  const user = await requirePermission("po.approve");
  const id = Number(form.get("poId"));
  const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
  if (po?.status !== "awaiting_approval") back(user, id, "error", "err.poState");
  await db.update(purchaseOrders).set({ status: "ordered", approvedBy: user.id, approvedAt: new Date() }).where(eq(purchaseOrders.id, id));
  back(user, id, "ok", "ok.poApproved");
}

export async function cancelPo(form: FormData) {
  const user = await requirePermission("po.create");
  const id = Number(form.get("poId"));
  const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
  const received = (await db.select({ r: poLines.receivedQty }).from(poLines).where(eq(poLines.poId, id))).some((l) => n(l.r) > 0);
  if (!po || received || !["awaiting_approval", "ordered"].includes(po.status)) back(user, id, "error", "err.poState");
  if (po.status === "awaiting_approval" && po.createdBy !== user.id && !can(user.role, "po.approve")) back(user, id, "error", "err.noPermission");
  await db.update(purchaseOrders).set({ status: "cancelled" }).where(eq(purchaseOrders.id, id));
  back(user, id, "ok", "ok.poCancelled");
}

/** Goods received: stock in at the invoice price, average cost updated, price differences recorded. */
export async function receivePo(form: FormData) {
  const user = await requirePermission("po.create");
  const id = Number(form.get("poId"));
  const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
  if (!po || !["ordered", "partially_received"].includes(po.status)) back(user, id, "error", "err.poState");
  const lines = await db.select().from(poLines).where(eq(poLines.poId, id));
  const invoiceNo = String(form.get("invoiceNo") ?? "").trim() || null;
  const items = lines.map((l) => ({ l, qty: n(form.get(`qty-${l.id}`)), price: n(form.get(`price-${l.id}`)) || n(l.unitPrice) }))
    .filter((x) => x.qty > 0);
  if (!items.length) back(user, id, "error", "err.receiveQty");
  for (const x of items) {
    if (x.qty > n(x.l.qty) - n(x.l.receivedQty) + 1e-9) back(user, id, "error", "err.receiveTooMany");
    if (!(x.price > 0)) back(user, id, "error", "err.price");
  }
  let diffs = 0;
  await db.transaction(async (tx) => {
    const [r] = await tx.insert(schema.receipts).values({ poId: id, invoiceNo, receivedBy: user.id }).returning({ id: schema.receipts.id });
    for (const x of items) {
      await receiveStock(tx, { partId: x.l.partId, qty: x.qty, unitCost: x.price, poId: id, staffId: user.id, note: invoiceNo ? `Invoice ${invoiceNo}` : undefined });
      await tx.insert(schema.receiptLines).values({ receiptId: r.id, poLineId: x.l.id, qty: x.qty.toFixed(2), poPrice: x.l.unitPrice, invoicePrice: x.price.toFixed(2) });
      await tx.update(poLines).set({ receivedQty: (n(x.l.receivedQty) + x.qty).toFixed(2) }).where(eq(poLines.id, x.l.id));
      if (Math.abs(x.price - n(x.l.unitPrice)) >= 0.005) {
        diffs++;
        await recordPrice(tx, { partId: x.l.partId, supplierId: po.supplierId, price: x.price, source: "invoice", ref: invoiceNo ?? po.poNo, staffId: user.id });
      }
    }
    const after = await tx.select({ qty: poLines.qty, receivedQty: poLines.receivedQty }).from(poLines).where(eq(poLines.poId, id));
    await tx.update(purchaseOrders).set({ status: poStatusAfterReceive(after.map((a) => ({ qty: n(a.qty), receivedQty: n(a.receivedQty) }))) }).where(eq(purchaseOrders.id, id));
  });
  if (po.jobId) await addActivity(po.jobId, user.id, "act.poReceived", { po: po.poNo, name: user.name });
  back(user, id, "ok", diffs ? "ok.receivedDiff" : "ok.received", { n: diffs });
}

