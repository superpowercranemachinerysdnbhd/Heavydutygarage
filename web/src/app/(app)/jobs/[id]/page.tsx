import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can, canWorkOnJob, CREW_ROLES, LEAD_ROLES } from "@/lib/permissions";
import { BAYS, CATEGORY_KEYS, CREW_STATUSES, PRIORITIES, STATUSES, qcMessageKey } from "@/lib/jobs";
import { LABOUR_RATE, fmtDate, fmtDateTime, rm, today } from "@/lib/format";
import { activeStaff, getJob } from "@/lib/queries";
import { getI18n } from "@/i18n/server";
import { placeLabel } from "@/i18n";
import { activityText, catLabel, priLabel, roleLabel, stageLabel, statusLabel } from "@/i18n/labels";
import { AgeText, Avatar, CatChip, Notice, Pri, dueInfo } from "@/components/ui";
import SignaturePad from "@/components/SignaturePad";
import SubmitButton from "@/components/SubmitButton";
import * as A from "../actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const j = await getJob(Number((await params).id));
  return { title: j ? `${j.job.jobNo} ${j.model.make} ${j.model.model}` : "—" };
}

const STAGES = ["before", "during", "after", "qc"] as const;
const subtle = { fontFamily: "var(--f-body)", fontSize: ".8rem", textTransform: "none", letterSpacing: 0 } as const;

