import "server-only";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";

const n = (v: unknown) => Number(v ?? 0);

export async function listPos() {
  const pos = await db.select({ po: schema.purchaseOrders, supplier: schema.suppliers.name, jobNo: schema.jobs.jobNo })
    .from(schema.purchaseOrders).innerJoin(schema.suppliers, eq(schema.purchaseOrders.supplierId, schema.suppliers.id))
    .leftJoin(schema.jobs, eq(schema.purchaseOrders.jobId, schema.jobs.id)).orderBy(desc(schema.purchaseOrders.id));
  const lines = pos.length ? await db.select().from(schema.poLines).where(inArray(schema.poLines.poId, pos.map((p) => p.po.id))) : [];
  return pos.map((p) => {
    const ls = lines.filter((l) => l.poId === p.po.id);
    return { ...p.po, supplier: p.supplier, jobNo: p.jobNo, lineCount: ls.length, total: ls.reduce((a, l) => a + n(l.qty) * n(l.unitPrice), 0),
      qty: ls.reduce((a, l) => a + n(l.qty), 0), received: ls.reduce((a, l) => a + n(l.receivedQty), 0) };
  });
}

export async function getPo(id: number) {
  const [row] = await db.select({ po: schema.purchaseOrders, supplier: schema.suppliers, jobNo: schema.jobs.jobNo }).from(schema.purchaseOrders)
    .innerJoin(schema.suppliers, eq(schema.purchaseOrders.supplierId, schema.suppliers.id)).leftJoin(schema.jobs, eq(schema.purchaseOrders.jobId, schema.jobs.id))
    .where(eq(schema.purchaseOrders.id, id));
  if (!row) return null;
  const [lines, receipts, people] = await Promise.all([
    db.select({ l: schema.poLines, sku: schema.parts.sku, oem: schema.parts.oemPartNo, description: schema.parts.description, uom: schema.parts.uom })
      .from(schema.poLines).innerJoin(schema.parts, eq(schema.poLines.partId, schema.parts.id)).where(eq(schema.poLines.poId, id)).orderBy(asc(schema.poLines.id)),
    db.select({ r: schema.receipts, by: schema.staff.name }).from(schema.receipts).leftJoin(schema.staff, eq(schema.receipts.receivedBy, schema.staff.id)).where(eq(schema.receipts.poId, id)).orderBy(asc(schema.receipts.receivedAt)),
    db.select({ id: schema.staff.id, name: schema.staff.name }).from(schema.staff),
  ]);
  const rlines = receipts.length ? await db.select().from(schema.receiptLines).where(inArray(schema.receiptLines.receiptId, receipts.map((r) => r.r.id))) : [];
  const name = (sid: number | null) => people.find((p) => p.id === sid)?.name ?? null;
  return {
    ...row,
    createdByName: name(row.po.createdBy), approvedByName: name(row.po.approvedBy),
    lines: lines.map((x) => ({ ...x.l, qty: n(x.l.qty), unitPrice: n(x.l.unitPrice), receivedQty: n(x.l.receivedQty), sku: x.sku, oem: x.oem, description: x.description, uom: x.uom })),
    receipts: receipts.map((r) => ({ ...r.r, by: r.by, lines: rlines.filter((x) => x.receiptId === r.r.id).map((x) => ({ ...x, qty: n(x.qty), poPrice: n(x.poPrice), invoicePrice: n(x.invoicePrice) })) })),
  };
}
