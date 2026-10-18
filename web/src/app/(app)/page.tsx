import Link from "next/link";
import { and, eq, isNotNull, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can, CREW_ROLES } from "@/lib/permissions";
import { ON_HAND, PRIORITIES, ageLevel } from "@/lib/jobs";
import { labourRate, addDays, daysBetween, fmtDate, rm, today } from "@/lib/format";
import { activeStaff, coverPhotos, listJobs, type JobRow } from "@/lib/queries";
import JobBox from "@/components/JobBox";
import { getI18n } from "@/i18n/server";
import { placeLabel, type Locale, type T } from "@/i18n";
import { priLabel, roleLabel, statusLabel } from "@/i18n/labels";
import { requestsFor } from "@/lib/inventory";
import { Avatar, daysInStatus, dueInfo } from "@/components/ui";
import { purchasingAlerts } from "@/lib/alerts";
import { unitRef } from "@/lib/machine-types";
import { bayCodes, catColor, itemLabel } from "@/lib/lists";
import { dueServices } from "@/lib/services";

export async function generateMetadata() {
  return { title: (await getI18n()).t("nav.dashboard") };
}

const plate = (j: JobRow) => j.plateNo || j.serialNo || `${j.make} ${j.model}`;
const place = (j: JobRow, t: T) => j.siteType === "field" ? t("dash.field", { place: j.siteLocation.split(",")[0] }) : j.siteLocation ? placeLabel(t, j.siteLocation) : t("loc.tbd");

/** One job as a line: plate first (how the yard refers to machines), then where, who, and the one fact that matters for its list. */
function JobLine({ j, t, locale, children }: { j: JobRow; t: T; locale: Locale; children?: React.ReactNode }) {
  const due = dueInfo(j, t, locale);
  return (
    <Link href={`/jobs/${j.id}`} className="jl plain" style={{ ["--cat" as string]: catColor(j.category) }}>
      <div className="jl-id">
        <b className={j.plateNo ? "mono" : ""}>{plate(j)}</b>
        <small>{j.plateNo ? `${j.make} ${j.model} · ` : ""}{itemLabel(t, "job_category", j.category)}</small>
      </div>
      <div className="jl-where">
        <span className={!j.siteLocation ? "muted" : ""}>{place(j, t)}</span>
        <small className={j.leadName ? "" : "due over"}>{j.leadName ?? t("dash.unassigned")}</small>
      </div>
      <div className="jl-side">{children}{j.dueDate && <small className={`due ${due.cls}`}>{due.text}</small>}</div>
    </Link>
  );
}

