"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import PartPicker, { type PickPart } from "@/components/PartPicker";
import { recordPurchase } from "../actions";

type Part = PickPart & { lastCost: number | null };
type NewPart = { sku: string; description: string; uom: string; categoryId: string; bulk: boolean };
type Line = { key: number; part?: Part; np?: NewPart; qty: string; price: string };
const rm = (n: number) => "RM " + n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Parts already bought: supplier + invoice once, then the items (from the parts list or new), qty and unit price. */
export default function RecordForm({ parts, suppliers, categories, jobs, today, initialJobId }: {
  parts: Part[]; suppliers: string[]; categories: { id: number; name: string }[]; jobs: { id: number; label: string }[]; today: string; initialJobId?: number;
}) {
  const t = useT(), router = useRouter();
  const seq = useRef(1);
  const [lines, setLines] = useState<Line[]>([]);
  const [head, setHead] = useState({ supplier: "", invoice: "", date: today, jobId: initialJobId ? String(initialJobId) : "", useOnJob: !!initialJobId });
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const set = (key: number, v: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...v } : l)));
  const setNp = (l: Line, v: Partial<NewPart>) => set(l.key, { np: { ...l.np!, ...v } });
  const total = lines.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.price) || 0), 0);
  const addPart = (p: PickPart) => { const part = parts.find((x) => x.id === p.id)!; setLines((ls) => [...ls, { key: seq.current++, part, qty: "1", price: part.lastCost ? String(part.lastCost) : "" }]); };
  const addNew = (text: string) => {
    const isNo = /^[A-Z0-9][A-Z0-9\-/.]{2,}$/i.test(text) && /\d/.test(text) && !/\s/.test(text);
    setLines((ls) => [...ls, { key: seq.current++, np: { sku: isNo ? text : "", description: isNo ? "" : text, uom: "pc", categoryId: "", bulk: false }, qty: "1", price: "" }]);
  };
  const used = new Set(lines.map((l) => l.part?.id).filter(Boolean));
  const save = () => start(async () => {
    setError("");
    const r = await recordPurchase({
      supplierName: head.supplier, invoiceNo: head.invoice, date: head.date, jobId: Number(head.jobId) || null, useOnJob: head.useOnJob,
      lines: lines.map((l) => ({ partId: l.part?.id, newPart: l.np ? { ...l.np, categoryId: Number(l.np.categoryId) } : undefined, qty: Number(l.qty), price: Number(l.price) })),
    });
    if ("error" in r) { setError(r.error); return; }
    router.push(`/purchasing/${r.id}?ok=${encodeURIComponent(t("rp2.saved", { no: r.no }))}`);
    router.refresh();
  });
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="panel"><div className="form" style={{ padding: 14, gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
        <label>{t("jp.supplier")}<input value={head.supplier} onChange={(e) => setHead({ ...head, supplier: e.target.value })} list="rp2-sups" placeholder={t("jp.supplierPh")} autoComplete="off" required /></label>
        <datalist id="rp2-sups">{suppliers.map((s) => <option key={s} value={s} />)}</datalist>
        <label>{t("jp.ref")}<input value={head.invoice} onChange={(e) => setHead({ ...head, invoice: e.target.value })} maxLength={60} /></label>
        <label>{t("jp.date")}<input type="date" value={head.date} max={today} onChange={(e) => setHead({ ...head, date: e.target.value })} /></label>
        <label>{t("po.forJob")}<select className="field" value={head.jobId} onChange={(e) => setHead({ ...head, jobId: e.target.value, useOnJob: !!e.target.value && head.useOnJob })}>
          <option value="">{t("po.stockOnly")}</option>{jobs.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}</select></label>
        {head.jobId && <label className="full set-check"><input type="checkbox" checked={head.useOnJob} onChange={(e) => setHead({ ...head, useOnJob: e.target.checked })} /> {t("rp2.useOnJob")}</label>}
      </div></div>

      <div className="panel">
        <div className="panel-head"><h3>{t("rp2.items")}</h3><span className="count">{lines.length}</span></div>
        {lines.length > 0 && <div className="tbl-wrap" style={{ border: 0, borderRadius: 0 }}><table className="bl rp2tbl">
          <thead><tr><th>{t("rp2.item")}</th><th className="r">{t("po.qty")}</th><th className="r">{t("bl.unitPrice")}</th><th className="r">{t("bl.total")}</th><th /></tr></thead>
          <tbody>{lines.map((l) => (
            <tr key={l.key}>
              <td>{l.part ? <><b className="mono">{l.part.sku}</b> {l.part.description} <small className="muted">({l.part.uom})</small></> : (
                <div className="rp2-new">
                  <span className="pill info">{t("rp2.newItem")}</span>
                  <input value={l.np!.sku} onChange={(e) => setNp(l, { sku: e.target.value })} placeholder={t("rp2.skuPh")} aria-label={t("jp.partNo")} maxLength={60} />
                  <input value={l.np!.description} onChange={(e) => setNp(l, { description: e.target.value })} placeholder={t("bl.desc")} aria-label={t("bl.desc")} maxLength={200} required />
                  <input value={l.np!.uom} onChange={(e) => setNp(l, { uom: e.target.value })} list="rp2-uoms" aria-label={t("parts.uom")} style={{ maxWidth: 80 }} />
                  <select className="field" value={l.np!.categoryId} onChange={(e) => setNp(l, { categoryId: e.target.value })} aria-label={t("parts.category")}><option value="">{t("parts.category")}…</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                  <label className="set-check"><input type="checkbox" checked={l.np!.bulk} onChange={(e) => setNp(l, { bulk: e.target.checked })} /> {t("bulk.badge")}</label>
                </div>)}</td>
              <td className="r"><input type="number" min="0.01" step="any" value={l.qty} onChange={(e) => set(l.key, { qty: e.target.value })} aria-label={t("po.qty")} /></td>
              <td className="r"><input type="number" min="0" step="0.01" value={l.price} onChange={(e) => set(l.key, { price: e.target.value })} aria-label={t("bl.unitPrice")} /></td>
              <td className="r num">{rm((Number(l.qty) || 0) * (Number(l.price) || 0))}</td>
              <td><button type="button" className="linkbtn muted" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label={t("common.remove")}>✕</button></td>
            </tr>
          ))}</tbody>
          <tfoot><tr><td colSpan={3} className="r"><b>{t("bl.invoiceTotal")}</b></td><td className="r num"><b>{rm(total)}</b></td><td /></tr></tfoot>
        </table></div>}
        <datalist id="rp2-uoms"><option>pc</option><option>set</option><option>kit</option><option>m</option><option>L</option><option>pail</option><option>drum</option><option>kg</option><option>box</option><option>roll</option></datalist>
        <div style={{ padding: "10px 14px" }}>
          <PartPicker placeholder={t("rp2.addPh")} onPick={addPart} onCreate={addNew} parts={parts.filter((p) => !used.has(p.id))} />
        </div>
      </div>

      {error && <div className="notice err" role="alert">{error}</div>}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="btn primary" disabled={pending || !lines.length || !head.supplier.trim()} onClick={save}>{pending ? t("common.saving") : t("rp2.save", { total: rm(total) })}</button>
        <small className="muted">{t("rp2.help")}</small>
      </div>
    </div>
  );
}
