import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { fmtDate, rm } from "@/lib/format";
import { priceHistory } from "@/lib/inventory";
import { latestPrices } from "@/lib/stock";
import { getI18n } from "@/i18n/server";
import type { MessageKey } from "@/i18n";
import { Notice } from "@/components/ui";
import SupplierFields from "@/components/SupplierFields";
import SubmitButton from "@/components/SubmitButton";
import { saveSupplier } from "../../supplier-actions";

export async function generateMetadata() {
  return { title: (await getI18n()).t("sup.title") };
}

export default async function SupplierPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "po.create")) notFound();
  const { t, locale } = await getI18n();
  const id = Number((await params).id);
  const sp = await searchParams;
  const [s] = Number.isInteger(id) ? await db.select().from(schema.suppliers).where(eq(schema.suppliers.id, id)) : [];
  if (!s) notFound();
  const [priced, codes, pos] = await Promise.all([
    db.selectDistinct({ partId: schema.supplierPrices.partId }).from(schema.supplierPrices).where(eq(schema.supplierPrices.supplierId, id)),
    db.select().from(schema.supplierParts).where(eq(schema.supplierParts.supplierId, id)),
    db.select({ po: schema.purchaseOrders, total: schema.purchaseOrders.id }).from(schema.purchaseOrders).where(eq(schema.purchaseOrders.supplierId, id)).orderBy(desc(schema.purchaseOrders.orderDate)),
  ]);
  const ids = priced.map((p) => p.partId);
  const [hist, partRows] = await Promise.all([priceHistory(ids), ids.length ? db.select().from(schema.parts) : Promise.resolve([])]);
  const rows = ids.map((pid) => {
    const all = latestPrices(hist.filter((h) => h.partId === pid));
    const mine = all.find((x) => x.supplierId === id)!;
    return { part: partRows.find((p) => p.id === pid)!, mine, cheapest: all[0], n: all.length };
  }).filter((r) => r.part).sort((a, b) => a.part.description.localeCompare(b.part.description));
  const received = pos.filter((p) => p.po.status === "received");
  return (
    <div className="page">
      <div className="crumbs"><Link href="/purchasing/suppliers">{t("sup.title")}</Link> / {s.name}</div>
      <div className="view-head"><h2>{s.name}</h2><Link className="btn primary" href={`/purchasing/new?supplier=${s.id}`}>{t("po.new")}</Link></div>
      <Notice error={sp.error} ok={sp.ok} />
      <div className="panel"><div className="panel-head"><h3>{t("sup.prices")}</h3><span className="muted" style={{ fontSize: ".8rem" }}>{rows.length}</span></div>
        <div className="tbl-wrap" style={{ border: 0, borderRadius: 0 }}><table>
          <thead><tr><th>{t("parts.partNo")}</th><th>{t("sup.theirCode")}</th><th>{t("parts.description")}</th><th className="r">{t("parts.price")}</th><th>{t("col.date")}</th><th></th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.part.id}><td className="mono"><Link href={`/parts/${r.part.id}`}>{r.part.sku}</Link></td><td className="mono">{codes.find((c) => c.partId === r.part.id)?.supplierPartNo ?? "—"}</td>
              <td>{r.part.description}</td><td className="r num">{rm(r.mine.price)}</td><td className="num">{fmtDate(r.mine.priceDate, true, locale)}</td>
              <td>{r.n > 1 && (r.cheapest.supplierId === id ? <span className="pill ok">{t("parts.lowest")}</span> : <small className="muted">{t("sup.cheaperAt", { name: r.cheapest.supplierName, price: rm(r.cheapest.price) })}</small>)}</td></tr>))}
            {rows.length === 0 && <tr><td colSpan={6} className="muted">{t("parts.noPrices")}</td></tr>}</tbody>
        </table></div></div>
      <div className="panel"><div className="panel-head"><h3>{t("po.title")}</h3><span className="muted" style={{ fontSize: ".8rem" }}>{t("sup.receivedN", { n: received.length })}</span></div>
        <div className="tbl-wrap" style={{ border: 0, borderRadius: 0 }}><table><tbody>
          {pos.map(({ po }) => <tr key={po.id}><td className="mono"><Link href={`/purchasing/${po.id}`}>{po.poNo}</Link></td><td className="num">{fmtDate(po.orderDate, true, locale)}</td><td>{t(`postatus.${po.status}` as MessageKey)}</td></tr>)}
          {pos.length === 0 && <tr><td className="muted">{t("po.none")}</td></tr>}
        </tbody></table></div></div>
      <details className="panel"><summary className="panel-head" style={{ cursor: "pointer" }}><h3>{t("sup.edit")}</h3></summary>
        <form action={saveSupplier} className="form" style={{ padding: 14 }}><input type="hidden" name="id" value={s.id} />
          <SupplierFields s={s} t={t} />
          <label>{t("sup.status")}<select className="field" name="active" defaultValue={s.active ? "1" : "0"}><option value="1">{t("sup.active")}</option><option value="0">{t("team.inactive")}</option></select></label>
          <div className="full"><SubmitButton className="btn primary">{t("common.save")}</SubmitButton></div></form>
      </details>
    </div>
  );
}
