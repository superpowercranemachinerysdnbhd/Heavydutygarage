import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { STATUSES, ageLevel, type Category, type Status } from "@/lib/jobs";
import { coverPhotos, listJobs } from "@/lib/queries";
import { addDays, fmtDate, today } from "@/lib/format";
import { getI18n } from "@/i18n/server";
import { catLabel, statusLabel } from "@/i18n/labels";
import { CatChip, Pri, daysInStatus, dueInfo } from "@/components/ui";
import { machinePhotoUrl, unitRef } from "@/lib/machine-types";
import { catColor, categoryCodes } from "@/lib/lists";

export async function generateMetadata() {
  return { title: (await getI18n()).t("jobs.title") };
}

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string; status?: string; view?: string }> }) {
  const user = await requireUser();
  const { t, locale } = await getI18n();
  const sp = await searchParams;
  const status = sp.status ?? "open";
  let list = await listJobs(user);
  if (status === "open") list = list.filter((j) => j.status !== "closed");
  else if (STATUSES.includes(status as Status)) list = list.filter((j) => j.status === status);
  if (sp.cat) list = list.filter((j) => j.category === sp.cat);
  const q = (sp.q ?? "").trim().toLowerCase();
  if (q) list = list.filter((j) => [j.jobNo, j.make, j.model, j.serialNo, j.plateNo, j.customerName, j.complaint].join(" ").toLowerCase().includes(q));
  const view = sp.view === "table" ? "table" : "cards";
  const viewHref = (v: string) => `/jobs?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.cat ? { cat: sp.cat } : {}), status, view: v })}`;
  const covers = view === "cards" ? await coverPhotos(list.map((j) => j.id)) : new Map<number, number>();
  // Box view: newest first; each box shows the day the job was opened.
  const sorted = [...list].sort((a, b) => b.openedAt.localeCompare(a.openedAt) || b.id - a.id);
  const d0 = today();
  const dayLabel = (d: string) => (d === d0 ? t("jobs.today") : d === addDays(d0, -1) ? t("jobs.yesterday") : fmtDate(d, true, locale));

  return (
    <div className="page">
      <div className="view-head"><h2>{can(user.role, "job.viewAll") ? t("jobs.title") : t("jobs.mine")}</h2>{can(user.role, "job.create") && <Link className="btn primary" href="/jobs/new">{t("dash.newJob")}</Link>}</div>
      <form className="filters" method="get">
        <input type="search" name="q" defaultValue={sp.q ?? ""} placeholder={t("jobs.searchPh")} style={{ flex: "1 1 240px" }} aria-label={t("common.search")} />
        <select className="field" name="cat" defaultValue={sp.cat ?? ""} aria-label={t("f.category")}><option value="">{t("jobs.allCats")}</option>{categoryCodes({ all: true }).map((k) => <option key={k} value={k}>{catLabel(t, k)}</option>)}</select>
        <select className="field" name="status" defaultValue={status} aria-label={t("col.status")}><option value="open">{t("jobs.allOpen")}</option><option value="all">{t("jobs.all")}</option>{STATUSES.map((s) => <option key={s} value={s}>{statusLabel(t, s)}</option>)}</select>
        <input type="hidden" name="view" value={view} />
        <button className="btn">{t("common.filter")}</button>
        <span className="seg" role="group" aria-label={t("jobs.cards")}>
          <Link className="plain" href={viewHref("cards")} aria-current={view === "cards" ? "page" : undefined}>{t("jobs.cards")}</Link>
          <Link className="plain" href={viewHref("table")} aria-current={view === "table" ? "page" : undefined}>{t("jobs.table")}</Link>
        </span>
      </form>
      {view === "cards" ? (
        <div className="jgrid">
          {sorted.map((j) => {
            const due = dueInfo(j, t, locale);
            const cover = covers.get(j.id);
            const img = cover ? `/api/photos/${cover}` : machinePhotoUrl(j.unitId, j.unitPhotoPath);
            return (
              <Link key={j.id} href={`/jobs/${j.id}`} className="jcard plain" style={{ ["--cat" as string]: catColor(j.category) }}>
                {img ? <img src={img} alt="" loading="lazy" /> : <span className="jcard-nophoto">{t("jobs.noPhoto")}</span>}
                <div className="jcard-body">
                  <div className="jcard-top"><span className="jcard-date">{dayLabel(j.openedAt)}</span><Pri p={j.priority} t={t} /></div>
                  <b className="jcard-id">{j.plateNo ? <span className="mono">{j.plateNo}</span> : `${j.make} ${j.model}`}</b>
                  {j.plateNo && <small>{j.make} {j.model}</small>}
                  <small className="muted">{j.customerName} · <span className="mono">{j.jobNo}</span></small>
                  <div className="jcard-tags"><CatChip cat={j.category} t={t} /><span className="pill mute">{statusLabel(t, j.status)}</span></div>
                  <div className="jcard-foot"><span className={`due ${due.cls}`}>{due.text}</span><span>{j.leadName ?? <span className="due over">{t("dash.unassigned")}</span>}</span></div>
                </div>
              </Link>
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
