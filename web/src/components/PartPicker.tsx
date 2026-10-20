"use client";
import { useId, useMemo, useRef, useState } from "react";
import { useT } from "@/i18n/client";

export type PickPart = { id: number; sku: string; oem: string | null; description: string; category: string; bin: string | null; onHand: number; uom: string; fits: boolean; models: string[]; bulk?: boolean };

const q2 = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));
/** Stock text; bulk parts are approximate and never "out" (there is usually some left in the drum / on the roll). */
const stockText = (t: ReturnType<typeof useT>, p: PickPart) => p.bulk ? t("bulk.about", { n: q2(p.onHand), uom: p.uom }) : t("jp.inStock", { n: q2(p.onHand), uom: p.uom });
const stockCls = (p: PickPart) => (p.bulk || p.onHand > 0 ? "" : "none");
const MAX = 40;

/** Type to find a stock part: part no., OEM no., description, category, bin or machine model (any order, any case).
 *  Parts that fit this machine and parts in stock come first. Tap a result to choose it. */
export default function PartPicker({ parts, name = "partId", placeholder }: { parts: PickPart[]; name?: string; placeholder: string }) {
  const t = useT();
  const id = useId();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<PickPart | null>(null);
  const [hi, setHi] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const hay = useMemo(() => new Map(parts.map((p) => [p.id, [p.sku, p.oem, p.description, p.category, p.bin, ...p.models].filter(Boolean).join(" ").toLowerCase()])), [parts]);
  const found = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const qq = words.join(" ");
    const hits = parts.filter((p) => words.every((w) => hay.get(p.id)!.includes(w)));
    const score = (p: PickPart) => (p.fits ? 0 : 4) + (p.bulk || p.onHand > 0 ? 0 : 2) + (qq && (p.sku.toLowerCase().startsWith(qq) || (p.oem ?? "").toLowerCase().startsWith(qq)) ? 0 : 1);
    return hits.sort((a, b) => score(a) - score(b) || a.description.localeCompare(b.description));
  }, [q, parts, hay]);
  const shown = found.slice(0, MAX);

  const choose = (p: PickPart) => { setSel(p); setOpen(false); setQ(""); };
  const clear = () => { setSel(null); setTimeout(() => input.current?.focus(), 0); };

  if (sel) return (
    <div className="pp pp-sel" style={{ flex: "1 1 260px" }}>
      <input type="hidden" name={name} value={sel.id} />
      <span className="pp-chosen"><b className="mono">{sel.sku}</b> {sel.description} <small className={stockCls(sel) ? "due over" : "muted"}>({stockText(t, sel)})</small></span>
      <button type="button" className="btn small" onClick={clear} aria-label={t("pp.change")}>{t("pp.change")}</button>
    </div>
  );
  return (
    <div className="pp" style={{ flex: "1 1 260px" }} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <input ref={input} type="search" required value={q} placeholder={placeholder} aria-label={placeholder} autoComplete="off"
        role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list"
        onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, shown.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); if (open && shown[hi]) choose(shown[hi]); }
          else if (e.key === "Escape") setOpen(false);
        }} />
      {open && (
        <ul className="pp-list" id={`${id}-list`} role="listbox">
          {shown.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === hi}>
              <button type="button" className={i === hi ? "hi" : ""} onMouseEnter={() => setHi(i)} onClick={() => choose(p)}>
                <span className="pp-top"><b className="mono">{p.sku}</b>{p.fits && <span className="pill ok">{t("pp.fits")}</span>}
                  {p.bulk && <span className="pill info">{t("bulk.badge")}</span>}
                  <span className={`pp-stock ${stockCls(p)}`}>{stockText(t, p)}</span></span>
                <span className="pp-desc">{p.description}</span>
                <small className="muted">{p.category}{p.bin ? ` · ${t("pp.bin", { bin: p.bin })}` : ""}{p.oem && p.oem !== p.sku ? ` · ${p.oem}` : ""}</small>
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className="pp-none muted">{t("pp.none")}</li>}
          {found.length > MAX && <li className="pp-none muted">{t("pp.more", { n: found.length - MAX })}</li>}
        </ul>
      )}
    </div>
  );
}
