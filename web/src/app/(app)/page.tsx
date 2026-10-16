import Link from "next/link";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can, CREW_ROLES, ROLE_LABEL } from "@/lib/permissions";
import { BAYS, CATEGORIES, PRIORITIES, STATUSES, STATUS_LABEL, ageLevel } from "@/lib/jobs";
import { LABOUR_RATE, addDays, daysBetween, fmtDate, rm, today } from "@/lib/format";
import { activeStaff, listJobs, type JobRow } from "@/lib/queries";
import { Avatar, JobCard, daysInStatus, dueInfo } from "@/components/ui";

export const metadata = { title: "Dashboard" };

function BayTile({ name, jobs, field }: { name: string; jobs: JobRow[]; field?: boolean }) {
  if (!jobs.length) return <div className="bay free"><span className="label">{name}</span><span className="muted">Free</span></div>;
  const j = jobs[0];
  return (
    <Link href={`/jobs/${j.id}`} className={`bay ${field ? "field" : ""}`} style={{ ["--cat" as string]: CATEGORIES[j.category].color }}>
      <span className="label">{name}</span><b>{j.make} {j.model}</b>
      <small>{j.jobNo.slice(-4)} · {STATUS_LABEL[j.status]}{jobs.length > 1 ? ` · +${jobs.length - 1} more` : ""}</small>
      <small>{j.leadName ?? <span className="due over">Unassigned</span>}</small>
    </Link>
  );
}

