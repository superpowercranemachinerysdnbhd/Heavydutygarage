import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ON_HAND, STATUSES, ageLevel, type Category, type Status } from "@/lib/jobs";
import { coverPhotos, listJobs } from "@/lib/queries";
import { addDays, fmtDate, today } from "@/lib/format";
import { getI18n } from "@/i18n/server";
import { catLabel, statusLabel } from "@/i18n/labels";
import { CatChip, Notice, Pri, daysInStatus, dueInfo } from "@/components/ui";
import JobBox from "@/components/JobBox";
import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import ActNow from "@/components/ActNow";
import { workshopAlerts } from "@/lib/board";
import { machinePhotoUrl, unitRef } from "@/lib/machine-types";
import { catColor, categoryCodes } from "@/lib/lists";

export async function generateMetadata() {
  return { title: (await getI18n()).t("jobs.title") };
}

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string; status?: string; view?: string; ok?: string; error?: string }> }) {
  const user = await requireUser();
  const { t, locale } = await getI18n();
  const sp = await searchParams;
  const crew = !can(user.role, "job.viewAll");
  const status = crew ? "onhand" : sp.status ?? "in_progress";
  const everything = await listJobs(user);
  const openJobs = everything.filter((j) => j.status !== "closed");
  const alerts = crew ? null : await workshopAlerts(user, locale, t, openJobs);
  // Counts for the status buttons (after the search and job type filters, before the status filter).
  const q = (sp.q ?? "").trim().toLowerCase();
  const matching = everything.filter((j) => (!sp.cat || j.category === sp.cat) && (!q || [j.jobNo, j.make, j.model, j.serialNo, j.plateNo, j.customerName, j.complaint].join(" ").toLowerCase().includes(q)));
  const counts: Record<string, number> = { open: matching.filter((j) => j.status !== "closed").length, all: matching.length };
  for (const s of STATUSES) counts[s] = matching.filter((j) => j.status === s).length;
  let list = matching;
  if (status === "onhand") list = list.filter((j) => ON_HAND.includes(j.status));
  else if (status === "open") list = list.filter((j) => j.status !== "closed");
  else if (STATUSES.includes(status as Status)) list = list.filter((j) => j.status === status);
  const view = sp.view === "table" ? "table" : "cards";
  const hrefWith = (o: { status?: string; view?: string }) =>
    `/jobs?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.cat ? { cat: sp.cat } : {}), status: o.status ?? status, view: o.view ?? view })}`;
  const viewHref = (v: string) => hrefWith({ view: v });
  const covers = view === "cards" ? await coverPhotos(list.map((j) => j.id)) : new Map<number, number>();
  // Box view: newest first; each box shows the day the job was opened.
  const sorted = [...list].sort((a, b) => b.openedAt.localeCompare(a.openedAt) || b.id - a.id);
  const d0 = today();
  const dayLabel = (d: string) => (d === d0 ? t("jobs.today") : d === addDays(d0, -1) ? t("jobs.yesterday") : fmtDate(d, true, locale));

  return (
    <div className="page">
      <div className="view-head"><h2>{crew ? t("jobs.onHand") : t("jobs.title")} <span className="muted" style={{ fontFamily: "var(--f-body)", fontSize: ".9rem", fontWeight: 400 }}>{fmtDate(today(), true, locale)}</span></h2>{can(user.role, "job.create") && <><Link className="btn primary" href="/jobs/new?emergency=1">{t("dash.emergency")}</Link><Link className="btn" href="/jobs/new">{t("dash.newJob")}</Link></>}</div>
      {alerts && <ActNow t={t} now={alerts.now} later={alerts.later} open={openJobs} />}
      <Notice ok={sp.ok} error={sp.error} />
      {!crew && (
        <nav className="chipbar status-chips" aria-label={t("col.status")}>
          {([...STATUSES, "open", "all"] as const).map((k) => (
            <Link key={k} href={hrefWith({ status: k })} className={`chip plain filt ${status === k ? "on" : ""}`} aria-current={status === k ? "true" : undefined}>
              {k === "open" ? t("jobs.allOpen") : k === "all" ? t("jobs.all") : statusLabel(t, k)} <b>{counts[k]}</b>
            </Link>
          ))}
        </nav>
      )}
      <form className="filters" method="get">
        <input type="search" name="q" defaultValue={sp.q ?? ""} placeholder={t("jobs.searchPh")} style={{ flex: "1 1 240px" }} aria-label={t("common.search")} />
        <AutoSubmitSelect className="field" name="cat" defaultValue={sp.cat ?? ""} aria-label={t("f.category")}><option value="">{t("jobs.allCats")}</option>{categoryCodes({ all: true }).map((k) => <option key={k} value={k}>{catLabel(t, k)}</option>)}</AutoSubmitSelect>
        {!crew && <input type="hidden" name="status" value={status} />}
        <input type="hidden" name="view" value={view} />
        <button className="btn primary">{t("common.search")}</button>
        {(sp.q || sp.cat || (!crew && status !== "in_progress")) && <Link className="btn" href={`/jobs?view=${view}`}>{t("jobs.clear")}</Link>}
        <span className="seg" role="group" aria-label={t("jobs.cards")}>
          <Link className="plain" href={viewHref("cards")} aria-current={view === "cards" ? "page" : undefined}>{t("jobs.cards")}</Link>
          <Link className="plain" href={viewHref("table")} aria-current={view === "table" ? "page" : undefined}>{t("jobs.table")}</Link>
        </span>
      </form>
      {view === "cards" ? (
        <div className="jgrid">
          {sorted.map((j) => {
            return (
              <JobBox key={j.id} j={j} cover={covers.get(j.id)} t={t} locale={locale} />
            );
          })}
          {list.length === 0 && <div className="empty">{t("jobs.none")}</div>}
        </div>
      ) : (
      <div className="tbl-wrap"><table>
        <thead><tr><th>{t("col.job")}</th><th>{t("col.category")}</th><th>{t("col.machine")}</th><th>{t("col.customer")}</th><th>{t("col.status")}</th><th>{t("col.inStatus")}</th><th>{t("col.lead")}</th><th>{t("col.due")}</th></tr></thead>
        <tbody>
          {list.map((j) => {
            const due = dueInfo(j, t, locale), d = daysInStatus(j.statusSince);
            return (
              <tr key={j.id}>
                <td className="mono"><Link href={`/jobs/${j.id}`}>{j.jobNo}</Link></td>
                <td><CatChip cat={j.category} t={t} /></td>
                <td><b>{j.make} {j.model}</b><br /><small className="muted mono">{unitRef(j)}</small></td>
                <td>{j.customerName}</td>
                <td>{statusLabel(t, j.status)}<br /><Pri p={j.priority} t={t} /></td>
                <td className={`num age ${ageLevel(j.status, d)}`}>{j.status === "closed" ? "—" : t("mach.days", { n: d })}</td>
                <td>{j.leadName ?? <span className="due over">{t("dash.unassigned")}</span>}</td>
                <td className={`num due ${due.cls}`}>{due.text}</td>
              </tr>
            );
          })}
          {list.length === 0 && <tr><td colSpan={8} className="muted">{t("jobs.none")}</td></tr>}
        </tbody>
      </table></div>
      )}
    </div>
  );
}