function Section({ id, title, n, help, children, empty }: { id: string; title: string; n: number; help?: string; children: React.ReactNode; empty: string }) {
  return (
    <section className="panel" id={id}>
      <div className="panel-head"><h3>{title}</h3><span className="count">{n}</span></div>
      {help && n > 0 && <p className="hint" style={{ margin: 0, padding: "6px 14px 0" }}>{help}</p>}
      <div className="jl-list">{n ? children : <div className="empty">{empty}</div>}</div>
    </section>
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
  const byUrgency = (a: JobRow, b: JobRow) => PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
  const working = open.filter((j) => j.status === "in_progress").sort(byUrgency);
  const waitingParts = open.filter((j) => j.status === "awaiting_parts").sort((a, b) => +a.statusSince - +b.statusSince);
  // Not started: oldest first, so jobs left hanging come to the top.
  const notStarted = open.filter((j) => j.status === "received").sort((a, b) => a.openedAt.localeCompare(b.openedAt) || a.id - b.id);

  const [taskRows, openRequests, services, fu, purchasing] = await Promise.all([
    db.select({ jobId: schema.jobTasks.jobId, n: sql<number>`count(*)::int`, done: sql<number>`count(${schema.jobTasks.doneAt})::int` }).from(schema.jobTasks)
      .innerJoin(schema.jobs, eq(schema.jobTasks.jobId, schema.jobs.id)).where(sql`${schema.jobs.status} <> 'closed'`).groupBy(schema.jobTasks.jobId),
    requestsFor(undefined, true),
    dueServices(20, 30),
    db.select({ id: schema.jobs.id, jobNo: schema.jobs.jobNo, note: schema.jobs.followUp, date: schema.jobs.followUpDate }).from(schema.jobs)
      .where(and(isNotNull(schema.jobs.followUp), lte(schema.jobs.followUpDate, d))),
    purchasingAlerts(user, locale),
  ]);
  const tasks = new Map(taskRows.map((r) => [r.jobId, r]));
  const requested = (id: number) => openRequests.filter((r) => r.jobId === id).length;

  // Crew: who is free first (the Supervisor's next assignment), then who is on what.
  const crew = staff.filter((s) => CREW_ROLES.includes(s.role));
  const active = open.filter((j) => ["in_progress", "awaiting_parts"].includes(j.status)).sort(byUrgency);
  const crewState = crew.map((s) => {
    const j = active.find((x) => x.leadId === s.id || x.teamIds.includes(s.id));
    const k = j ? (j.siteType === "field" ? "field" : "on") : "idle";
    return { s, j, k, label: t(k === "field" ? "state.field" : k === "on" ? "state.on" : "state.idle") };
  }).sort((a, b) => Number(!!a.j) - Number(!!b.j));
  const busy = crewState.filter((c) => c.j).length;
  const wip = open.reduce((a, j) => a + (j.category === "WARR" ? 0 : j.labourHours * labourRate() + j.partsValue), 0);

  // Act now: short and urgent. Everything else goes to "Other reminders".
  const now: { sev: string; text: string; href: string }[] = [];
  const later: { sev: string; text: string; href: string }[] = [];
  open.filter((j) => j.priority === "critical" && !j.leadId).forEach((j) => now.push({ sev: "var(--crit)", text: t("att.emgUnassigned", { no: plate(j), machine: `${j.make} ${j.model}`, place: place(j, t) }), href: `/jobs/${j.id}` }));
  open.filter((j) => dueInfo(j, t, locale).cls === "over").forEach((j) => now.push({ sev: "var(--crit)", text: t("att.overdue", { no: plate(j), date: fmtDate(j.dueDate, false, locale) }), href: `/jobs/${j.id}` }));
  open.filter((j) => j.status !== "received" && ageLevel(j.status, daysInStatus(j.statusSince)) === "crit")
    .forEach((j) => now.push({ sev: "var(--warn)", text: t("att.stuck", { no: plate(j), n: daysInStatus(j.statusSince), status: statusLabel(t, j.status) }), href: `/jobs/${j.id}` }));
  for (const a of purchasing) (a.now ? now : later).push(a);
  fu.forEach((f) => later.push({ sev: "var(--info)", text: t("att.followUp", { no: f.jobNo, note: (f.note ?? "").slice(0, 80), date: fmtDate(f.date, false, locale) }), href: `/jobs/${f.id}#writeup` }));
  units.filter((u) => u.arrivedAt && daysBetween(u.arrivedAt, d) > 30).forEach((u) => later.push({ sev: "var(--warn)", text: t("att.longStay", { serial: unitRef(u), n: daysBetween(u.arrivedAt!, d) }), href: `/machinery/${u.id}` }));
  certs.filter((c) => c.expiry && daysBetween(d, c.expiry) < 45).forEach((c) => {
    const left = daysBetween(d, c.expiry!);
    later.push({ sev: left < 0 ? "var(--crit)" : "var(--warn)", text: t(left < 0 ? "att.certExpired" : "att.certExpires", { name: names.get(c.staffId) ?? "", cert: c.name, date: fmtDate(c.expiry, false, locale) }), href: `/team/${c.staffId}` });
  });
  const svcDue = services.filter((r) => r.s.nextDue! <= addDays(d, 14));
  const svcGroups = [
    { key: "dash.svcOverdue", rows: services.filter((r) => r.s.nextDue! < d) },
    { key: "dash.svcSoon", rows: services.filter((r) => r.s.nextDue! >= d && r.s.nextDue! <= addDays(d, 14)) },
    { key: "dash.svcLater", rows: services.filter((r) => r.s.nextDue! > addDays(d, 14)) },
  ] as const;
  const bays = [...new Set([...bayCodes(), ...open.filter((j) => j.siteType === "workshop" && j.siteLocation).map((j) => j.siteLocation)])];
  const Alerts = ({ list }: { list: typeof now }) => <>{list.map((a, i) => <Link key={i} href={a.href} className="attn plain" style={{ ["--sev" as string]: a.sev }}><i /><span>{a.text}</span></Link>)}</>;

  return (
    <div className="page today">
      <div className="view-head">
        <h2>{t("dash.title")} <span className="muted" style={{ fontFamily: "var(--f-body)", fontSize: ".9rem", fontWeight: 400 }}>{fmtDate(d, true, locale)}</span></h2>
        {can(user.role, "job.create") && <><Link className="btn primary" href="/jobs/new?emergency=1">{t("dash.emergency")}</Link><Link className="btn" href="/jobs/new">{t("dash.newJob")}</Link></>}
      </div>

      <nav className="sum" aria-label={t("dash.title")}>
        <a href="#working" className="plain"><b>{working.length}</b><span>{t("sum.working")}</span></a>
        <a href="#parts" className={`plain ${waitingParts.length ? "warn" : ""}`}><b>{waitingParts.length}</b><span>{t("sum.parts")}</span></a>
        <a href="#notstarted" className="plain"><b>{notStarted.length}</b><span>{t("sum.notStarted")}</span></a>
        <a href="#services" className={`plain ${svcDue.some((r) => r.s.nextDue! < d) ? "alert" : svcDue.length ? "warn" : ""}`}><b>{svcDue.length}</b><span>{t("sum.services")}</span></a>
        <a href="#crew" className="plain"><b>{crew.length - busy}</b><span>{t("sum.free")}</span></a>
        {can(user.role, "money.labourCost") && <div><b style={{ fontSize: "1.3rem" }}>{rm(wip).replace(".00", "")}</b><span>{t("kpi.labour")}</span></div>}
      </nav>

      {now.length > 0 && (
        <section className="panel actnow">
          <div className="panel-head"><h3>{t("dash.actNow")}</h3><span className="count">{now.length}</span></div>
          <div className="panel-body"><Alerts list={now.slice(0, 5)} />
            {now.length > 5 && <details><summary className="linkbtn" style={{ padding: "6px 14px" }}>{t("dash.showAll", { n: now.length })}</summary><Alerts list={now.slice(5)} /></details>}
          </div>
        </section>
      )}

      <div className="dash">
        <div className="stack" style={{ gap: 14 }}>
          <Section id="working" title={t("dash.working")} n={working.length} empty={t("dash.noneWorking")}>
            {working.map((j) => {
              const k = tasks.get(j.id);
              return (
                <JobLine key={j.id} j={j} t={t} locale={locale}>
                  {k ? <span className="prog" title={t("dash.tasks", { done: k.done, n: k.n })}><span className="track"><span style={{ width: `${(k.done / k.n) * 100}%` }} /></span><small>{t("dash.tasks", { done: k.done, n: k.n })}</small></span>
                    : <small className="muted">{t("dash.noTasks")}</small>}
                </JobLine>
              );
            })}
          </Section>
          <Section id="parts" title={t("dash.waitingParts")} n={waitingParts.length} empty={t("dash.noneWaiting")}>
            {waitingParts.map((j) => (
              <JobLine key={j.id} j={j} t={t} locale={locale}>
                <small className={ageLevel(j.status, daysInStatus(j.statusSince)) ? "due soon" : ""}>{t("dash.waitingDays", { n: daysInStatus(j.statusSince) })}</small>
                {requested(j.id) > 0 && <small className="muted">{t("dash.partsReq", { n: requested(j.id) })}</small>}
              </JobLine>
            ))}
          </Section>
          <Section id="notstarted" title={t("dash.notStarted")} n={notStarted.length} help={t("dash.notStartedHelp")} empty={t("dash.allStarted")}>
            {notStarted.map((j) => {
              const age = daysBetween(j.openedAt, d);
              return (
                <JobLine key={j.id} j={j} t={t} locale={locale}>
                  <small className={age >= 14 ? "due over" : age >= 5 ? "due soon" : "muted"}>{age === 0 ? t("dash.inToday") : t("dash.waitingDays", { n: age })}</small>
                  {j.priority !== "normal" && <small className={j.priority === "low" ? "muted" : "due over"}>{priLabel(t, j.priority)}</small>}
                </JobLine>
              );
            })}
          </Section>
        </div>

        <div className="rail">
          <section className="panel" id="services">
            <div className="panel-head"><h3>{t("dash.servicesSoon")}</h3><Link href="/machinery" className="muted" style={{ fontSize: ".8rem" }}>{t("nav.machinery")}</Link></div>
            <div className="panel-body">
              {svcGroups.filter((g) => g.rows.length).map((g) => (
                <div key={g.key}>
                  <div className={`svc-group ${g.key === "dash.svcOverdue" ? "over" : ""}`}>{t(g.key)}</div>
                  {g.rows.map((r) => (
                    <Link key={r.s.id} href={`/machinery/${r.s.unitId}#services`} className="svc-line plain">
                      <b className={r.plateNo ? "mono" : ""}>{r.plateNo || r.serialNo || `${r.make} ${r.model}`}</b>
                      <span>{itemLabel(t, "service_item", r.s.item)}</span>
                      <small className={r.s.nextDue! < d ? "due over" : r.s.nextDue! <= addDays(d, 14) ? "due soon" : "muted"}>{fmtDate(r.s.nextDue, false, locale)}</small>
                    </Link>
                  ))}
                </div>
              ))}
              {services.length === 0 && <div className="empty">{t("dash.noServices")}</div>}
            </div>
          </section>

          <section className="panel" id="crew">
            <div className="panel-head"><h3>{t("dash.crewToday")}</h3><span className="muted" style={{ fontSize: ".8rem" }}>{t("dash.onActive", { n: busy })}</span></div>
            <div className="panel-body">
              {crewState.map(({ s, j, k, label }) => (
                <Link key={s.id} href={j ? `/jobs/${j.id}` : `/team/${s.id}`} className="crew plain">
                  <Avatar name={s.name} /><div className="crew-info"><b>{s.name}</b><small>{j ? `${plate(j)} · ${place(j, t)}` : roleLabel(t, s.role)}</small></div><span className={`state ${k}`}>{label}</span>
                </Link>
              ))}
              {crew.length === 0 && <div className="empty">{t("dash.addCrew")}</div>}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h3>{t("dash.bays")}</h3></div>
            <div className="bays-mini">
              {bays.map((b) => {
                const j = open.find((x) => x.siteType === "workshop" && x.siteLocation === b);
                return j ? <Link key={b} href={`/jobs/${j.id}`} className="plain" style={{ ["--cat" as string]: catColor(j.category) }}><small>{placeLabel(t, b)}</small><b className={j.plateNo ? "mono" : ""}>{plate(j)}</b></Link>
                  : <div key={b} className="free"><small>{placeLabel(t, b)}</small><span>{t("dash.free")}</span></div>;
              })}
            </div>
          </section>

          {later.length > 0 && (
            <details className="panel">
              <summary className="panel-head"><h3>{t("dash.reminders")}</h3><span className="count">{later.length}</span></summary>
              <div className="panel-body"><Alerts list={later} /></div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
