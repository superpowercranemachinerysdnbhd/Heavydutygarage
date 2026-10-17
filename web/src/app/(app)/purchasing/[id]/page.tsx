import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { fmtDate, fmtDateTime, rm, today } from "@/lib/format";
import { getPo } from "@/lib/purchasing";
import { poApprovalLimit } from "@/lib/stock";
import { getI18n } from "@/i18n/server";
import { Notice } from "@/components/ui";
import PoStatus from "@/components/PoStatus";
import PrintButton from "@/components/PrintButton";
import SubmitButton from "@/components/SubmitButton";
import { approvePo, cancelPo, receivePo } from "../actions";
import DocBrand from "@/components/DocBrand";

export async function generateMetadata() {
  return { title: (await getI18n()).t("po.title") };
}

const q2 = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));

export default async function PoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "po.create")) notFound();
  const { t, locale } = await getI18n();
  const sp = await searchParams;
  const d = await getPo(Number((await params).id));
  if (!d) notFound();
  const { po, supplier, lines, receipts } = d;
  const total = lines.reduce((a, l) => a + l.qty * l.unitPrice, 0);
  const receivable = ["ordered", "partially_received"].includes(po.status);
  const late = receivable && po.eta && po.eta < today();
  const hidden = <input type="hidden" name="poId" value={po.id} />;

  return (
    <div className="page" style={{ maxWidth: 960 }}>
      <div className="no-print stack">
        <div className="crumbs"><Link href="/purchasing">{t("po.title")}</Link> / {po.poNo}</div>
        <div className="view-head"><h2>{po.poNo} <span className="muted" style={{ fontSize: "1rem" }}>{supplier.name}</span></h2><PoStatus status={po.status} t={t} />{late && <span className="due over">{t("po.late")}</span>}<PrintButton /></div>
        <Notice error={sp.error} ok={sp.ok} />
        {po.status === "awaiting_approval" && (
          <div className="notice">{t("po.waitingBoss", { limit: rm(poApprovalLimit()) })}
            {can(user.role, "po.approve") && <div className="btnrow" style={{ marginTop: 8 }}>
              <form action={approvePo}>{hidden}<SubmitButton className="btn small primary">{t("po.approve")}</SubmitButton></form>
              <form action={cancelPo}>{hidden}<SubmitButton>{t("po.decline")}</SubmitButton></form></div>}
          </div>
        )}

        {receivable && (
          <form action={receivePo} className="panel">{hidden}
            <div className="panel-head"><h3>{t("po.receive")}</h3><span className="muted" style={{ fontSize: ".8rem" }}>{t("po.receiveHelp")}</span></div>
            <div className="filters" style={{ padding: "10px 14px" }}><label className="label" htmlFor="invoiceNo">{t("po.invoiceNo")}</label><input id="invoiceNo" name="invoiceNo" style={{ flex: "0 1 220px" }} /></div>
            <div className="tbl-wrap" style={{ border: 0, borderRadius: 0 }}><table>
              <thead><tr><th>{t("parts.partNo")}</th><th>{t("parts.description")}</th><th className="r">{t("po.ordered")}</th><th className="r">{t("po.receivedCol")}</th><th className="r">{t("po.receiveNow")}</th><th className="r">{t("po.invoicePrice")}</th></tr></thead>
              <tbody>{lines.map((l) => { const left = l.qty - l.receivedQty; return (
                <tr key={l.id}><td className="mono">{l.sku}</td><td>{l.description}</td><td className="r num">{q2(l.qty)} {l.uom}</td><td className="r num">{q2(l.receivedQty)}</td>
                  <td className="r">{left > 0 ? <input type="number" name={`qty-${l.id}`} min="0" max={left} step="any" defaultValue={left} style={{ width: 90 }} aria-label={`${t("po.receiveNow")} ${l.sku}`} /> : "✓"}</td>
                  <td className="r">{left > 0 ? <input type="number" name={`price-${l.id}`} min="0.01" step="0.01" defaultValue={l.unitPrice.toFixed(2)} style={{ width: 110 }} aria-label={`${t("po.invoicePrice")} ${l.sku}`} /> : ""}</td></tr>); })}</tbody>
            </table></div>
            <div style={{ padding: "10px 14px" }}><SubmitButton className="btn primary">{t("po.receiveBtn")}</SubmitButton></div>
          </form>
        )}
      </div>

      <article className="doc" aria-label={t("po.document")}>
        <div className="doc-head">
          <DocBrand t={t} />
          <div className="doc-meta"><b>{t("po.document")}</b><span>{po.poNo}</span><span>{fmtDate(po.orderDate, true, locale)}</span></div>
        </div>
        <div className="doc-grid">
          <div><h4>{t("sup.supplier")}</h4><dl><dt>{t("rep.company")}</dt><dd>{supplier.name}</dd><dt>{t("rep.contact")}</dt><dd>{supplier.contactName ?? "—"}</dd><dt>{t("rep.phone")}</dt><dd>{supplier.phone ?? "—"}</dd>{supplier.address && <><dt>{t("c.address")}</dt><dd>{supplier.address}</dd></>}</dl></div>
          <div><h4>{t("po.details")}</h4><dl><dt>{t("po.no")}</dt><dd>{po.poNo}</dd><dt>{t("po.eta")}</dt><dd>{po.eta ? fmtDate(po.eta, true, locale) : "—"}</dd><dt>{t("sup.terms")}</dt><dd>{supplier.paymentTerms ?? "—"}</dd>
            {d.jobNo && <><dt>{t("col.job")}</dt><dd>{d.jobNo}</dd></>}<dt>{t("po.raisedBy")}</dt><dd>{d.createdByName ?? "—"}</dd>{d.approvedByName && po.status !== "awaiting_approval" && <><dt>{t("po.approvedBy")}</dt><dd>{d.approvedByName}</dd></>}</dl></div>
        </div>
        <div className="dt"><table>
          <thead><tr><th>#</th><th>{t("sup.theirCode")}</th><th>{t("parts.partNo")}</th><th>{t("parts.description")}</th><th className="r">{t("po.qty")}</th><th className="r">{t("po.unitPrice")}</th><th className="r">{t("col.amount")}</th></tr></thead>
          <tbody>{lines.map((l, i) => <tr key={l.id}><td>{i + 1}</td><td>{l.supplierPartNo ?? "—"}</td><td>{l.oem ?? l.sku}</td><td>{l.description}</td><td className="r">{q2(l.qty)} {l.uom}</td><td className="r">{rm(l.unitPrice)}</td><td className="r">{rm(l.qty * l.unitPrice)}</td></tr>)}</tbody>
        </table></div>
        <div className="tot"><span><b>{t("po.total")}</b></span><b>{rm(total)}</b></div>
        {po.notes && <div><h4>{t("u.notes")}</h4><p>{po.notes}</p></div>}
        <div className="sign"><div><div className="sline" /><small>{t("po.authorised")}</small></div><div><div className="sline" /><small>{t("po.supplierAck")}</small></div></div>
      </article>

      {receipts.length > 0 && (
        <div className="panel no-print"><div className="panel-head"><h3>{t("po.receipts")}</h3></div>
          <div className="tbl-wrap" style={{ border: 0, borderRadius: 0 }}><table>
            <thead><tr><th>{t("col.date")}</th><th>{t("po.invoiceNo")}</th><th>{t("parts.partNo")}</th><th className="r">{t("po.qty")}</th><th className="r">{t("po.poPrice")}</th><th className="r">{t("po.invoicePrice")}</th><th>{t("col.person")}</th></tr></thead>
            <tbody>{receipts.flatMap((r) => r.lines.map((x) => { const l = lines.find((y) => y.id === x.poLineId); const diff = Math.abs(x.invoicePrice - x.poPrice) >= 0.005; return (
              <tr key={x.id}><td className="num">{fmtDateTime(r.receivedAt, locale)}</td><td className="mono">{r.invoiceNo ?? "—"}</td><td className="mono">{l?.sku}</td><td className="r num">{q2(x.qty)}</td>
                <td className="r num">{rm(x.poPrice)}</td><td className={`r num ${diff ? "stock-low" : ""}`}>{rm(x.invoicePrice)}{diff && <><br /><small>{t("po.differs")}</small></>}</td><td>{r.by}</td></tr>); }))}</tbody>
          </table></div></div>
      )}

      {can(user.role, "po.create") && ["awaiting_approval", "ordered"].includes(po.status) && !lines.some((l) => l.receivedQty > 0) && po.status !== "awaiting_approval" && (
        <form action={cancelPo} className="no-print">{hidden}<SubmitButton>{t("po.cancel")}</SubmitButton></form>
      )}
    </div>
  );
}
