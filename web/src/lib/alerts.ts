import "server-only";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CurrentUser } from "./auth";
import { can } from "./permissions";
import { addDays, today } from "./format";
import { listParts, requestsFor } from "./inventory";
import { isLowStock } from "./stock";
import { translator, type Locale } from "@/i18n";

/** `now`: something to act on today (dashboard "Act now"); otherwise a background reminder. */
export type Alert = { sev: string; text: string; href: string; now?: boolean };

/** Parts and purchasing items needing attention, filtered by what the user may act on. */
export async function purchasingAlerts(user: CurrentUser, locale: Locale): Promise<Alert[]> {
  const t = translator(locale), out: Alert[] = [];
  if (!can(user.role, "stock.manage")) return out;
  const d = today();
  const [reqs, parts, pos, diffs] = await Promise.all([
    requestsFor(undefined, true),
    listParts(),
    db.select({ id: schema.purchaseOrders.id, poNo: schema.purchaseOrders.poNo, status: schema.purchaseOrders.status, eta: schema.purchaseOrders.eta, supplier: schema.suppliers.name })
      .from(schema.purchaseOrders).innerJoin(schema.suppliers, eq(schema.purchaseOrders.supplierId, schema.suppliers.id))
      .where(inArray(schema.purchaseOrders.status, ["awaiting_approval", "ordered", "partially_received"])),
    can(user.role, "money.labourCost") ? db.select({ poId: schema.receipts.poId, poNo: schema.purchaseOrders.poNo, n: sql<number>`count(*)` })
      .from(schema.receiptLines).innerJoin(schema.receipts, eq(schema.receiptLines.receiptId, schema.receipts.id)).innerJoin(schema.purchaseOrders, eq(schema.receipts.poId, schema.purchaseOrders.id))
      .where(and(gte(schema.receipts.receivedAt, new Date(addDays(d, -14) + "T00:00:00+08:00")), sql`abs(${schema.receiptLines.invoicePrice} - ${schema.receiptLines.poPrice}) >= 0.005`))
      .groupBy(schema.receipts.poId, schema.purchaseOrders.poNo) : Promise.resolve([]),
  ]);
  for (const r of reqs) out.push({ sev: "var(--info)", text: t("att.partRequest", { no: r.jobNo, who: r.by ?? "—", qty: r.qty, uom: r.uom, part: r.description }), href: `/jobs/${r.jobId}`, now: true });
  if (can(user.role, "po.approve")) for (const p of pos.filter((x) => x.status === "awaiting_approval")) out.push({ sev: "var(--warn)", text: t("att.poApproval", { po: p.poNo, supplier: p.supplier }), href: `/purchasing/${p.id}`, now: true });
  for (const p of pos.filter((x) => x.status !== "awaiting_approval" && x.eta && x.eta < d)) out.push({ sev: "var(--crit)", text: t("att.poLate", { po: p.poNo, supplier: p.supplier }), href: `/purchasing/${p.id}`, now: true });
  const low = parts.filter(isLowStock);
  if (low.length && can(user.role, "po.create")) out.push({ sev: "var(--warn)", text: t("att.lowStock", { n: low.length }), href: "/purchasing/new?suggest=1" });
  if (can(user.role, "money.labourCost")) {
    for (const x of diffs) out.push({ sev: "var(--warn)", text: t("att.invoiceDiff", { po: x.poNo, n: Number(x.n) }), href: `/purchasing/${x.poId}` });
  }
  return out;
}
