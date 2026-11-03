import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { addDays, daysBetween, fmtDate, today } from "@/lib/format";
import { maintenanceBoard, type BoardUnit } from "@/lib/services";
import { isServiceCategory, itemLabel } from "@/lib/lists";
import { ensureLists } from "@/lib/lists-server";
import { unitRef } from "@/lib/machine-types";
import { getI18n } from "@/i18n/server";
import type { Locale, T } from "@/i18n";

export async function generateMetadata() {
  return { title: (await getI18n()).t("pm.title") };
}

type View = "overdue" | "14" | "30" | "all" | "none";
const VIEWS: View[] = ["overdue", "14", "30", "all", "none"];

/** Preventive maintenance: every machine's upcoming and overdue services, with a service work order one tap away. */
export default async function MaintenancePage({ searchParams }: { searchParams: Promise<{ v?: string; q?: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "job.create")) notFound();
  const { t, locale } = await getI18n();
  await ensureLists();
  const sp = await searchParams;
  const d = today(), d14 = addDays(d, 14), d30 = addDays(d, 30);
  const board = await maintenanceBoard();
  const q = (sp.q ?? "").trim().toLowerCase();
  const matching = board.filter((u) => !q || [u.plateNo, u.serialNo, u.make, u.model, u.company].join(" ").toLowerCase().includes(q));
  const upTo = (limit: string | null) => (u: BoardUnit) => u.items.filter((i) => i.nextDue && (limit === null ? i.nextDue < d : i.nextDue <= limit));
  const pick: Record<View, (u: BoardUnit) => BoardUnit["items"]> = {
    overdue: upTo(null), "14": upTo(d14), "30": upTo(d30), all: (u) => u.items.filter((i) => i.nextDue), none: () => [],
  };
  const counts = Object.fromEntries(VIEWS.map((v) => [v, v === "none" ? matching.filter((u) => !u.items.some((i) => i.nextDue)).length : matching.filter((u) => pick[v](u).length).length])) as Record<View, number>;
  const view: View = VIEWS.includes(sp.v as View) ? (sp.v as View) : counts.overdue ? "overdue" : "14";
  const rows = view === "none" ? matching.filter((u) => !u.items.some((i) => i.nextDue))
    : matching.filter((u) => pick[view](u).length).sort((a, b) => (a.firstDue ?? "").localeCompare(b.firstDue ?? ""));
  const href = (v: View) => `/maintenance?${new URLSearchParams({ v, ...(sp.q ? { q: sp.q } : {}) })}`;
  const allDue = board.flatMap((u) => u.items).filter((i) => i.nextDue);

  return (
    <div className="page">
      <div className="view-head"><h2>{t("pm.title")} <span className="muted" style={{ fontFamily: "var(--f-body)", fontSize: ".9rem", fontWeight: 400 }}>{fmtDate(d, true, locale)}</span></h2></div>
      <p className="muted" style={{ margin: 0 }}>{t("pm.intro")}</p>

      <nav className="sum pm-sum" aria-label={t("pm.title")}>
        <Link href={href("overdue")} className="plain"><b className="due over">{allDue.filter((i) => i.nextDue! < d).length}</b><span>{t("pm.sumOverdue")}</span></Link>
        <Link href={href("14")} className="plain"><b className="due soon">{allDue.filter((i) => i.nextDue! >= d && i.nextDue! <= d14).length}</b><span>{t("pm.sum14")}</span></Link>
        <Link href={href("30")} className="plain"><b>{allDue.filter((i) => i.nextDue! > d14 && i.nextDue! <= d30).length}</b><span>{t("pm.sum30")}</span></Link>
        <Link href={href("none")} className="plain"><b>{board.filter((u) => !u.items.some((i) => i.nextDue)).length}</b><span>{t("pm.sumNone")}</span></Link>
      </nav>

      <nav className="chipbar status-chips" aria-label={t("pm.title")}>
        {VIEWS.map((v) => <Link key={v} href={href(v)} className={`chip plain filt ${view === v ? "on" : ""}`} aria-current={view === v ? "true" : undefined}>{t(`pm.view.${v}`)} <b>{counts[v]}</b></Link>)}
      </nav>
      <form className="filters" method="get">
        <input type="hidden" name="v" value={view} />
        <input type="search" name="q" defaultValue={sp.q ?? ""} placeholder={t("pm.searchPh")} style={{ flex: "1 1 240px" }} aria-label={t("common.search")} />
        <button className="btn primary">{t("common.search")}</button>
        {sp.q && <Link className="btn" href={`/maintenance?v=${view}`}>{t("jobs.clear")}</Link>}
      </form>

      {view === "none" ? (
        <div className="panel"><div className="tbl-wrap" style={{ border: 0, borderRadius: 0 }}><table>
          <thead><tr><th>{t("col.machine")}</th><th>{t("col.customer")}</th><th /></tr></thead>
          <tbody>{rows.map((u) => <tr key={u.id}><td><b className={u.plateNo ? "mono" : ""}>{unitRef(u)}</b> <small className="muted">{u.make} {u.model}</small></td><td>{u.company}</td>
            <td className="r"><Link className="btn small" href={`/machinery/${u.id}#services`}>{t("pm.setUp")}</Link></td></tr>)}
            {rows.length === 0 && <tr><td colSpan={3} className="muted">{t("pm.allScheduled")}</td></tr>}</tbody>
        </table></div></div>
      ) : (
        <div className="pm-grid">
          {rows.map((u) => <PmCard key={u.id} u={u} due={pick[view](u)} t={t} locale={locale} d={d} />)}
          {rows.length === 0 && <div className="panel empty">{t("pm.nothing")}</div>}
        </div>
      )}
    </div>
  );
}