export default async function Dashboard() {
  const user = await requireUser();
  const all = can(user.role, "job.viewAll");
  const [open, staff, units, certs] = await Promise.all([
    listJobs(user, { open: true }),
    activeStaff(),
    all ? db.select({ id: schema.machineUnits.id, arrivedAt: schema.machineUnits.arrivedAt, serialNo: schema.machineUnits.serialNo }).from(schema.machineUnits) : Promise.resolve([]),
    all ? db.select({ staffId: schema.certifications.staffId, name: schema.certifications.name, expiry: schema.certifications.expiry }).from(schema.certifications) : Promise.resolve([]),
  ]);
  const names = new Map(staff.map((s) => [s.id, s.name]));
  const t = today();
  const emg = open.filter((j) => j.category === "EMG").length;
  const overdue = open.filter((j) => dueInfo(j).cls === "over");
  const dueWeek = open.filter((j) => j.dueDate >= t && j.dueDate <= addDays(t, 6) && j.status !== "ready_for_pickup").length;
  const sortJobs = (a: JobRow, b: JobRow) => PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) || a.dueDate.localeCompare(b.dueDate);

  // Crew today: who is on which active job (phase 3 adds a planned schedule).
  const crew = staff.filter((s) => CREW_ROLES.includes(s.role));
  const activeJobs = open.filter((j) => ["diagnosing", "in_progress", "quality_check"].includes(j.status)).sort(sortJobs);
  const crewState = crew.map((s) => {
    const j = activeJobs.find((x) => x.leadId === s.id || x.teamIds.includes(s.id));
    return { s, j, k: j ? (j.siteType === "field" ? "field" : "on") : "idle", t: j ? (j.siteType === "field" ? "In field" : "On job") : "Available" };
  });
  const busy = crewState.filter((c) => c.j).length;
  const wip = open.reduce((a, j) => a + (j.category === "WARR" ? 0 : j.labourHours * LABOUR_RATE), 0);

  const attention: { sev: string; text: React.ReactNode; href: string }[] = [];
  open.filter((j) => j.priority === "critical" && !j.leadId).forEach((j) => attention.push({ sev: "var(--crit)", text: <><b>{j.jobNo}</b> emergency not assigned: {j.make} {j.model} at {j.siteLocation}</>, href: `/jobs/${j.id}` }));
  overdue.forEach((j) => attention.push({ sev: "var(--crit)", text: <><b>{j.jobNo}</b> is past its due date ({fmtDate(j.dueDate)})</>, href: `/jobs/${j.id}` }));
  open.filter((j) => !["received", "awaiting_approval"].includes(j.status) && ageLevel(j.status, daysInStatus(j.statusSince)) === "crit")
    .forEach((j) => attention.push({ sev: "var(--warn)", text: <><b>{j.jobNo}</b> stuck {daysInStatus(j.statusSince)} days in {STATUS_LABEL[j.status]}</>, href: `/jobs/${j.id}` }));
  open.filter((j) => j.status === "awaiting_approval").forEach((j) => attention.push({ sev: "var(--warn)", text: <><b>{j.jobNo}</b> waiting {daysInStatus(j.statusSince)} days for customer approval</>, href: `/jobs/${j.id}` }));
  if (all) {
    units.filter((u) => u.arrivedAt && daysBetween(u.arrivedAt, t) > 30).forEach((u) => attention.push({ sev: "var(--warn)", text: <>Machine {u.serialNo} has been with us {daysBetween(u.arrivedAt!, t)} days</>, href: `/machinery/${u.id}` }));
    certs.filter((c) => c.expiry && daysBetween(t, c.expiry) < 45).forEach((c) => {
      const d = daysBetween(t, c.expiry!);
      attention.push({ sev: d < 0 ? "var(--crit)" : "var(--warn)", text: <>{names.get(c.staffId)}: {c.name} {d < 0 ? "expired" : "expires"} {fmtDate(c.expiry)}</>, href: `/team/${c.staffId}` });
    });
  }

  return (
    <div className="page">
      <div className="view-head">
        <h2>{all ? "Workshop today" : `My jobs · ${user.name}`} <span className="muted" style={{ fontFamily: "var(--f-body)", fontSize: ".9rem", fontWeight: 400 }}>{fmtDate(t, true)}</span></h2>
        {can(user.role, "job.create") && <><Link className="btn primary" href="/jobs/new?emergency=1">+ Emergency call-out</Link><Link className="btn" href="/jobs/new">+ New job</Link></>}
      </div>
      <div className="kpis">
        <div className="kpi"><b>{open.length}</b><span>Open jobs</span></div>
        <div className={`kpi ${emg ? "alert" : ""}`}><b>{emg}</b><span>Active emergencies</span></div>
        <div className={`kpi ${overdue.length ? "alert" : ""}`}><b>{overdue.length}</b><span>Overdue</span></div>
        <div className="kpi"><b>{dueWeek}</b><span>Due in next 7 days</span></div>
        {all && <div className="kpi"><b>{busy}/{crew.length}</b><span>Crew on active jobs</span></div>}
        {can(user.role, "money.selling") && <div className="kpi"><b style={{ fontSize: "1.45rem" }}>{rm(wip).replace(".00", "")}</b><span>Labour on open jobs</span></div>}
      </div>

      {all && (
        <div className="stack" style={{ gap: 8 }}>
          <div className="label">Workshop floor · bays, yard and field</div>
          <div className="floor">
            {BAYS.map((b) => <BayTile key={b} name={b} jobs={open.filter((j) => j.siteType === "workshop" && j.siteLocation === b)} />)}
            {open.filter((j) => j.siteType === "field").map((j) => <BayTile key={j.id} name={`Field · ${j.siteLocation.split(",")[0]}`} jobs={[j]} field />)}
          </div>
        </div>
      )}

      <div className="dash">
        <div className="stack" style={{ gap: 8 }}>
          <div className="label">Job board · click a job for details</div>
          <div className="board">
            {STATUSES.slice(0, 7).map((s) => {
              const list = open.filter((j) => j.status === s).sort(sortJobs);
              return <div key={s} className="col"><div className="col-head"><h3>{STATUS_LABEL[s]}</h3><span className="num">{list.length}</span></div>
                {list.map((j) => <JobCard key={j.id} j={j} names={names} />)}{list.length === 0 && <div className="empty-col">Nothing here</div>}</div>;
            })}
          </div>
        </div>
        <div className="rail">
          {all && (
            <div className="panel"><div className="panel-head"><h3>Crew today</h3><span className="muted" style={{ fontSize: ".8rem" }}>{busy} on active jobs</span></div><div className="panel-body">
              {crewState.map(({ s, j, k, t: label }) => (
                <Link key={s.id} href={j ? `/jobs/${j.id}` : `/team/${s.id}`} className="crew plain">
                  <Avatar name={s.name} /><div className="crew-info"><b>{s.name}</b><small>{ROLE_LABEL[s.role]}{j ? ` · ${j.jobNo.slice(-4)} ${j.model}` : ""}</small></div><span className={`state ${k}`}>{label}</span>
                </Link>
              ))}
              {crew.length === 0 && <div className="empty">Add your crew under Team.</div>}
            </div></div>
          )}
          <div className="panel"><div className="panel-head"><h3>Needs attention</h3><span className="muted" style={{ fontSize: ".8rem" }}>{attention.length}</span></div><div className="panel-body">
            {attention.map((a, i) => <Link key={i} href={a.href} className="attn plain" style={{ ["--sev" as string]: a.sev }}><i /><span>{a.text}</span></Link>)}
            {attention.length === 0 && <div className="attn"><span className="muted">All clear.</span></div>}
          </div></div>
        </div>
      </div>
    </div>
  );
}
