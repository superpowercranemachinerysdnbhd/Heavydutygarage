"use client";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useT } from "@/i18n/client";
import { INTL_LOCALE } from "@/i18n";
import { createPurchaseOrders } from "../actions";
import { quickPart, quickSupplier } from "../supplier-actions";
import PartPicker from "@/components/PartPicker";

export type BuilderPart = {
  id: number; sku: string; description: string; uom: string; onHand: number; onOrder: number; minLevel: number;
  oem: string | null; category: string; bin: string | null; bulk: boolean; models: string[];
  prices: { supplierId: number; supplierName: string; price: number; priceDate: string }[];
};
type Supplier = { id: number; name: string };
type Line = { key: number; partId: number; supplierId: number; qty: number; price: number };

const NEW = -1;
const rm = (n: number) => "RM " + n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PoBuilder({ parts: initialParts, suppliers: initialSuppliers, initial, jobs, approvalLimit, canApprove, warnPct, initialJobId, categories }: {
  parts: BuilderPart[]; suppliers: Supplier[]; categories: { id: number; name: string }[]; initial: { partId: number; supplierId?: number; qty: number }[];
  jobs: { id: number; label: string }[]; approvalLimit: number; canApprove: boolean; warnPct: number; initialJobId?: number;
}) {
  const t = useT(), locale = useLocale(), router = useRouter();
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [parts, setParts] = useState(initialParts);
  // "+ Add new item": a part that is not in the list yet, created without leaving the order.
  const [np, setNp] = useState<{ sku: string; description: string; uom: string; categoryId: string; bulk: boolean } | null>(null);
  const partById = useMemo(() => new Map(parts.map((p) => [p.id, p])), [parts]);
  const latestFrom = (partId: number, supplierId: number) => partById.get(partId)?.prices.find((x) => x.supplierId === supplierId);
  const defaultSupplier = (partId: number) => partById.get(partId)?.prices[0]?.supplierId ?? suppliers[0]?.id ?? 0;
  const seq = useRef(1);
  const mk = (partId: number, supplierId?: number, qty = 1): Line => {
    const sid = supplierId ?? defaultSupplier(partId);
    return { key: seq.current++, partId, supplierId: sid, qty, price: latestFrom(partId, sid)?.price ?? 0 };
  };
  const [lines, setLines] = useState<Line[]>(() => initial.filter((i) => partById.has(i.partId)).map((i) => mk(i.partId, i.supplierId, i.qty)));
  const [adding, setAdding] = useState<number | null>(null); // line key choosing a new supplier
  const [ns, setNs] = useState({ name: "", phone: "", paymentTerms: "", leadTimeDays: "" });
  const [jobId, setJobId] = useState<number | "">(initialJobId ?? "");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const fmt = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString(INTL_LOCALE[locale], { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" });

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const chooseSupplier = (l: Line, sid: number) => {
    if (sid === NEW) { setAdding(l.key); setNs({ name: "", phone: "", paymentTerms: "", leadTimeDays: "" }); return; }
    update(l.key, { supplierId: sid, price: latestFrom(l.partId, sid)?.price ?? l.price });
  };
  const saveNewSupplier = (key: number) => start(async () => {
    const r = await quickSupplier({ name: ns.name, phone: ns.phone, paymentTerms: ns.paymentTerms, leadTimeDays: Number(ns.leadTimeDays) || null });
    if ("error" in r) { setError(r.error); return; }
    setSuppliers((s) => (s.some((x) => x.id === r.id) ? s : [...s, r].sort((a, b) => a.name.localeCompare(b.name))));
    update(key, { supplierId: r.id });
    setAdding(null); setError("");
  });

  const startNewPart = (text: string) => {
    // Something that looks like a part number goes in Part no.; anything else is the description.
    const isNo = /^[A-Z0-9][A-Z0-9\-/.]{2,}$/i.test(text) && /\d/.test(text) && !/\s/.test(text);
    setNp({ sku: isNo ? text : "", description: isNo ? "" : text, uom: "pc", categoryId: "", bulk: false });
  };
  const saveNewPart = () => start(async () => {
    if (!np) return;
    if (!np.description.trim()) { setError(t("qp.err.desc")); return; }
    const r = await quickPart({ ...np, categoryId: Number(np.categoryId) });
    if ("error" in r) { setError(r.error); return; }
    const bp: BuilderPart = { ...r, onHand: 0, onOrder: 0, minLevel: 0, oem: null, bin: null, models: [], prices: [] };
    setParts((ps) => [...ps, bp]);
    setLines((ls) => [...ls, { key: seq.current++, partId: r.id, supplierId: suppliers[0]?.id ?? 0, qty: 1, price: 0 }]);
    setNp(null); setError("");
  });

  const groups = useMemo(() => {
    const g = new Map<number, Line[]>();
    for (const l of lines) if (l.supplierId && l.qty > 0) g.set(l.supplierId, [...(g.get(l.supplierId) ?? []), l]);
    return [...g.entries()].map(([sid, ls]) => ({ sid, name: suppliers.find((s) => s.id === sid)?.name ?? "?", total: ls.reduce((a, l) => a + l.qty * l.price, 0), n: ls.length }));
  }, [lines, suppliers]);

  const submit = () => start(async () => {
    setError("");
    const r = await createPurchaseOrders({ lines: lines.map(({ partId, supplierId, qty, price }) => ({ partId, supplierId, qty, price })), jobId: jobId || null, notes });
    if ("error" in r) { setError(r.error); return; }
    router.push(r.ids.length === 1 ? `/purchasing/${r.ids[0]}?ok=${encodeURIComponent(t("ok.poRaised", { nos: r.nos.join(", ") }))}` : `/purchasing?ok=${encodeURIComponent(t("ok.poRaised", { nos: r.nos.join(", ") }))}`);
    router.refresh();
  });

  const unused = parts.filter((p) => !lines.some((l) => l.partId === p.id));
  return (
    <div className="stack">
      <div className="panel"><div className="panel-head"><h3>{t("po.lines")}</h3><span className="muted" style={{ fontSize: ".8rem" }}>{t("po.linesHelp")}</span></div>
        {lines.length === 0 && <div className="empty">{t("po.noLines")}</div>}
        {lines.map((l) => {
          const p = partById.get(l.partId)!;
          const last = latestFrom(l.partId, l.supplierId);
          const change = last && last.price > 0 ? ((l.price - last.price) / last.price) * 100 : null;
          const priced = p.prices.map((x) => x.supplierId);
          return (
            <div key={l.key} className="poline">
              <div className="poline-part"><b>{p.description}</b> <span className="mono muted">{p.sku}</span><br />
                <small className="muted">{t("po.stockLine", { onHand: p.onHand, min: p.minLevel, onOrder: p.onOrder, uom: p.uom })}</small></div>
              <div className="poline-prices">
                {p.prices.length ? p.prices.map((x, i) => (
                  <button type="button" key={x.supplierId} className={`pricechip ${x.supplierId === l.supplierId ? "on" : ""}`} onClick={() => chooseSupplier(l, x.supplierId)}>
                    <span>{x.supplierName}</span><b>{rm(x.price)}</b><small>{fmt(x.priceDate)}{i === 0 && p.prices.length > 1 ? ` · ${t("parts.lowest")}` : ""}</small>
                  </button>)) : <small className="muted">{t("po.noPricesYet")}</small>}
              </div>
              <div className="poline-inputs">
                <label>{t("sup.supplier")}<select className="field" value={l.supplierId || ""} onChange={(e) => chooseSupplier(l, Number(e.target.value))}>
                  <option value="" disabled>{t("common.choose")}</option>
                  {suppliers.filter((s) => priced.includes(s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  <optgroup label={t("po.otherSuppliers")}>{suppliers.filter((s) => !priced.includes(s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>
                  <option value={NEW}>{t("po.newSupplierOpt")}</option>
                </select></label>
                <label>{t("po.qty")} ({p.uom})<input type="number" min="0" step="any" value={l.qty} onChange={(e) => update(l.key, { qty: Number(e.target.value) })} /></label>
                <label>{t("po.unitPrice")}<input type="number" min="0" step="0.01" value={l.price || ""} onChange={(e) => update(l.key, { price: Number(e.target.value) })} /></label>
                <div className="poline-total"><span className="label">{t("col.amount")}</span><b className="num">{rm(l.qty * l.price)}</b></div>
                <button type="button" className="linkbtn muted" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>{t("common.remove")}</button>
              </div>
              {adding === l.key && (
                <div className="newsup">
                  <b>{t("po.newSupplierTitle")}</b>
                  <div className="filters">
                    <input placeholder={t("sup.name")} value={ns.name} onChange={(e) => setNs({ ...ns, name: e.target.value })} aria-label={t("sup.name")} style={{ flex: "1 1 180px" }} />
                    <input placeholder={t("c.phone")} type="tel" value={ns.phone} onChange={(e) => setNs({ ...ns, phone: e.target.value })} aria-label={t("c.phone")} />
                    <input placeholder={t("sup.terms")} value={ns.paymentTerms} onChange={(e) => setNs({ ...ns, paymentTerms: e.target.value })} aria-label={t("sup.terms")} />
                    <input placeholder={t("sup.leadTimeDays")} type="number" min="0" value={ns.leadTimeDays} onChange={(e) => setNs({ ...ns, leadTimeDays: e.target.value })} aria-label={t("sup.leadTimeDays")} style={{ width: 120 }} />
                    <button type="button" className="btn small primary" disabled={pending || !ns.name.trim()} onClick={() => saveNewSupplier(l.key)}>{t("po.addSupplier")}</button>
                    <button type="button" className="btn small" onClick={() => setAdding(null)}>{t("common.cancel")}</button>
                  </div>
                </div>
              )}
              {l.supplierId > 0 && l.price > 0 && (
                !last ? <small className="hint-info">{t("po.firstPrice")}</small>
                : change !== null && Math.abs(change) > warnPct ? <small className="hint-warn">{t(change > 0 ? "po.priceUp" : "po.priceDown", { pct: Math.abs(Math.round(change * 10) / 10), last: rm(last.price), date: fmt(last.priceDate) })}</small>
                : Math.abs(l.price - last.price) >= 0.005 ? <small className="hint-info">{t("po.newPrice", { last: rm(last.price) })}</small> : null
              )}
            </div>
          );
        })}
        <div className="filters" style={{ padding: "10px 14px", borderTop: "1px solid var(--line)" }}>
          {np ? (
            <div className="panel qp" style={{ flex: "1 1 100%", padding: 12 }}>
              <b>{t("qp.title")}</b>
              <div className="form" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", marginTop: 8 }}>
                <label>{t("jp.partNo")}<input value={np.sku} onChange={(e) => setNp({ ...np, sku: e.target.value })} placeholder={t("qp.skuPh")} maxLength={60} /></label>
                <label style={{ gridColumn: "span 2" }}>{t("bl.desc")}<input value={np.description} onChange={(e) => setNp({ ...np, description: e.target.value })} required maxLength={200} autoFocus /></label>
                <label>{t("parts.uom")}<input value={np.uom} onChange={(e) => setNp({ ...np, uom: e.target.value })} list="uoms-po" /></label>
                <datalist id="uoms-po"><option>pc</option><option>set</option><option>kit</option><option>m</option><option>L</option><option>pail</option><option>drum</option><option>kg</option><option>box</option><option>roll</option></datalist>
                <label>{t("parts.category")}<select className="field" value={np.categoryId} onChange={(e) => setNp({ ...np, categoryId: e.target.value })}><option value="">{t("rp2.noCat")}</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                <label className="set-check" style={{ alignSelf: "end" }}><input type="checkbox" checked={np.bulk} onChange={(e) => setNp({ ...np, bulk: e.target.checked })} /> {t("bulk.badge")}</label>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button type="button" className="btn small primary" disabled={pending} onClick={saveNewPart}>{t("qp.save")}</button>
                <button type="button" className="btn small" onClick={() => { setNp(null); setError(""); }}>{t("common.cancel")}</button>
              </div>
              {error && <div className="notice err" style={{ marginTop: 8 }}>{error}</div>}
              <small className="muted">{t("qp.help")}</small>
            </div>
          ) : <PartPicker placeholder={t("pp.addPh")} onPick={(p) => setLines((ls) => [...ls, mk(p.id)])} onCreate={startNewPart}
            parts={unused.map((p) => ({ id: p.id, sku: p.sku, oem: p.oem, description: p.description, category: p.category, bin: p.bin, onHand: p.onHand, uom: p.uom, fits: false, models: p.models, bulk: p.bulk }))} />}
        </div>
      </div>

      <div className="panel"><div className="form" style={{ padding: 14 }}>
        <label>{t("po.forJob")}<select className="field" value={jobId} onChange={(e) => setJobId(e.target.value ? Number(e.target.value) : "")}><option value="">{t("po.stockOnly")}</option>{jobs.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}</select></label>
        <label>{t("u.notes")}<input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("po.notesPh")} /></label>
      </div></div>

      <div className="panel"><div className="panel-head"><h3>{t("po.willRaise")}</h3></div><div className="in" style={{ padding: 14 }}>
        {groups.map((g) => (
          <div key={g.sid} style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <span><b>{g.name}</b> · {t("po.nLines", { n: g.n })}</span>
            <span className="num">{rm(g.total)} {!canApprove && g.total > approvalLimit && <span className="pill appr">{t("po.needsBoss")}</span>}</span>
          </div>))}
        {groups.length === 0 && <span className="muted">{t("po.noLines")}</span>}
        {error && !np && <div className="notice err" role="alert">{error}</div>}
        <div><button type="button" className="btn primary" disabled={pending || !groups.length} onClick={submit}>{pending ? t("common.saving") : t("po.raise")}</button></div>
      </div></div>
    </div>
  );
}
