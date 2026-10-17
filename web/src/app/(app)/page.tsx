import Link from "next/link";
import { and, isNotNull, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can, CREW_ROLES } from "@/lib/permissions";
import { ON_HAND, PRIORITIES, STATUSES, ageLevel } from "@/lib/jobs";
import { labourRate, addDays, daysBetween, fmtDate, rm, today } from "@/lib/format";
import { activeStaff, coverPhotos, listJobs, type JobRow } from "@/lib/queries";
import JobBox from "@/components/JobBox";
import { getI18n } from "@/i18n/server";
import { placeLabel, type T } from "@/i18n";
import { roleLabel, statusLabel } from "@/i18n/labels";
import { Avatar, JobCard, daysInStatus, dueInfo } from "@/components/ui";
import { purchasingAlerts } from "@/lib/alerts";
import { unitRef } from "@/lib/machine-types";
import { bayCodes, catColor, itemLabel } from "@/lib/lists";
import { dueServices } from "@/lib/services";

export async function generateMetadata() {
  return { title: (await getI18n()).t("nav.dashboard") };
}

function BayTile({ name, jobs, field, t }: { name: string; jobs: JobRow[]; field?: boolean; t: T }) {
  if (!jobs.length) return <div className="bay free"><span className="label">{name}</span><span className="muted">{t("dash.free")}</span></div>;
  const j = jobs[0];
  return (
    <Link href={`/jobs/${j.id}`} className={`bay ${field ? "field" : ""}`} style={{ ["--cat" as string]: catColor(j.category) }}>
      <span className="label">{name}</span><b className={j.plateNo ? "mono" : ""}>{j.plateNo || `${j.make} ${j.model}`}</b>
      <small>{j.jobNo.slice(-4)} · {statusLabel(t, j.status)}{jobs.length > 1 ? ` · ${t("dash.more", { n: jobs.length - 1 })}` : ""}</small>
      <small>{j.leadName ?? <span className="due over">{t("dash.unassigned")}</span>}</small>
    </Link>
  );
}

