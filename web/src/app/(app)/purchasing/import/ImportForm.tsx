"use client";
import { useActionState } from "react";
import { useT } from "@/i18n/client";
import { importPrices, type ImportResult } from "../supplier-actions";

export default function ImportForm({ suppliers, today }: { suppliers: { id: number; name: string }[]; today: string }) {
  const t = useT();
  const [r, action, pending] = useActionState<ImportResult, FormData>(importPrices, {});
  return (
    <div className="stack">
      <form action={action} className="panel"><div className="form" style={{ padding: 14 }}>
        <label>{t("sup.supplier")}<select className="field" name="supplierId" required defaultValue=""><option value="" disabled>{t("common.choose")}</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label>{t("imp.date")}<input type="date" name="date" defaultValue={today} max={today} /></label>
        <label className="full">{t("imp.file")}<input type="file" name="file" accept=".csv,text/csv" required /></label>
        <div className="full"><button className="btn primary" disabled={pending}>{pending ? t("imp.importing") : t("imp.run")}</button></div>
      </div></form>
      {r.error && <div className="notice err" role="alert">{r.error}</div>}
      {r.updated !== undefined && (
        <div className="panel"><div className="panel-head"><h3>{t("imp.result")}</h3></div><div className="in" style={{ padding: 14 }}>
          <div className="notice ok">{t("imp.summary", { updated: r.updated, unchanged: r.unchanged ?? 0, unmatched: r.unmatched?.length ?? 0 })}</div>
          {!!r.bigChanges?.length && <><b>{t("imp.bigChanges")}</b><ul>{r.bigChanges.map((c) => <li key={c.sku}><span className="mono">{c.sku}</span>: RM {c.from.toFixed(2)} → RM {c.to.toFixed(2)} ({c.pct > 0 ? "+" : ""}{c.pct}%)</li>)}</ul></>}
          {!!r.unmatched?.length && <><b>{t("imp.unmatched")}</b><ul>{r.unmatched.map((u) => <li key={u.line}>{t("imp.line", { n: u.line })}: <span className="mono">{u.partNo}</span></li>)}</ul><small className="muted">{t("imp.unmatchedHelp")}</small></>}
          {!!r.problems?.length && <><b>{t("imp.skipped")}</b><ul>{r.problems.map((p) => <li key={p.line}>{t("imp.line", { n: p.line })}: {p.reason}</li>)}</ul></>}
        </div></div>
      )}
    </div>
  );
}
