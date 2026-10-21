import Link from "next/link";
import { notFound } from "next/navigation";
import { ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { today } from "@/lib/format";
import { listParts } from "@/lib/inventory";
import { activeSuppliers } from "@/lib/purchasing";
import { categoriesAndModels } from "@/lib/catalog";
import { getI18n } from "@/i18n/server";
import PurchasingTabs from "@/components/PurchasingTabs";
import RecordForm from "./RecordForm";

export async function generateMetadata() {
  return { title: (await getI18n()).t("rp2.title") };
}

/** Parts already bought: record them in one step (stock in, prices, optional use on a work order). */
export default async function RecordPurchasePage({ searchParams }: { searchParams: Promise<{ job?: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "po.create")) notFound();
  const { t } = await getI18n();
  const sp = await searchParams;
  const [parts, sups, { categories }, jobs] = await Promise.all([
    listParts(), activeSuppliers(), categoriesAndModels(),
    db.select({ id: schema.jobs.id, jobNo: schema.jobs.jobNo, complaint: schema.jobs.complaint }).from(schema.jobs).where(ne(schema.jobs.status, "closed")),
  ]);
  return (
    <div className="page" style={{ maxWidth: 1000 }}>
      <div className="crumbs"><Link href="/purchasing">{t("po.title")}</Link> / {t("rp2.title")}</div>
      <div className="view-head"><h2>{t("rp2.title")}</h2></div>
      <PurchasingTabs t={t} active="po" />
      <p className="muted" style={{ margin: 0 }}>{t("rp2.intro")}</p>
      <RecordForm today={today()} initialJobId={Number(sp.job) || undefined} categories={categories}
        suppliers={sups.map((s) => s.name)}
        jobs={jobs.map((j) => ({ id: j.id, label: `${j.jobNo} · ${j.complaint.slice(0, 50)}` }))}
        parts={parts.map((p) => ({ id: p.id, sku: p.sku, oem: p.oemPartNo, description: p.description, category: p.category, bin: p.bin, onHand: p.onHand, uom: p.uom, fits: false, models: p.models, bulk: p.bulk, lastCost: p.lastCost }))} />
    </div>
  );
}
