"use client";
import { useRef, useState } from "react";
import { useT } from "@/i18n/client";
import SubmitButton from "./SubmitButton";

type Row = { key: number; qty: string; cost: string };
const rm = (n: number) => "RM " + n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Parts bought for a work order on one supplier invoice: supplier, invoice no. and date once, then one line per item
 *  (part no., description, qty, unit, unit price; the line total and invoice total are worked out). */
export default function BoughtLines({ action, jobId, suppliers, today }: { action: (f: FormData) => Promise<void>; jobId: number; suppliers: string[]; today: string }) {
  const t = useT();
  const seq = useRef(1);
  const blank = (): Row => ({ key: seq.current++, qty: "1", cost: "" });
  const [rows, setRows] = useState<Row[]>(() => [blank()]);
  const set = (key: number, v: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...v } : r)));
  const line = (r: Row) => (Number(r.qty) || 0) * (Number(r.cost) || 0);
  const total = rows.reduce((a, r) => a + line(r), 0);
  return (
    <form action={action} className="stack bought-form" style={{ gap: 10, marginTop: 10 }}>
      <input type="hidden" name="jobId" value={jobId} />
      <div className="form" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))" }}>
        <label>{t("jp.supplier")}<input name="supplierName" list="sups-job" placeholder={t("jp.supplierPh")} autoComplete="off" /></label>
        <datalist id="sups-job">{suppliers.map((s) => <option key={s} value={s} />)}</datalist>
        <label>{t("jp.ref")}<input name="ref" maxLength={60} /></label>
        <label>{t("jp.date")}<input type="date" name="purchasedAt" defaultValue={today} max={today} /></label>
      </div>
      <div className="tbl-wrap"><table className="bl">
        <thead><tr><th>{t("jp.partNo")}</th><th>{t("bl.desc")}</th><th className="r">{t("po.qty")}</th><th>{t("parts.uom")}</th><th className="r">{t("bl.unitPrice")}</th><th className="r">{t("bl.total")}</th><th /></tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={r.key}>
            <td><input name="partNo" aria-label={`${t("jp.partNo")} ${i + 1}`} maxLength={60} /></td>
            <td><input name="description" aria-label={`${t("bl.desc")} ${i + 1}`} maxLength={200} /></td>
            <td className="r"><input name="qty" type="number" min="0.01" step="any" value={r.qty} onChange={(e) => set(r.key, { qty: e.target.value })} aria-label={`${t("po.qty")} ${i + 1}`} /></td>
            <td><input name="uom" defaultValue="pc" list="uoms-job" aria-label={`${t("parts.uom")} ${i + 1}`} /></td>
            <td className="r"><input name="unitCost" type="number" min="0" step="0.01" value={r.cost} onChange={(e) => set(r.key, { cost: e.target.value })} aria-label={`${t("bl.unitPrice")} ${i + 1}`} /></td>
            <td className="r num">{line(r) ? rm(line(r)) : "—"}</td>
            <td>{rows.length > 1 && <button type="button" className="linkbtn muted" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label={t("common.remove")}>✕</button>}</td>
          </tr>
        ))}</tbody>
        <tfoot><tr><td colSpan={5} className="r"><b>{t("bl.invoiceTotal")}</b></td><td className="r num"><b>{rm(total)}</b></td><td /></tr></tfoot>
      </table></div>
      <datalist id="uoms-job"><option>pc</option><option>set</option><option>m</option><option>L</option><option>kg</option><option>pail</option></datalist>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn small" onClick={() => setRows((rs) => [...rs, blank()])}>{t("bl.addLine")}</button>
        <SubmitButton className="btn small primary">{t("bl.save")}</SubmitButton>
      </div>
      <small className="muted">{t("bl.help")}</small>
    </form>
  );
}