function PmCard({ u, due, t, locale, d }: { u: BoardUnit; due: BoardUnit["items"]; t: T; locale: Locale; d: string }) {
  const worst = due.some((i) => i.nextDue! < d) ? "over" : due.some((i) => i.state === "soon") ? "soon" : "";
  // A service work order already open for this machine covers it; other open jobs (repairs) are only mentioned.
  const openService = u.openJobs.find((j) => isServiceCategory(j.category));
  const otherOpen = u.openJobs.filter((j) => j !== openService);
  return (
    <section className={`panel pm-card ${worst}`}>
      <div className="pm-head">
        <div>
          <Link href={`/machinery/${u.id}`} className="plain"><b className={`pm-unit ${u.plateNo ? "mono" : ""}`}>{unitRef(u)}</b></Link>
          <small className="muted">{u.make} {u.model} · {u.company}</small>
          {u.location && <small className="muted">📍 {u.location}</small>}
        </div>
        {u.hourMeter ? <span className="pill mute">{u.hourMeter.toLocaleString()} h</span> : null}
      </div>
      <table className="pm-items"><tbody>{due.map((i) => {
        const n = daysBetween(d, i.nextDue!);
        return (
          <tr key={i.id}>
            <td><b>{itemLabel(t, "service_item", i.item)}</b><br /><small className="muted">{i.lastDone ? t("pm.lastDone", { date: fmtDate(i.lastDone, false, locale) }) : t("pm.neverDone")}{i.intervalMonths ? ` · ${i.intervalMonths === 1 ? t("pm.everyMonth") : t("pm.every", { n: i.intervalMonths })}` : ""}</small></td>
            <td className="r"><span className={`due ${n < 0 ? "over" : i.state === "soon" ? "soon" : ""}`}>{fmtDate(i.nextDue, false, locale)}</span><br />
              <small className={n < 0 ? "due over" : "muted"}>{n < 0 ? t("pm.daysLate", { n: -n }) : n === 0 ? t("pm.today") : t("pm.inDays", { n })}</small></td>
          </tr>);
      })}</tbody></table>
      <div className="pm-actions">
        {openService
          ? <Link className="btn small" href={`/jobs/${openService.id}`}>{t("pm.openJob", { no: openService.jobNo })}</Link>
          : <Link className="btn small primary" href={`/jobs/new?unit=${u.id}&pm=${due.map((i) => i.item).join(",")}`}>{t("pm.createJob")}</Link>}
        <Link className="btn small" href={`/machinery/${u.id}#services`}>{t("pm.schedule")}</Link>
      </div>
      {otherOpen.length > 0 && <small className="muted">{t("pm.alsoOpen")} {otherOpen.map((j, n) => <span key={j.id}>{n ? ", " : ""}<Link href={`/jobs/${j.id}`} className="mono">{j.jobNo}</Link></span>)}</small>}
    </section>
  );
}
