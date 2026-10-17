import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { CATEGORY_KEYS, STATUSES, ageLevel, type Category, type Status } from "@/lib/jobs";
import { listJobs } from "@/lib/queries";
import { getI18n } from "@/i18n/server";
import { catLabel, statusLabel } from "@/i18n/labels";
import { CatChip, Pri, daysInStatus, dueInfo } from "@/components/ui";
import { unitRef } from "@/lib/machine-types";

export async function generateMetadata() {
  return { title: (await getI18n()).t("jobs.title") };
}

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string; status?: string }> }) {
  const user = await requireUser();
  const { t, locale } = await getI18n();
  const sp = await searchParams;
  const status = sp.status ?? "open";
  let list = await listJobs(user);
  if (status === "open") list = list.filter((j) => j.status !== "closed");
  else if (STATUSES.includes(status as Status)) list = list.filter((j) => j.status === status);
  if (sp.cat && CATEGORY_KEYS.includes(sp.cat as Category)) list = list.filter((j) => j.category === sp.cat);
  const q = (sp.q ?? "").trim().toLowerCase();
  if (q) list = list.filter((j) => [j.jobNo, j.make, j.model, j.serialNo, j.plateNo, j.customerName, j.complaint].join(" ").toLowerCase().includes(q));

  return (
    <div className="page">
      <div className="view-head"><h2>{can(user.role, "job.viewAll") ? t("jobs.title") : t("jobs.mine")}</h2>{can(user.role, "job.create") && <Link className="btn primary" href="/jobs/new">{t("dash.newJob")}</Link>}</div>
      <form className="filters" method="get">
        <input type="search" name="q" defaultValue={sp.q ?? ""} placeholder={t("jobs.searchPh")} style={{ flex: "1 1 240px" }} aria-label={t("common.search")} />
        <select className="field" name="cat" defaultValue={sp.cat ?? ""} aria-label={t("f.category")}><option value="">{t("jobs.allCats")}</option>{CATEGORY_KEYS.map((k) => <option key={k} value={k}>{catLabel(t, k)}</option>)}</select>
        <select className="field" name="status" defaultValue={status} aria-label={t("col.status")}><option value="open">{t("jobs.allOpen")}</option><option value="all">{t("jobs.all")}</option>{STATUSES.map((s) => <option key={s} value={s}>{statusLabel(t, s)}</option>)}</select>
        <button className="btn">{t("common.filter")}</button>
      </form>
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
    </div>
  );
}
