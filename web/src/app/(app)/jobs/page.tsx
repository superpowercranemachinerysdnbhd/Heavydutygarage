import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { CATEGORIES, CATEGORY_KEYS, STATUSES, STATUS_LABEL, ageLevel, type Category, type Status } from "@/lib/jobs";
import { listJobs } from "@/lib/queries";
import { CatChip, Pri, daysInStatus, dueInfo } from "@/components/ui";

export const metadata = { title: "Jobs" };

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string; status?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const status = sp.status ?? "open";
  let list = await listJobs(user);
  if (status === "open") list = list.filter((j) => j.status !== "closed");
  else if (STATUSES.includes(status as Status)) list = list.filter((j) => j.status === status);
  if (sp.cat && CATEGORY_KEYS.includes(sp.cat as Category)) list = list.filter((j) => j.category === sp.cat);
  const q = (sp.q ?? "").trim().toLowerCase();
  if (q) list = list.filter((j) => [j.jobNo, j.make, j.model, j.serialNo, j.customerName, j.complaint].join(" ").toLowerCase().includes(q));

  return (
    <div className="page">
      <div className="view-head"><h2>{can(user.role, "job.viewAll") ? "Jobs" : "My jobs"}</h2>{can(user.role, "job.create") && <Link className="btn primary" href="/jobs/new">+ New job</Link>}</div>
      <form className="filters" method="get">
        <input type="search" name="q" defaultValue={sp.q ?? ""} placeholder="Search job no., machine, serial, customer" style={{ flex: "1 1 240px" }} aria-label="Search" />
        <select className="field" name="cat" defaultValue={sp.cat ?? ""} aria-label="Category"><option value="">All categories</option>{CATEGORY_KEYS.map((k) => <option key={k} value={k}>{CATEGORIES[k].name}</option>)}</select>
        <select className="field" name="status" defaultValue={status} aria-label="Status"><option value="open">All open</option><option value="all">All incl. closed</option>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>
        <button className="btn">Filter</button>
      </form>
      <div className="tbl-wrap"><table>
        <thead><tr><th>Job</th><th>Category</th><th>Machine</th><th>Customer</th><th>Status</th><th>In status</th><th>Lead</th><th>Due</th></tr></thead>
        <tbody>
          {list.map((j) => {
            const due = dueInfo(j), d = daysInStatus(j.statusSince);
            return (
              <tr key={j.id}>
                <td className="mono"><Link href={`/jobs/${j.id}`}>{j.jobNo}</Link></td>
                <td><CatChip cat={j.category} /></td>
                <td><b>{j.make} {j.model}</b><br /><small className="muted mono">{j.serialNo}</small></td>
                <td>{j.customerName}</td>
                <td>{STATUS_LABEL[j.status]}<br /><Pri p={j.priority} /></td>
                <td className={`num age ${ageLevel(j.status, d)}`}>{j.status === "closed" ? "—" : `${d} d`}</td>
                <td>{j.leadName ?? <span className="due over">Unassigned</span>}</td>
                <td className={`num due ${due.cls}`}>{due.text}</td>
              </tr>
            );
          })}
          {list.length === 0 && <tr><td colSpan={8} className="muted">No jobs match.</td></tr>}
        </tbody>
      </table></div>
    </div>
  );
}
