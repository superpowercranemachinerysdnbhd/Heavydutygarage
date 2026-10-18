import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { rm, today } from "@/lib/format";
import { costRows, groupBy, sum, type CostSum } from "@/lib/costs";
import { unitsWithNames } from "@/lib/queries";
import { catColor, itemLabel } from "@/lib/lists";
import { ensureLists } from "@/lib/lists-server";
import { unitRef } from "@/lib/machine-types";
import { getI18n } from "@/i18n/server";
import { INTL_LOCALE } from "@/i18n";

export async function generateMetadata() {
  return { title: (await getI18n()).t("nav.reports") };
}

const total = (c: CostSum) => c.parts + c.labour;

/** Maintenance cost report (Head Manager): by month, by machine and by work order category, for one year. */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ y?: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "money.labourCost")) notFound();
  const { t, locale } = await getI18n();
  await ensureLists();
  const sp = await searchParams;
  const thisYear = Number(today().slice(0, 4));
  const year = /^\d{4}$/.test(sp.y ?? "") && Number(sp.y) > 2000 && Number(sp.y) <= thisYear ? Number(sp.y) : thisYear;
  const [rows, units] = await Promise.all([costRows({ from: `${year}-01-01`, to: `${year}-12-31` }), unitsWithNames()]);
  const all = sum(rows);
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const byMonth = groupBy(rows, (r) => r.opened.slice(0, 7));
  const maxMonth = Math.max(1, ...months.map((m) => total(byMonth.get(m) ?? { n: 0, parts: 0, labour: 0, hours: 0 })));
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
      <p className="muted" style={{ margin: 0 }}>{t("rp.intro")}</p>
      <nav className="sum" aria-label={t("rp.title")}>
        <div><b style={{ fontSize: "1.4rem" }}>{rm(total(all))}</b><span>{t("rp.total")}</span></div>
        <div><b style={{ fontSize: "1.4rem" }}>{rm(all.parts)}</b><span>{t("mc.parts")}</span></div>
        <div><b style={{ fontSize: "1.4rem" }}>{rm(all.labour)}</b><span>{t("rp.labour", { h: Math.round(all.hours) })}</span></div>
        <div><b>{all.n}</b><span>{t("mc.orders")}</span></div>
      </nav>

      <section className="panel">
        <div className="panel-head"><h3>{t("rp.byMonth")}</h3></div>
        <div className="tbl-wrap" style={{ border: 0, borderRadius: 0 }}><table className="rp">
          <thead><tr><th>{t("rp.month")}</th><th className="r">{t("mc.orders")}</th><th className="r">{t("mc.parts")}</th><th className="r">{t("mc.labour")}</th><th className="r">{t("mc.total")}</th><th className="bar-col"></th></tr></thead>
          <tbody>{months.map((m) => { const c = byMonth.get(m) ?? { n: 0, parts: 0, labour: 0, hours: 0 }; return (
            <tr key={m}><td>{monthName(m)}</td><td className="r num">{c.n || ""}</td><td className="r num">{c.n ? rm(c.parts) : ""}</td><td className="r num">{c.n ? rm(c.labour) : ""}</td><td className="r num"><b>{c.n ? rm(total(c)) : ""}</b></td>
              <td className="bar-col"><span className="bar" style={{ width: `${(total(c) / maxMonth) * 100}%` }} /></td></tr>); })}</tbody>
        </table></div>
      </section>

      <section className="panel">
        <div className="panel-head"><h3>{t("rp.byMachine")}</h3><span className="count">{byUnit.length}</span></div>
        <p className="hint" style={{ margin: 0, padding: "6px 14px 0" }}>{t("rp.byMachineHelp")}</p>
        <div className="tbl-wrap" style={{ border: 0, borderRadius: 0 }}><table className="rp">
          <thead><tr><th>{t("col.machine")}</th><th className="r">{t("mc.orders")}</th><th className="r">{t("mc.parts")}</th><th className="r">{t("mc.labour")}</th><th className="r">{t("mc.total")}</th><th className="r">%</th></tr></thead>
          <tbody>{byUnit.map(([id, c]) => { const u = unit.get(id); return (
            <tr key={id}><td><Link href={`/machinery/${id}#cost`}><b className={u?.plateNo ? "mono" : ""}>{u ? unitRef(u) : id}</b></Link>{u && <small className="muted"> {u.make} {u.model}</small>}</td>
              <td className="r num">{c.n}</td><td className="r num">{rm(c.parts)}</td><td className="r num">{rm(c.labour)}</td><td className="r num"><b>{rm(total(c))}</b></td><td className="r num">{pct(c)}%</td></tr>); })}
            {byUnit.length === 0 && <tr><td colSpan={6} className="muted">{t("rp.none")}</td></tr>}</tbody>
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
