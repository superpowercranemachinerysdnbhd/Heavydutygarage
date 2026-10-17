import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { activeSuppliers } from "@/lib/catalog";
import { latestPricesByPart, listParts } from "@/lib/inventory";
import { isLowStock, poApprovalLimit, PRICE_WARN_PCT, suggestOrderQty } from "@/lib/stock";
import { getI18n } from "@/i18n/server";
import PurchasingTabs from "@/components/PurchasingTabs";
import PoBuilder from "./PoBuilder";

export async function generateMetadata() {
  return { title: (await getI18n()).t("po.new") };
}

export default async function NewPoPage({ searchParams }: { searchParams: Promise<{ suggest?: string; part?: string; request?: string; supplier?: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "po.create")) notFound();
  const { t } = await getI18n();
  const sp = await searchParams;
  const [parts, sups, jobs] = await Promise.all([
    listParts(), activeSuppliers(),
    db.select({ id: schema.jobs.id, jobNo: schema.jobs.jobNo, complaint: schema.jobs.complaint }).from(schema.jobs).where(ne(schema.jobs.status, "closed")),
  ]);
  const prices = await latestPricesByPart(parts.map((p) => p.id));
  const supplierId = Number(sp.supplier) || undefined;
  let initial: { partId: number; supplierId?: number; qty: number }[] = [];
  let initialJobId: number | undefined;
  if (sp.suggest === "1") initial = parts.filter(isLowStock).map((p) => ({ partId: p.id, qty: suggestOrderQty(p) }));
  if (sp.part) { const p = parts.find((x) => x.id === Number(sp.part)); if (p) initial = [{ partId: p.id, supplierId, qty: isLowStock(p) ? suggestOrderQty(p) : Math.max(p.reorderQty, 1) }]; }
  if (sp.request) {
    const [r] = await db.select().from(schema.partRequests).where(eq(schema.partRequests.id, Number(sp.request)));
    if (r) { initial = [{ partId: r.partId, qty: Number(r.qty) }]; initialJobId = r.jobId; }
  }
  if (supplierId && !sp.part) initial = initial.map((i) => ({ ...i, supplierId }));
  return (
    <div className="page">
      <div className="crumbs"><Link href="/purchasing">{t("po.title")}</Link> / {t("po.new")}</div>
      <div className="view-head"><h2>{t("po.new")}</h2></div>
      <PurchasingTabs t={t} active="po" />
      {!sups.length && <div className="notice">{t("po.noSuppliers")}</div>}
      <PoBuilder
        parts={parts.map((p) => ({ id: p.id, sku: p.sku, description: p.description, uom: p.uom, onHand: p.onHand, onOrder: p.onOrder, minLevel: p.minLevel,
          prices: (prices.get(p.id) ?? []).map((x) => ({ supplierId: x.supplierId, supplierName: x.supplierName, price: x.price, priceDate: x.priceDate })) }))}
        suppliers={sups.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name }))}
        initial={initial} initialJobId={initialJobId}
        jobs={jobs.map((j) => ({ id: j.id, label: `${j.jobNo} · ${j.complaint.slice(0, 50)}` }))}
        approvalLimit={poApprovalLimit()} canApprove={can(user.role, "po.approve")} warnPct={PRICE_WARN_PCT} />
    </div>
  );
}
