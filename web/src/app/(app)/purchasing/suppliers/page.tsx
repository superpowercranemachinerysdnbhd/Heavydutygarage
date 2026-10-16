import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { activeSuppliers } from "@/lib/catalog";
import { db, schema } from "@/db";
import { latestPrices } from "@/lib/stock";
import { priceHistory } from "@/lib/inventory";
import { getI18n } from "@/i18n/server";
import { Notice } from "@/components/ui";
import PurchasingTabs from "@/components/PurchasingTabs";
import SupplierFields from "@/components/SupplierFields";
import SubmitButton from "@/components/SubmitButton";
import { saveSupplier } from "../supplier-actions";

export async function generateMetadata() {
  return { title: (await getI18n()).t("sup.title") };
}

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "po.create")) notFound();
  const { t } = await getI18n();
  const sp = await searchParams;
  const [sups, partIds, pos] = await Promise.all([
    activeSuppliers(),
    db.select({ id: schema.parts.id }).from(schema.parts),
    db.select({ supplierId: schema.purchaseOrders.supplierId, status: schema.purchaseOrders.status }).from(schema.purchaseOrders),
  ]);
  const hist = await priceHistory(partIds.map((p) => p.id));
  const byPart = new Map<number, ReturnType<typeof latestPrices<(typeof hist)[number]>>>();
  for (const p of partIds) byPart.set(p.id, latestPrices(hist.filter((h) => h.partId === p.id)));
  const quoted = (sid: number) => [...byPart.values()].filter((l) => l.some((x) => x.supplierId === sid)).length;
  const cheapest = (sid: number) => [...byPart.values()].filter((l) => l.length > 1 && l[0].supplierId === sid).length;
  const openPo = (sid: number) => pos.filter((p) => p.supplierId === sid && ["ordered", "partially_received", "awaiting_approval"].includes(p.status)).length;
  return (
    <div className="page">
      <div className="view-head"><h2>{t("sup.title")}</h2></div>
      <PurchasingTabs t={t} active="suppliers" />
      <Notice error={sp.error} />
      <div className="tbl-wrap"><table>
        <thead><tr><th>{t("sup.supplier")}</th><th>{t("col.contact")}</th><th>{t("sup.terms")}</th><th>{t("sup.leadTime")}</th><th className="r">{t("sup.partsQuoted")}</th><th className="r">{t("sup.cheapestOn")}</th><th className="r">{t("sup.openPos")}</th></tr></thead>
        <tbody>{sups.map((s) => (
          <tr key={s.id}><td><Link href={`/purchasing/suppliers/${s.id}`}><b>{s.name}</b></Link>{!s.active && <> <span className="pill mute">{t("team.inactive")}</span></>}</td>
            <td>{s.contactName ?? "—"}<br /><small className="mono muted">{s.phone ?? ""}</small></td><td>{s.paymentTerms ?? "—"}</td>
            <td>{s.leadTimeDays ? t("sup.days", { n: s.leadTimeDays }) : "—"}</td><td className="r num">{quoted(s.id)}</td><td className="r num">{cheapest(s.id)}</td><td className="r num">{openPo(s.id)}</td></tr>))}
          {sups.length === 0 && <tr><td colSpan={7} className="muted">{t("sup.none")}</td></tr>}</tbody>
      </table></div>
      <form action={saveSupplier} className="panel"><div className="panel-head"><h3>{t("sup.add")}</h3></div>
        <div className="form" style={{ padding: 14 }}><SupplierFields t={t} /><div className="full"><SubmitButton className="btn primary">{t("sup.add")}</SubmitButton></div></div></form>
    </div>
  );
}
