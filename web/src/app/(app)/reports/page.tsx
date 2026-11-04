import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { fmtDate, rm, today } from "@/lib/format";
import { EMPTY_SUM, costRows, costTotal as total, groupBy, outsideByVendor, sum, type CostSum } from "@/lib/costs";
import { unitsWithNames } from "@/lib/queries";
import { catColor, itemLabel } from "@/lib/lists";
import { ensureLists } from "@/lib/lists-server";
import { unitRef } from "@/lib/machine-types";
import { getI18n } from "@/i18n/server";
import { EXPENSE_CATEGORIES, monthlyExpenses, otherExpenses } from "@/lib/expenses";
import { Notice } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { addExpense, removeExpense } from "./actions";
import { INTL_LOCALE, type MessageKey } from "@/i18n";

export async function generateMetadata() {
  return { title: (await getI18n()).t("nav.reports") };
}


/** Maintenance cost report (Head Manager): by month, by machine and by work order category, for one year. */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ y?: string; ok?: string; error?: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "money.labourCost")) notFound();
  const { t, locale } = await getI18n();
  await ensureLists();
  const sp = await searchParams;
  const thisYear = Number(today().slice(0, 4));
  const year = /^\d{4}$/.test(sp.y ?? "") && Number(sp.y) > 2000 && Number(sp.y) <= thisYear ? Number(sp.y) : thisYear;
  const [rows, units, vendors, exp, others] = await Promise.all([costRows({ from: `${year}-01-01`, to: `${year}-12-31` }), unitsWithNames(), outsideByVendor(`${year}-01-01`, `${year}-12-31`),
    monthlyExpenses(year), otherExpenses(year)]);
  const expYear = exp.reduce((a, m) => ({ stock: a.stock + m.stock, jobParts: a.jobParts + m.jobParts, outside: a.outside + m.outside, salaries: a.salaries + m.salaries, extraPay: a.extraPay + m.extraPay, other: a.other + m.other, total: a.total + m.total }),
    { stock: 0, jobParts: 0, outside: 0, salaries: 0, extraPay: 0, other: 0, total: 0 });
  const maxExp = Math.max(1, ...exp.map((m) => m.total));
  const EXP_COLS = ["stock", "jobParts", "outside", "salaries", "extraPay", "other"] as const;
  const inHouse = sum(rows.filter((r) => !r.outsourced)), outsourced = sum(rows.filter((r) => r.outsourced));
  const all = sum(rows);
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const byMonth = groupBy(rows, (r) => r.opened.slice(0, 7));
  const maxMonth = Math.max(1, ...months.map((m) => total(byMonth.get(m) ?? EMPTY_SUM)));
  const byUnit = [...groupBy(rows, (r) => r.unitId)].sort((a, b) => total(b[1]) - total(a[1]));
  const byCat = [...groupBy(rows, (r) => r.category)].sort((a, b) => total(b[1]) - total(a[1]));
  const unit = new Map(units.map((u) => [u.id, u]));
  const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString(INTL_LOCALE[locale], { month: "short", timeZone: "UTC" });
  const pct = (c: CostSum) => (total(all) ? Math.round((total(c) / total(all)) * 100) : 0);
  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div className="view-head"><h2>{t("rp.title")}</h2>
        <div className="cal-bar">
          <Link className="btn small" href={`/reports?y=${year - 1}`} aria-label={t("rp.prevYear")}>‹</Link>
          <h3 className="cal-title">{year}</h3>
          {year < thisYear && <Link className="btn small" href={`/reports?y=${year + 1}`} aria-label={t("rp.nextYear")}>›</Link>}
        </div>
      </div>
      <Notice ok={sp.ok} error={sp.error} />

      <section className="panel" id="expenses">
        <div className="panel-head"><h3>{t("exp.title")}</h3><b className="num">{rm(expYear.total)}</b></div>
        <p className="hint" style={{ margin: 0, padding: "6px 14px 0" }}>{t("exp.help")}</p>
        <div className="tbl-wrap" style={{ border: 0, borderRadius: 0 }}><table className="rp">
          <thead><tr><th>{t("rp.month")}</th>{EXP_COLS.map((k) => <th key={k} className="r">{t(`exp.col.${k}`)}</th>)}<th className="r">{t("mc.total")}</th><th className="bar-col"></th></tr></thead>
          <tbody>{exp.map((m) => (
            <tr key={m.month}><td>{monthName(m.month)}</td>{EXP_COLS.map((k) => <td key={k} className="r num">{m[k] ? rm(m[k]) : ""}</td>)}<td className="r num"><b>{m.total ? rm(m.total) : ""}</b></td>
              <td className="bar-col"><span className="bar" style={{ width: `${(m.total / maxExp) * 100}%` }} /></td></tr>))}</tbody>
          <tfoot><tr><td><b>{year}</b></td>{EXP_COLS.map((k) => <td key={k} className="r num"><b>{rm(expYear[k])}</b></td>)}<td className="r num"><b>{rm(expYear.total)}</b></td><td /></tr></tfoot>
        </table></div>
        <details className="exp-other" open={others.length > 0 || !!sp.error}>
          <summary className="panel-head" style={{ cursor: "pointer" }}><h3>{t("exp.otherTitle")}</h3><span className="count">{others.length}</span></summary>
          <form action={addExpense} className="filters" style={{ padding: "8px 14px" }}>
            <input type="date" name="day" defaultValue={year === thisYear ? today() : `${year}-12-31`} required aria-label={t("col.date")} />
            <select className="field" name="category" required aria-label={t("col.category")} defaultValue="">
              <option value="" disabled>{t("exp.category")}</option>{EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{t(`exp.cat.${c}`)}</option>)}</select>
            <input name="description" placeholder={t("exp.descPh")} maxLength={200} style={{ flex: "1 1 180px" }} aria-label={t("exp.desc")} />
            <input type="number" name="amount" min="0.01" step="0.01" required placeholder={t("exp.amount")} style={{ width: 130 }} aria-label={t("exp.amount")} />
            <SubmitButton className="btn small primary">{t("common.add")}</SubmitButton>
          </form>
          {others.length > 0 && <div className="tbl-wrap" style={{ border: 0, borderRadius: 0 }}><table>
            <tbody>{others.map((e) => (
              <tr key={e.id}><td className="num">{fmtDate(e.day, false, locale)}</td><td>{t(`exp.cat.${e.category}` as MessageKey)}</td><td>{e.description}</td><td className="r num">{rm(Number(e.amount))}</td>
                <td className="r"><form action={removeExpense}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="y" value={year} /><SubmitButton className="linkbtn muted" confirm={t("exp.removeConfirm")}>{t("common.remove")}</SubmitButton></form></td></tr>))}</tbody>
          </table></div>}
        </details>
      </section>

      <h3 style={{ margin: "8px 0 0" }}>{t("rp.maintTitle")}</h3>
      <p className="muted" style={{ margin: 0 }}>{t("rp.intro")}</p>
      <nav className="sum" aria-label={t("rp.title")}>
        <div><b style={{ fontSize: "1.4rem" }}>{rm(total(all))}</b><span>{t("rp.total")}</span></div>
        <div><b style={{ fontSize: "1.4rem" }}>{rm(all.parts)}</b><span>{t("mc.parts")}</span></div>
        <div><b style={{ fontSize: "1.4rem" }}>{rm(all.outside)}</b><span>{t("rp.outside")}</span></div>
        <div><b style={{ fontSize: "1.4rem" }}>{rm(all.labour)}</b><span>{t("rp.labour", { h: Math.round(all.hours) })}</span></div>
        <div><b>{all.n}</b><span>{t("mc.orders")}</span></div>
      </nav>

      <section className="panel">
        <div className="panel-head"><h3>{t("rp.byMonth")}</h3></div>
        <div className="tbl-wrap" style={{ border: 0, borderRadius: 0 }}><table className="rp">
          <thead><tr><th>{t("rp.month")}</th><th className="r">{t("mc.orders")}</th><th className="r">{t("mc.parts")}</th><th className="r">{t("rp.outside")}</th><th className="r">{t("mc.labour")}</th><th className="r">{t("mc.total")}</th><th className="bar-col"></th></tr></thead>
          <tbody>{months.map((m) => { const c = byMonth.get(m) ?? EMPTY_SUM; return (
            <tr key={m}><td>{monthName(m)}</td><td className="r num">{c.n || ""}</td><td className="r num">{c.n ? rm(c.parts) : ""}</td><td className="r num">{c.outside ? rm(c.outside) : ""}</td><td className="r num">{c.n ? rm(c.labour) : ""}</td><td className="r num"><b>{c.n ? rm(total(c)) : ""}</b></td>
              <td className="bar-col"><span className="bar" style={{ width: `${(total(c) / maxMonth) * 100}%` }} /></td></tr>); })}</tbody>
        </table></div>
      </section>

      <section className="panel">
        <div className="panel-head"><h3>{t("rp.byMachine")}</h3><span className="count">{byUnit.length}</span></div>
        <p className="hint" style={{ margin: 0, padding: "6px 14px 0" }}>{t("rp.byMachineHelp")}</p>
        <div className="tbl-wrap" style={{ border: 0, borderRadius: 0 }}><table className="rp">
          <thead><tr><th>{t("col.machine")}</th><th className="r">{t("mc.orders")}</th><th className="r">{t("mc.parts")}</th><th className="r">{t("rp.outside")}</th><th className="r">{t("mc.labour")}</th><th className="r">{t("mc.total")}</th><th className="r">%</th></tr></thead>
          <tbody>{byUnit.map(([id, c]) => { const u = unit.get(id); return (
            <tr key={id}><td><Link href={`/machinery/${id}#cost`}><b className={u?.plateNo ? "mono" : ""}>{u ? unitRef(u) : id}</b></Link>{u && <small className="muted"> {u.make} {u.model}</small>}</td>
              <td className="r num">{c.n}</td><td className="r num">{rm(c.parts)}</td><td className="r num">{c.outside ? rm(c.outside) : ""}</td><td className="r num">{rm(c.labour)}</td><td className="r num"><b>{rm(total(c))}</b></td><td className="r num">{pct(c)}%</td></tr>); })}
            {byUnit.length === 0 && <tr><td colSpan={7} className="muted">{t("rp.none")}</td></tr>}</tbody>
        </table></div>
      </section>

      <section className="panel">
        <div className="panel-head"><h3>{t("rp.split")}</h3></div>
        <div className="tbl-wrap" style={{ border: 0, borderRadius: 0 }}><table className="rp">
          <thead><tr><th></th><th className="r">{t("mc.orders")}</th><th className="r">{t("mc.parts")}</th><th className="r">{t("rp.outside")}</th><th className="r">{t("mc.labour")}</th><th className="r">{t("mc.total")}</th><th className="r">%</th></tr></thead>
          <tbody>{([[t("rp.inHouse"), inHouse], [t("rp.outsourced"), outsourced]] as const).map(([l, c]) => (
            <tr key={l}><td><b>{l}</b></td><td className="r num">{c.n}</td><td className="r num">{rm(c.parts)}</td><td className="r num">{rm(c.outside)}</td><td className="r num">{rm(c.labour)}</td><td className="r num"><b>{rm(total(c))}</b></td><td className="r num">{pct(c)}%</td></tr>))}</tbody>
        </table></div>
      </section>

      <section className="panel">
        <div className="panel-head"><h3>{t("rp.byVendor")}</h3><span className="count">{vendors.length}</span></div>
        <p className="hint" style={{ margin: 0, padding: "6px 14px 0" }}>{t("rp.byVendorHelp")}</p>
        <div className="tbl-wrap" style={{ border: 0, borderRadius: 0 }}><table className="rp">
          <thead><tr><th>{t("out.vendor")}</th><th className="r">{t("mc.orders")}</th><th className="r">{t("rp.lines")}</th><th className="r">{t("mc.total")}</th><th className="r">%</th></tr></thead>
          <tbody>{vendors.map((v) => (
            <tr key={`${v.supplierId}-${v.vendor}`}><td>{v.supplierId ? <Link href={`/purchasing/suppliers/${v.supplierId}`}>{v.vendor}</Link> : v.vendor}</td><td className="r num">{v.jobs}</td><td className="r num">{v.n}</td><td className="r num"><b>{rm(v.amount)}</b></td>
              <td className="r num">{all.outside ? Math.round((v.amount / all.outside) * 100) : 0}%</td></tr>))}
            {vendors.length === 0 && <tr><td colSpan={5} className="muted">{t("rp.none")}</td></tr>}</tbody>
        </table></div>
      </section>

      <section className="panel">
        <div className="panel-head"><h3>{t("rp.byCategory")}</h3></div>
        <div className="tbl-wrap" style={{ border: 0, borderRadius: 0 }}><table className="rp">
          <thead><tr><th>{t("col.category")}</th><th className="r">{t("mc.orders")}</th><th className="r">{t("mc.total")}</th><th className="r">%</th></tr></thead>
          <tbody>{byCat.map(([k, c]) => (
            <tr key={k}><td><span className="chip" style={{ ["--cat" as string]: catColor(k) }}><span className="dot" />{itemLabel(t, "job_category", k)}</span></td><td className="r num">{c.n}</td><td className="r num"><b>{rm(total(c))}</b></td><td className="r num">{pct(c)}%</td></tr>))}</tbody>
        </table></div>
      </section>
    </div>
  );
}