export default async function Dashboard() {
  const user = await requireUser();
  const { t, locale } = await getI18n();
  const all = can(user.role, "job.viewAll");
  const [open, staff, units, certs] = await Promise.all([
    listJobs(user, { open: true }),
    activeStaff(),
    all ? db.select({ id: schema.machineUnits.id, arrivedAt: schema.machineUnits.arrivedAt, serialNo: schema.machineUnits.serialNo, plateNo: schema.machineUnits.plateNo }).from(schema.machineUnits) : Promise.resolve([]),
    all ? db.select({ staffId: schema.certifications.staffId, name: schema.certifications.name, expiry: schema.certifications.expiry }).from(schema.certifications) : Promise.resolve([]),
  ]);
  // Crew: only the jobs on hand, as boxes, most urgent first.
  if (!all) {
    const mine = open.filter((j) => ON_HAND.includes(j.status))
      .sort((a, b) => PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
    const covers = await coverPhotos(mine.map((j) => j.id));
    return (
      <div className="page">
        <div className="view-head"><h2>{t("dash.myJobs", { name: user.name })} <span className="muted" style={{ fontFamily: "var(--f-body)", fontSize: ".9rem", fontWeight: 400 }}>{fmtDate(today(), true, locale)}</span></h2></div>
        <p className="muted" style={{ margin: 0 }}>{t("dash.onHand", { n: mine.length })}</p>
        <div className="jgrid">{mine.map((j) => <JobBox key={j.id} j={j} cover={covers.get(j.id)} t={t} locale={locale} />)}</div>
        {mine.length === 0 && <div className="panel empty">{t("dash.noneOnHand")}</div>}
      </div>
    );
  }
  const names = new Map(staff.map((s) => [s.id, s.name]));
  const d = today();
  const emg = open.filter((j) => j.category === "EMG").length;
  const overdue = open.filter((j) => dueInfo(j, t, locale).cls === "over");
  const dueWeek = open.filter((j) => j.dueDate && j.dueDate >= d && j.dueDate <= addDays(d, 6)).length;
  const sortJobs = (a: JobRow, b: JobRow) => PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");

  // Crew today: who is on which active job (phase 3 adds a planned schedule).
  const crew = staff.filter((s) => CREW_ROLES.includes(s.role));
  const activeJobs = open.filter((j) => ["in_progress", "awaiting_parts"].includes(j.status)).sort(sortJobs);
  const crewState = crew.map((s) => {
    const j = activeJobs.find((x) => x.leadId === s.id || x.teamIds.includes(s.id));
    const k = j ? (j.siteType === "field" ? "field" : "on") : "idle";
    return { s, j, k, label: t(k === "field" ? "state.field" : k === "on" ? "state.on" : "state.idle") };
  });
  const busy = crewState.filter((c) => c.j).length;
  const wip = open.reduce((a, j) => a + (j.category === "WARR" ? 0 : j.labourHours * labourRate() + j.partsValue), 0);

  const attention: { sev: string; text: string; href: string }[] = [];
  open.filter((j) => j.priority === "critical" && !j.leadId).forEach((j) => attention.push({ sev: "var(--crit)", text: t("att.emgUnassigned", { no: j.jobNo, machine: `${j.make} ${j.model}`, place: placeLabel(t, j.siteLocation) }), href: `/jobs/${j.id}` }));
  overdue.forEach((j) => attention.push({ sev: "var(--crit)", text: t("att.overdue", { no: j.jobNo, date: fmtDate(j.dueDate, false, locale) }), href: `/jobs/${j.id}` }));
  open.filter((j) => j.status !== "received" && ageLevel(j.status, daysInStatus(j.statusSince)) === "crit")
    .forEach((j) => attention.push({ sev: "var(--warn)", text: t("att.stuck", { no: j.jobNo, n: daysInStatus(j.statusSince), status: statusLabel(t, j.status) }), href: `/jobs/${j.id}` }));
  if (all) {
    units.filter((u) => u.arrivedAt && daysBetween(u.arrivedAt, d) > 30).forEach((u) => attention.push({ sev: "var(--warn)", text: t("att.longStay", { serial: unitRef(u), n: daysBetween(u.arrivedAt!, d) }), href: `/machinery/${u.id}` }));
    certs.filter((c) => c.expiry && daysBetween(d, c.expiry) < 45).forEach((c) => {
      const left = daysBetween(d, c.expiry!);
      attention.push({ sev: left < 0 ? "var(--crit)" : "var(--warn)", text: t(left < 0 ? "att.certExpired" : "att.certExpires", { name: names.get(c.staffId) ?? "", cert: c.name, date: fmtDate(c.expiry, false, locale) }), href: `/team/${c.staffId}` });
    });
  }

  if (all) {
    // Follow-ups that are due (open or completed jobs), set in each job's write-up.
    const fu = await db.select({ id: schema.jobs.id, jobNo: schema.jobs.jobNo, note: schema.jobs.followUp, date: schema.jobs.followUpDate }).from(schema.jobs)
      .where(and(isNotNull(schema.jobs.followUp), lte(schema.jobs.followUpDate, d)));
    fu.forEach((f) => attention.push({ sev: "var(--info)", text: t("att.followUp", { no: f.jobNo, note: (f.note ?? "").slice(0, 80), date: fmtDate(f.date, false, locale) }), href: `/jobs/${f.id}#writeup` }));
  }
  if (all) {
    // Machine services overdue or due within two weeks (from each machine's service schedule).
    for (const r of await dueServices()) {
      const overdueSvc = r.s.nextDue! < d;
      attention.push({ sev: overdueSvc ? "var(--crit)" : "var(--warn)", href: `/machinery/${r.s.unitId}#services`,
        text: t(overdueSvc ? "att.serviceOverdue" : "att.serviceDue", { machine: r.plateNo || `${r.make} ${r.model}`, service: itemLabel(t, "service_item", r.s.item), date: fmtDate(r.s.nextDue, false, locale) }) });
    }
  }
  attention.push(...(await purchasingAlerts(user, locale)));

  return (
    <div className="page">
      <div className="view-head">
        <h2>{all ? t("dash.title") : t("dash.myJobs", { name: user.name })} <span className="muted" style={{ fontFamily: "var(--f-body)", fontSize: ".9rem", fontWeight: 400 }}>{fmtDate(d, true, locale)}</span></h2>
        {can(user.role, "job.create") && <><Link className="btn primary" href="/jobs/new?emergency=1">{t("dash.emergency")}</Link><Link className="btn" href="/jobs/new">{t("dash.newJob")}</Link></>}
      </div>
      <div className="kpis">
        <div className="kpi"><b>{open.length}</b><span>{t("kpi.open")}</span></div>
        <div className={`kpi ${emg ? "alert" : ""}`}><b>{emg}</b><span>{t("kpi.emg")}</span></div>
        <div className={`kpi ${overdue.length ? "alert" : ""}`}><b>{overdue.length}</b><span>{t("kpi.overdue")}</span></div>
        <div className="kpi"><b>{dueWeek}</b><span>{t("kpi.dueWeek")}</span></div>
        {all && <div className="kpi"><b>{busy}/{crew.length}</b><span>{t("kpi.crew")}</span></div>}
        {can(user.role, "money.labourCost") && <div className="kpi"><b style={{ fontSize: "1.45rem" }}>{rm(wip).replace(".00", "")}</b><span>{t("kpi.labour")}</span></div>}
      </div>

      {all && (
        <div className="stack" style={{ gap: 8 }}>
          <div className="label">{t("dash.floor")}</div>
          <div className="floor">
            {[...new Set([...bayCodes(), ...open.filter((j) => j.siteType === "workshop" && j.siteLocation).map((j) => j.siteLocation)])].map((b) => <BayTile key={b} t={t} name={placeLabel(t, b)} jobs={open.filter((j) => j.siteType === "workshop" && j.siteLocation === b)} />)}
            {open.filter((j) => j.siteType === "field").map((j) => <BayTile key={j.id} t={t} name={t("dash.field", { place: j.siteLocation.split(",")[0] })} jobs={[j]} field />)}
          </div>
        </div>
      )}

      <div className="dash">
        <div className="stack" style={{ gap: 8 }}>
          <div className="label">{t("dash.board")}</div>
          <div className="board">
            {STATUSES.slice(0, 3).map((s) => {
              const list = open.filter((j) => j.status === s).sort(sortJobs);
              return <div key={s} className="col"><div className="col-head"><h3>{statusLabel(t, s)}</h3><span className="num">{list.length}</span></div>
                {list.map((j) => <JobCard key={j.id} j={j} names={names} t={t} locale={locale} />)}{list.length === 0 && <div className="empty-col">{t("dash.nothing")}</div>}</div>;
            })}
          </div>
        </div>
        <div className="rail">
          {all && (
            <div className="panel"><div className="panel-head"><h3>{t("dash.crewToday")}</h3><span className="muted" style={{ fontSize: ".8rem" }}>{t("dash.onActive", { n: busy })}</span></div><div className="panel-body">
              {crewState.map(({ s, j, k, label }) => (
                <Link key={s.id} href={j ? `/jobs/${j.id}` : `/team/${s.id}`} className="crew plain">
                  <Avatar name={s.name} /><div className="crew-info"><b>{s.name}</b><small>{roleLabel(t, s.role)}{j ? ` · ${j.jobNo.slice(-4)} ${j.plateNo || j.model}` : ""}</small></div><span className={`state ${k}`}>{label}</span>
                </Link>
              ))}
              {crew.length === 0 && <div className="empty">{t("dash.addCrew")}</div>}
            </div></div>
          )}
          <div className="panel"><div className="panel-head"><h3>{t("dash.attention")}</h3><span className="muted" style={{ fontSize: ".8rem" }}>{attention.length}</span></div><div className="panel-body">
            {attention.map((a, i) => <Link key={i} href={a.href} className="attn plain" style={{ ["--sev" as string]: a.sev }}><i /><span>{a.text}</span></Link>)}
            {attention.length === 0 && <div className="attn"><span className="muted">{t("common.allClear")}</span></div>}
          </div></div>
        </div>
      </div>
    </div>
  );
}