export default async function JobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const user = await requireUser();
  const { t, locale } = await getI18n();
  const id = Number((await params).id);
  const sp = await searchParams;
  const d = Number.isInteger(id) ? await getJob(id) : null;
  if (!d) notFound();
  const { job, unit, model, customer, lead, team, tasks, qc, labour, photos, activity, parent } = d;
  const teamIds = team.map((m) => m.id);
  if (!canWorkOnJob(user, { leadId: job.leadId, teamIds })) notFound();

  const sup = can(user.role, "job.anyStatus");
  const open = job.status !== "closed";
  const idx = STATUSES.indexOf(job.status);
  const statusOptions = sup ? STATUSES.filter((s) => s !== job.status) : CREW_STATUSES.filter((s) => s !== job.status);
  const staffList = sup ? await activeStaff() : [];
  const crew = staffList.filter((s) => CREW_ROLES.includes(s.role));
  const hours = labour.reduce((a, l) => a + Number(l.hours), 0);
  const labourCost = labour.reduce((a, l) => a + Number(l.hours) * Number(l.payRate), 0);
  const charge = job.category === "WARR" ? 0 : hours * LABOUR_RATE;
  const qcDone = qc.filter((q) => q.passedAt).length;
  const due = dueInfo(job, t, locale);
  const hidden = (n: string, v: string | number) => <input type="hidden" name={n} value={v} />;
  const qcText = (q: (typeof qc)[number]) => (q.itemKey ? t(qcMessageKey(q.itemKey)) : q.item);

  return (
    <div className="page">
      <div className="crumbs"><Link href="/jobs">{t("nav.jobs")}</Link> / {job.jobNo}</div>
      <div className="job-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="mono">{job.jobNo} · {job.siteType === "field" ? t("job.fieldService") : t("job.workshop")} · {placeLabel(t, job.siteLocation)}</span>
          <h1>{model.make} {model.model}</h1>
          <span className="mono">{unit.serialNo} · {customer.name}</span>
        </div>
        {can(user.role, "job.report") && <Link className="btn small" href={`/jobs/${job.id}/report`}>{open ? t("job.interimReport") : t("job.report")}</Link>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <CatChip cat={job.category} t={t} /><Pri p={job.priority} t={t} /><span className={`due ${due.cls}`}>{due.text}</span><AgeText status={job.status} since={job.statusSince} t={t} />
        {parent && <span className="muted">{t("job.comebackOf")} <Link href={`/jobs/${parent.id}`}>{parent.jobNo}</Link></span>}
      </div>
      <Notice error={sp.error} ok={sp.ok} />
      <div className="steps">{STATUSES.map((s, i) => <div key={s} className={`step ${i < idx ? "done" : i === idx ? "cur" : ""}`}>{statusLabel(t, s)}</div>)}</div>
      {open && statusOptions.length > 0 && (
        <form action={A.setStatus} className="filters">
          {hidden("jobId", job.id)}
          <span className="label">{t("job.statusNow", { status: statusLabel(t, job.status) })}</span>
          <label className="label" htmlFor="to">{t("job.moveTo")}</label>
          <select className="field" id="to" name="to">{statusOptions.map((s) => <option key={s} value={s}>{statusLabel(t, s)}</option>)}</select>
          <SubmitButton className="btn small primary">{t("job.move")}</SubmitButton>
        </form>
      )}

      <div className="job-cols">
        <div className="stack">
          <section className="sect"><h3>{t("job.complaintDiag")}</h3><div className="in">
            <div><span className="label">{t("job.complaint")}{job.reportedBy ? ` · ${t("job.reportedBy", { name: job.reportedBy })}` : ""}</span><p style={{ margin: "2px 0 0" }}>{job.complaint}</p></div>
            <form action={A.saveDiagnosis} className="stack" style={{ gap: 6 }}>
              {hidden("jobId", job.id)}
              <label className="label" htmlFor="diagnosis">{t("job.diagnosis")}</label>
              <textarea id="diagnosis" name="diagnosis" rows={3} defaultValue={job.diagnosis} disabled={!open} placeholder={t("job.diagnosisPh")} />
              {open && <div><SubmitButton>{t("job.saveDiagnosis")}</SubmitButton></div>}
            </form>
          </div></section>

          <section className="sect"><h3>{t("job.tasks")} <span className="muted" style={subtle}>{t("job.done", { done: tasks.filter((x) => x.doneAt).length, total: tasks.length })}</span></h3><div className="in">
            {tasks.length === 0 && <span className="muted">{t("job.noTasks")}</span>}
            {tasks.map((x) => {
              const who = [lead, ...team].find((p) => p && p.id === x.assigneeId);
              return (
                <form key={x.id} action={A.toggleTask} className={`task ${x.doneAt ? "done" : ""}`}>
                  {hidden("jobId", job.id)}{hidden("taskId", x.id)}
                  <button className="tick" disabled={!open} aria-label={x.doneAt ? t("job.markNotDone", { task: x.description }) : t("job.markDone", { task: x.description })}>{x.doneAt ? "✓" : ""}</button>
                  <span>{x.description}</span><span className="who">{who && <Avatar name={who.name} />}</span>
                </form>
              );
            })}
            {open && (
              <form action={A.addTask} className="filters">
                {hidden("jobId", job.id)}
                <input type="text" name="description" placeholder={t("job.addTaskPh")} style={{ flex: "1 1 200px" }} required aria-label={t("job.addTaskPh")} />
                {sup && <select className="field" name="assigneeId" aria-label={t("job.assignTo")}><option value="">{t("common.anyone")}</option>{crew.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
                <SubmitButton>{t("job.addTask")}</SubmitButton>
              </form>
            )}
          </div></section>

          <section className="sect"><h3>{t("job.photos")} <span className="muted" style={subtle}>{photos.length}</span></h3><div className="in">
            {photos.length ? (
              <div className="photos">{photos.map((p) => (
                <figure key={p.id} className="photo"><a href={`/api/photos/${p.id}`} target="_blank" rel="noreferrer"><img src={`/api/photos/${p.id}`} alt={p.caption ?? stageLabel(t, p.stage)} loading="lazy" /></a>
                  <figcaption><span className="stage">{stageLabel(t, p.stage)}</span> {p.caption}</figcaption></figure>
              ))}</div>
            ) : <span className="muted">{t("job.noPhotos")}</span>}
            <form action={A.uploadPhotos} className="upload">
              {hidden("jobId", job.id)}
              <select className="field" name="stage" aria-label={t("job.photoStage")}>{STAGES.map((v) => <option key={v} value={v}>{stageLabel(t, v)}</option>)}</select>
              <input type="text" name="caption" placeholder={t("job.captionPh")} style={{ flex: "1 1 160px" }} aria-label={t("job.captionPh")} />
              <input type="file" name="photos" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" multiple required aria-label={t("job.photos")} />
              <SubmitButton className="btn small primary" pendingText={t("job.uploading")}>{t("job.upload")}</SubmitButton>
            </form>
          </div></section>

          <section className="sect"><h3>{t("job.labour")} <span className="muted" style={subtle}>{hours} h</span></h3><div className="in">
            {labour.length > 0 && (
              <div className="tbl-wrap"><table><thead><tr><th>{t("col.date")}</th><th>{t("col.person")}</th><th>{t("col.note")}</th><th className="r">{t("col.hours")}</th>{can(user.role, "money.labourCost") && <th className="r">{t("col.labourCost")}</th>}</tr></thead>
                <tbody>{labour.map((l) => <tr key={l.id}><td className="num">{fmtDate(l.workDate, false, locale)}</td><td>{l.name}</td><td>{l.note}</td><td className="r num">{Number(l.hours)}</td>{can(user.role, "money.labourCost") && <td className="r num">{rm(Number(l.hours) * Number(l.payRate))}</td>}</tr>)}</tbody></table></div>
            )}
            {open && (
              <form action={A.logLabour} className="filters">
                {hidden("jobId", job.id)}
                {sup ? <select className="field" name="staffId" aria-label={t("col.person")} defaultValue={job.leadId ?? undefined}>{crew.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select> : <span className="muted">{user.name}</span>}
                <input type="date" name="workDate" defaultValue={today()} max={today()} aria-label={t("col.date")} />
                <input type="number" name="hours" min="0.25" max="24" step="0.25" placeholder={t("col.hours")} style={{ width: 90 }} required aria-label={t("col.hours")} />
                <input type="text" name="note" placeholder={t("job.whatDone")} style={{ flex: "1 1 160px" }} aria-label={t("col.note")} />
                <SubmitButton>{t("job.logTime")}</SubmitButton>
              </form>
            )}
          </div></section>

          <section className="sect"><h3>{t("job.qc")} <span className="muted" style={subtle}>{qcDone}/{qc.length}</span></h3><div className="in">
            {qc.map((q) => (
              <form key={q.id} action={A.toggleQc} className={`task ${q.passedAt ? "done" : ""}`}>
                {hidden("jobId", job.id)}{hidden("qcId", q.id)}
                <button className="tick" disabled={!can(user.role, "job.qc") || job.status !== "quality_check"} aria-label={`${t("job.qc")}: ${qcText(q)}`}>{q.passedAt ? "✓" : ""}</button>
                <span>{qcText(q)}</span>
              </form>
            ))}
            <small className="muted">{job.status === "quality_check" ? t("job.qcHelpNow") : idx > STATUSES.indexOf("quality_check") ? t("job.qcPassed") : t("job.qcLater")}</small>
          </div></section>

          {(job.status === "ready_for_pickup" || job.signoffAt) && (
            <section className="sect"><h3>{t("job.handover")} {job.signoffAt && <span className="pill ok">{t("job.signed")}</span>}</h3>
              {job.signoffAt ? (
                <div className="facts">
                  <div><span className="label">{t("job.receivedBy")}</span><b>{job.signoffName}</b></div>
                  <div><span className="label">{t("job.hmOut")}</span><b className="hm">{job.signoffHourMeter?.toLocaleString()} h</b></div>
                  <div><span className="label">{t("job.signed")}</span><b>{fmtDateTime(job.signoffAt, locale)}</b></div>
                  <div style={{ gridColumn: "1/-1" }}><span className="label">{t("job.signature")}</span><img src={`/api/jobs/${job.id}/signature`} alt={t("job.signature")} style={{ maxWidth: 320, background: "#fff", border: "1px solid var(--line)", borderRadius: 4 }} /></div>
                </div>
              ) : can(user.role, "job.handover") ? (
                <form action={A.handover} className="in">
                  {hidden("jobId", job.id)}
                  <div className="form">
                    <label>{t("job.receivedByName")}<input type="text" name="name" defaultValue={customer.contactName ?? ""} required /></label>
                    <label>{t("job.hmOut")}<input type="number" name="hourMeter" defaultValue={unit.hourMeter} min={1} required /></label>
                  </div>
                  <span className="label">{t("job.signature")}</span>
                  <SignaturePad />
                  <div><SubmitButton className="btn primary">{t("job.confirmHandover")}</SubmitButton></div>
                </form>
              ) : <div className="in muted">{t("job.supHandover")}</div>}
            </section>
          )}

          <section className="sect"><h3>{t("job.activity")}</h3><div className="in">
            <form action={A.addNote} className="filters">
              {hidden("jobId", job.id)}
              <input type="text" name="text" placeholder={t("job.notePh")} style={{ flex: "1 1 220px" }} required aria-label={t("job.notePh")} />
              <SubmitButton>{t("job.post")}</SubmitButton>
            </form>
            <ul className="log">{activity.map((a) => <li key={a.id}><time>{fmtDateTime(a.createdAt, locale)}</time><span>{activityText(t, a)}</span></li>)}</ul>
          </div></section>
        </div>

        <aside className="stack">
          <section className="sect"><h3>{t("job.people")}</h3><div className="in">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {lead ? <span style={{ display: "flex", gap: 8, alignItems: "center" }}><Avatar name={lead.name} /> {lead.name} <span className="muted">{t("job.leadLabel")}</span></span> : <span className="due over">{t("job.noLead")}</span>}
              {team.map((m) => (
                <span key={m.id} style={{ display: "flex", gap: 8, alignItems: "center" }}><Avatar name={m.name} /> {m.name} <span className="muted">{roleLabel(t, m.role)}</span>
                  {sup && open && <form action={A.removeTeamMember} className="inline" style={{ marginLeft: "auto" }}>{hidden("jobId", job.id)}{hidden("staffId", m.id)}<button className="linkbtn muted" aria-label={`${t("common.remove")} ${m.name}`}>{t("common.remove")}</button></form>}
                </span>
              ))}
            </div>
            {sup && open && (<>
              <form action={A.assignLead} className="filters">
                {hidden("jobId", job.id)}
                <select className="field" name="leadId" defaultValue={job.leadId ?? ""} aria-label={t("job.leadLabel")} style={{ flex: 1 }}><option value="">{t("job.noLeadOpt")}</option>{staffList.filter((s) => LEAD_ROLES.includes(s.role)).map((s) => <option key={s.id} value={s.id}>{s.name} · {roleLabel(t, s.role)}</option>)}</select>
                <SubmitButton>{t("job.setLead")}</SubmitButton>
              </form>
              <form action={A.addTeamMember} className="filters">
                {hidden("jobId", job.id)}
                <select className="field" name="staffId" aria-label={t("job.addToTeam")} style={{ flex: 1 }}>{crew.filter((s) => s.id !== job.leadId && !teamIds.includes(s.id)).map((s) => <option key={s.id} value={s.id}>{s.name} · {roleLabel(t, s.role)}</option>)}</select>
                <SubmitButton>{t("common.add")}</SubmitButton>
              </form>
            </>)}
          </div></section>

          <section className="sect"><h3>{t("job.machineCustomer")}</h3><div className="facts">
            <div><span className="label">{t("job.model")}</span><b><Link href={`/machinery/${unit.id}`}>{model.make} {model.model}</Link> · {model.type}</b></div>
            <div><span className="label">{t("job.serial")}</span><b className="mono">{unit.serialNo}</b></div>
            <div><span className="label">{t("job.hmIn")}</span><b className="hm">{(job.hourMeterIn ?? unit.hourMeter).toLocaleString()} h</b></div>
            <div><span className="label">{t("job.customer")}</span><b>{customer.name}</b></div>
            <div><span className="label">{t("job.contact")}</span><b>{customer.contactName ?? "—"} · <span className="mono">{customer.phone ?? ""}</span></b></div>
            <div><span className="label">{t("job.openedDue")}</span><b>{fmtDate(job.openedAt, false, locale)} → {fmtDate(job.dueDate, false, locale)}</b></div>
          </div></section>

          {can(user.role, "money.selling") && (
            <section className="sect"><h3>{t("job.value")}</h3><div className="totals" style={{ borderTop: 0 }}>
              <span>{t("job.labourCharge", { h: hours, rate: rm(LABOUR_RATE) })}{job.category === "WARR" ? t("job.warrantyNoCharge") : ""}</span><b>{rm(charge)}</b>
              <span className="muted">{t("job.parts")}</span><b className="muted">{t("job.phase2")}</b>
              {can(user.role, "money.labourCost") && (<>
                <span className="muted">{t("job.labourCostPay")}</span><b className="muted">{rm(labourCost)}</b>
                <span><b>{t("job.margin")}</b></span><b>{rm(charge - labourCost)}</b>
              </>)}
            </div></section>
          )}

          {can(user.role, "job.editDetails") && open && (
            <details className="sect"><summary style={{ padding: "10px 14px", cursor: "pointer", fontFamily: "var(--f-display)", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600 }}>{t("job.editDetails")}</summary>
              <form action={A.updateDetails} className="in form" style={{ gridTemplateColumns: "1fr" }}>
                {hidden("jobId", job.id)}
                <label>{t("f.category")}<select className="field" name="category" defaultValue={job.category}>{CATEGORY_KEYS.map((k) => <option key={k} value={k}>{catLabel(t, k)}</option>)}</select></label>
                <label>{t("f.priority")}<select className="field" name="priority" defaultValue={job.priority}>{PRIORITIES.map((p) => <option key={p} value={p}>{priLabel(t, p)}</option>)}</select></label>
                <label>{t("f.due")}<input type="date" name="dueDate" defaultValue={job.dueDate} required /></label>
                <label>{t("f.location")}<select className="field" name="siteType" defaultValue={job.siteType}><option value="workshop">{t("f.workshop")}</option><option value="field">{t("f.fieldSite")}</option></select></label>
                <label>{t("job.bayWorkshop")}<select className="field" name="bay" defaultValue={job.siteType === "workshop" ? job.siteLocation : BAYS[0]}>{BAYS.map((b) => <option key={b} value={b}>{placeLabel(t, b)}</option>)}</select></label>
                <label>{t("job.siteField")}<input type="text" name="siteAddress" defaultValue={job.siteType === "field" ? job.siteLocation : ""} /></label>
                <label>{t("f.complaint")}<textarea name="complaint" rows={3} defaultValue={job.complaint} /></label>
                <div><SubmitButton className="btn small primary">{t("job.saveDetails")}</SubmitButton></div>
              </form>
            </details>
          )}
        </aside>
      </div>
    </div>
  );
}
