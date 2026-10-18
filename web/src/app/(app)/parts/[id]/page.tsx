import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { fmtDate, fmtDateTime, rm } from "@/lib/format";
import { activeSuppliers, categoriesAndModels } from "@/lib/catalog";
import { listParts, priceHistory, requestsFor } from "@/lib/inventory";
import { latestPrices, marginPct, priceChangePct } from "@/lib/stock";
import { getI18n } from "@/i18n/server";
import type { MessageKey } from "@/i18n";
import { Notice } from "@/components/ui";
import PartForm from "@/components/PartForm";
import SubmitButton from "@/components/SubmitButton";
import { addQuote, savePart, setPricing, stockTake } from "../actions";

export async function generateMetadata() {
  return { title: (await getI18n()).t("parts.title") };
}

const q2 = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));

export default async function PartPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const user = await requireUser();
  const { t, locale } = await getI18n();
  const id = Number((await params).id);
  const sp = await searchParams;
  const p = (await listParts()).find((x) => x.id === id);
  if (!p) notFound();
  const cost = can(user.role, "money.cost"), sell = can(user.role, "money.selling"), boss = false; // no selling price, so no margin
  const [hist, codes, moves, reqs, sups, cm] = await Promise.all([
    cost ? priceHistory([id]) : Promise.resolve([]),
    db.select().from(schema.supplierParts).where(eq(schema.supplierParts.partId, id)),
    db.select({ m: schema.stockMovements, by: schema.staff.name, jobNo: schema.jobs.jobNo, poNo: schema.purchaseOrders.poNo })
      .from(schema.stockMovements).leftJoin(schema.staff, eq(schema.stockMovements.staffId, schema.staff.id))
      .leftJoin(schema.jobs, eq(schema.stockMovements.jobId, schema.jobs.id)).leftJoin(schema.purchaseOrders, eq(schema.stockMovements.poId, schema.purchaseOrders.id))
      .where(eq(schema.stockMovements.partId, id)).orderBy(desc(schema.stockMovements.createdAt), desc(schema.stockMovements.id)).limit(50),
    requestsFor(undefined, true).then((r) => r.filter((x) => x.partId === id)),
    can(user.role, "po.create") ? activeSuppliers() : Promise.resolve([]),
    can(user.role, "stock.manage") ? categoriesAndModels() : Promise.resolve(null),
  ]);
  const latest = latestPrices(hist);
  const codeOf = (sid: number) => codes.find((c) => c.supplierId === sid)?.supplierPartNo;
  const prevOf = (row: (typeof hist)[number]) => hist.find((h) => h.supplierId === row.supplierId && (h.priceDate < row.priceDate || (h.priceDate === row.priceDate && h.id < row.id)));
  const m = marginPct(p.sellPrice, p.avgCost);
  const sourceKey = (s: string) => `src.${s}` as MessageKey;

  return (
    <div className="page">
      <div className="crumbs"><Link href="/parts">{t("parts.title")}</Link> / {p.sku}</div>
      <div className="view-head"><h2>{p.description} <span className="muted mono" style={{ fontSize: "1rem" }}>{p.sku}{p.oemPartNo && p.oemPartNo !== p.sku ? ` · ${p.oemPartNo}` : ""}</span></h2>
        {can(user.role, "po.create") && <Link className="btn primary" href={`/purchasing/new?part=${p.id}`}>{t("parts.order")}</Link>}</div>
      <Notice error={sp.error} ok={sp.ok} />
      <div className="panel"><div className="facts">
        <div><span className="label">{t("parts.onHand")}</span><b className={`hm ${p.onHand <= 0 && p.minLevel > 0 ? "stock-out" : p.onHand + p.onOrder < p.minLevel ? "stock-low" : ""}`}>{q2(p.onHand)} {p.uom}</b></div>
        <div><span className="label">{t("parts.onOrder")}</span><b>{q2(p.onOrder)} {p.uom}</b></div>
        <div><span className="label">{t("parts.min")} / {t("parts.reorderQty")}</span><b>{q2(p.minLevel)} / {q2(p.reorderQty)}</b></div>
        <div><span className="label">{t("parts.bin")}</span><b className="mono">{p.bin ?? "—"}</b></div>
        <div><span className="label">{t("parts.category")}</span><b>{p.category}</b></div>
        <div><span className="label">{t("parts.fits")}</span><b>{p.fitsAll ? t("parts.allModels") : p.models.join(", ") || "—"}</b></div>
        {cost && <div><span className="label">{t("parts.avgCost")}</span><b className="num">{rm(p.avgCost)}</b></div>}
        {cost && <div><span className="label">{t("parts.lastCost")}</span><b className="num">{p.lastCost === null ? "—" : rm(p.lastCost)}</b></div>}
        {sell && <div><span className="label">{t("parts.sell")}</span><b className="num">{rm(p.sellPrice)} <small className="muted">{p.pricingMode === "markup" ? t("parts.byMarkup", { pct: p.markupPct }) : t("parts.fixedPrice")}</small></b></div>}
        {boss && <div><span className="label">{t("parts.margin")}</span><b className={m !== null && m < p.targetMarginPct ? "stock-low" : ""}>{m === null ? "—" : `${m}%`} <small className="muted">{t("parts.target", { pct: p.targetMarginPct })}</small></b></div>}
      </div>{p.notes && <div style={{ padding: "0 14px 14px" }} className="muted">{p.notes}</div>}</div>

      {reqs.length > 0 && <div className="notice">{t("parts.waitingIssue", { n: reqs.length })} {reqs.map((r) => <Link key={r.id} href={`/jobs/${r.jobId}`} className="mono" style={{ marginLeft: 6 }}>{r.jobNo}</Link>)}</div>}

      {cost && (
        <div className="panel"><div className="panel-head"><h3>{t("parts.supplierPrices")}</h3><span className="muted" style={{ fontSize: ".8rem" }}>{t("parts.latestFirst")}</span></div>
          <div className="tbl-wrap" style={{ border: 0, borderRadius: 0 }}><table>
            <thead><tr><th>{t("sup.supplier")}</th><th>{t("sup.theirCode")}</th><th className="r">{t("parts.price")}</th><th>{t("parts.change")}</th><th>{t("col.date")}</th><th>{t("parts.source")}</th><th>{t("sup.leadTime")}</th><th></th></tr></thead>
            <tbody>
              {latest.map((r, i) => { const prev = prevOf(r); const ch = prev ? priceChangePct(prev.price, r.price) : null; return (
                <tr key={r.id}><td><Link href={`/purchasing/suppliers/${r.supplierId}`}><b>{r.supplierName}</b></Link></td><td className="mono">{codeOf(r.supplierId) ?? "—"}</td><td className="r num">{rm(r.price)}</td>
                  <td className={ch !== null && Math.abs(ch) > 10 ? "stock-low" : "muted"}>{ch === null ? "—" : `${ch > 0 ? "+" : ""}${ch}%`}</td>
                  <td className="num">{fmtDate(r.priceDate, true, locale)}</td><td>{t(sourceKey(r.source))}{r.ref ? <small className="muted"> · {r.ref}</small> : null}</td>
                  <td>{r.leadTimeDays ? t("sup.days", { n: r.leadTimeDays }) : "—"}</td><td>{i === 0 && latest.length > 1 && <span className="pill ok">{t("parts.lowest")}</span>}</td></tr>); })}
              {latest.length === 0 && <tr><td colSpan={8} className="muted">{t("parts.noPrices")}</td></tr>}
            </tbody></table></div>
          {hist.length > latest.length && (
            <details style={{ borderTop: "1px solid var(--line)" }}><summary style={{ padding: "8px 14px", cursor: "pointer" }} className="label">{t("parts.fullHistory", { n: hist.length })}</summary>
              <div className="tbl-wrap" style={{ border: 0, borderRadius: 0 }}><table><tbody>
                {hist.map((h) => <tr key={h.id}><td className="num">{fmtDate(h.priceDate, true, locale)}</td><td>{h.supplierName}</td><td className="r num">{rm(h.price)}</td><td>{t(sourceKey(h.source))}{h.ref ? ` · ${h.ref}` : ""}</td></tr>)}
              </tbody></table></div></details>
          )}
          {can(user.role, "po.create") && (
            <form action={addQuote} className="in form" style={{ padding: 14, borderTop: "1px solid var(--line)" }}>
              <input type="hidden" name="partId" value={p.id} />
              <span className="label full">{t("parts.addPrice")}</span>
              <label>{t("sup.supplier")}<select className="field" name="supplierId" defaultValue=""><option value="">{t("sup.newBelow")}</option>{sups.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
              <label>{t("sup.newName")}<input name="newSupplier" placeholder={t("sup.newNamePh")} /></label>
              <label>{t("sup.newPhone")}<input name="newPhone" type="tel" /></label>
              <label>{t("parts.price")} (RM)<input name="price" type="number" step="0.01" min="0.01" required /></label>
              <label>{t("sup.theirCode")}<input name="supplierPartNo" /></label>
              <label>{t("parts.ref")}<input name="ref" placeholder={t("parts.refPh")} /></label>
              <div className="full"><SubmitButton className="btn small primary">{t("parts.savePrice")}</SubmitButton></div>
            </form>
          )}
        </div>
      )}

      {can(user.role, "price.set") && (
        <form action={setPricing} className="panel"><div className="panel-head"><h3>{t("parts.sellingPrice")}</h3></div>
          <div className="form" style={{ padding: 14 }}>
            <input type="hidden" name="id" value={p.id} />
            <label>{t("parts.pricingMode")}<select className="field" name="pricingMode" defaultValue={p.pricingMode}><option value="markup">{t("parts.byMarkup", { pct: p.markupPct })}</option><option value="fixed">{t("parts.fixedPrice")}</option></select></label>
            <label>{t("parts.fixedSell")}<input name="sellPrice" type="number" step="0.01" min="0" defaultValue={p.sellPrice} /></label>
            <div className="full"><SubmitButton className="btn small primary">{t("common.save")}</SubmitButton> <small className="muted">{t("parts.pricingHelp")}</small></div>
          </div>
        </form>
      )}

      <div className="two">
        <div className="panel"><div className="panel-head"><h3>{t("parts.movements")}</h3></div>
          <div className="tbl-wrap" style={{ border: 0, borderRadius: 0 }}><table><tbody>
            {moves.map(({ m: mv, by, jobNo, poNo }) => { const q = Number(mv.qty); return (
              <tr key={mv.id}><td className="num" style={{ whiteSpace: "nowrap" }}>{fmtDateTime(mv.createdAt, locale)}</td>
                <td className="r num" style={{ color: q > 0 ? "var(--ok)" : "var(--ink)", fontWeight: 600 }}>{q > 0 ? "+" : "−"}{q2(Math.abs(q))}</td>
                <td>{t(`mv.${mv.type}` as MessageKey)}{jobNo && <> · <Link href={`/jobs/${mv.jobId}`} className="mono">{jobNo}</Link></>}{poNo && <> · <Link href={`/purchasing/${mv.poId}`} className="mono">{poNo}</Link></>}{mv.note && <><br /><small className="muted">{mv.note}</small></>}</td>
                <td className="r num muted">{q2(Number(mv.balanceAfter))}</td><td className="muted">{by}</td></tr>); })}
            {moves.length === 0 && <tr><td className="muted">{t("parts.noMovements")}</td></tr>}
          </tbody></table></div></div>
        {can(user.role, "stock.manage") && (
          <form action={stockTake} className="panel"><div className="panel-head"><h3>{t("parts.stockTake")}</h3></div>
            <div className="form" style={{ padding: 14, gridTemplateColumns: "1fr" }}>
              <input type="hidden" name="partId" value={p.id} />
              <label>{t("parts.counted", { uom: p.uom })}<input name="counted" type="number" step="any" min="0" defaultValue={p.onHand} required /></label>
              <label>{t("parts.reason")}<input name="note" required placeholder={t("parts.reasonPh")} /></label>
              <div><SubmitButton className="btn small primary">{t("parts.saveCount")}</SubmitButton></div>
            </div></form>
        )}
      </div>

      {cm && (
        <details className="panel"><summary className="panel-head" style={{ cursor: "pointer" }}><h3>{t("parts.edit")}</h3></summary>
          <PartForm action={savePart} t={t} part={p} categories={cm.categories} models={cm.models} submit={t("common.save")} />
        </details>
      )}
    </div>
  );
}
