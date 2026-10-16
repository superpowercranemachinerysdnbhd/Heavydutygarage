import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can, canWorkOnJob, CREW_ROLES, LEAD_ROLES, ROLE_LABEL } from "@/lib/permissions";
import { BAYS, CATEGORIES, CATEGORY_KEYS, CREW_STATUSES, PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL } from "@/lib/jobs";
import { LABOUR_RATE, fmtDate, fmtDateTime, rm, today } from "@/lib/format";
import { activeStaff, getJob } from "@/lib/queries";
import { AgeText, Avatar, CatChip, Notice, Pri, dueInfo } from "@/components/ui";
import SignaturePad from "@/components/SignaturePad";
import SubmitButton from "@/components/SubmitButton";
import * as A from "../actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const j = await getJob(Number((await params).id));
  return { title: j ? `${j.job.jobNo} ${j.model.make} ${j.model.model}` : "Job" };
}

const STAGES = [["before", "Before"], ["during", "During"], ["after", "After"], ["qc", "QC"]] as const;

export default async function JobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  const sp = await searchParams;
  const d = Number.isInteger(id) ? await getJob(id) : null;
  if (!d) notFound();
  const { job, unit, model, customer, lead, team, tasks, qc, labour, photos, activity, parent } = d;
  const teamIds = team.map((t) => t.id);
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
  const due = dueInfo(job);
  const hidden = (n: string, v: string | number) => <input type="hidden" name={n} value={v} />;

  return (
    <div className="page">
      <div className="crumbs"><Link href="/jobs">Jobs</Link> / {job.jobNo}</div>
      <div className="job-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="mono">{job.jobNo} · {job.siteType === "field" ? "Field service" : "Workshop"} · {job.siteLocation}</span>
          <h1>{model.make} {model.model}</h1>
          <span className="mono">{unit.serialNo} · {customer.name}</span>
        </div>
        {can(user.role, "job.report") && <Link className="btn small" href={`/jobs/${job.id}/report`}>{open ? "Interim service report" : "Service report"}</Link>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <CatChip cat={job.category} /><Pri p={job.priority} /><span className={`due ${due.cls}`}>{due.text}</span><AgeText status={job.status} since={job.statusSince} />
        {parent && <span className="muted">Comeback of <Link href={`/jobs/${parent.id}`}>{parent.jobNo}</Link></span>}
      </div>
      <Notice error={sp.error} ok={sp.ok} />
      <div className="steps">{STATUSES.map((s, i) => <div key={s} className={`step ${i < idx ? "done" : i === idx ? "cur" : ""}`}>{STATUS_LABEL[s]}</div>)}</div>
      {open && statusOptions.length > 0 && (
        <form action={A.setStatus} className="filters">
          {hidden("jobId", job.id)}
          <span className="label">Status: {STATUS_LABEL[job.status]}</span>
          <label className="label" htmlFor="to">Move to</label>
          <select className="field" id="to" name="to">{statusOptions.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>
          <SubmitButton className="btn small primary">Move</SubmitButton>
        </form>
      )}

      <div className="job-cols">
        <div className="stack">
          <section className="sect"><h3>Complaint &amp; diagnosis</h3><div className="in">
            <div><span className="label">Customer complaint{job.reportedBy ? ` · reported by ${job.reportedBy}` : ""}</span><p style={{ margin: "2px 0 0" }}>{job.complaint}</p></div>
            <form action={A.saveDiagnosis} className="stack" style={{ gap: 6 }}>
              {hidden("jobId", job.id)}
              <label className="label" htmlFor="diagnosis">Diagnosis / findings</label>
              <textarea id="diagnosis" name="diagnosis" rows={3} defaultValue={job.diagnosis} disabled={!open} placeholder="Fault found, readings, fault codes" />
              {open && <div><SubmitButton>Save diagnosis</SubmitButton></div>}
            </form>
          </div></section>

          <section className="sect"><h3>Tasks <span className="muted" style={{ fontFamily: "var(--f-body)", fontSize: ".8rem", textTransform: "none", letterSpacing: 0 }}>{tasks.filter((t) => t.doneAt).length}/{tasks.length} done</span></h3><div className="in">
            {tasks.length === 0 && <span className="muted">No tasks yet. Break the work into steps so everyone can tick them off.</span>}
            {tasks.map((t) => {
              const who = [lead, ...team].find((p) => p && p.id === t.assigneeId);
              return (
                <form key={t.id} action={A.toggleTask} className={`task ${t.doneAt ? "done" : ""}`}>
                  {hidden("jobId", job.id)}{hidden("taskId", t.id)}
                  <button className="tick" disabled={!open} aria-label={t.doneAt ? `Mark "${t.description}" not done` : `Mark "${t.description}" done`}>{t.doneAt ? "✓" : ""}</button>
                  <span>{t.description}</span><span className="who">{who && <Avatar name={who.name} />}</span>
                </form>
              );
            })}
            {open && (
              <form action={A.addTask} className="filters">
                {hidden("jobId", job.id)}
                <input type="text" name="description" placeholder="Add a task" style={{ flex: "1 1 200px" }} required aria-label="Task description" />
                {sup && <select className="field" name="assigneeId" aria-label="Assign to"><option value="">Anyone</option>{crew.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
                <SubmitButton>Add task</SubmitButton>
              </form>
            )}
          </div></section>

          <section className="sect"><h3>Photos <span className="muted" style={{ fontFamily: "var(--f-body)", fontSize: ".8rem", textTransform: "none", letterSpacing: 0 }}>{photos.length}</span></h3><div className="in">
            {photos.length ? (
              <div className="photos">{photos.map((p) => (
                <figure key={p.id} className="photo"><a href={`/api/photos/${p.id}`} target="_blank" rel="noreferrer"><img src={`/api/photos/${p.id}`} alt={p.caption ?? p.stage} loading="lazy" /></a>
                  <figcaption><span className="stage">{p.stage}</span> {p.caption}</figcaption></figure>
              ))}</div>
            ) : <span className="muted">No photos yet. Take before, during and after photos for the customer report.</span>}
            <form action={A.uploadPhotos} className="upload">
              {hidden("jobId", job.id)}
              <select className="field" name="stage" aria-label="Photo stage">{STAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <input type="text" name="caption" placeholder="Caption (optional)" style={{ flex: "1 1 160px" }} aria-label="Caption" />
              <input type="file" name="photos" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" multiple required aria-label="Photos" />
              <SubmitButton className="btn small primary" pendingText="Uploading…">Upload</SubmitButton>
            </form>
          </div></section>

          <section className="sect"><h3>Labour <span className="muted" style={{ fontFamily: "var(--f-body)", fontSize: ".8rem", textTransform: "none", letterSpacing: 0 }}>{hours} h</span></h3><div className="in">
            {labour.length > 0 && (
              <div className="tbl-wrap"><table><thead><tr><th>Date</th><th>Person</th><th>Note</th><th className="r">Hours</th>{can(user.role, "money.labourCost") && <th className="r">Labour cost</th>}</tr></thead>
                <tbody>{labour.map((l) => <tr key={l.id}><td className="num">{fmtDate(l.workDate)}</td><td>{l.name}</td><td>{l.note}</td><td className="r num">{Number(l.hours)}</td>{can(user.role, "money.labourCost") && <td className="r num">{rm(Number(l.hours) * Number(l.payRate))}</td>}</tr>)}</tbody></table></div>
            )}
            {open && (
              <form action={A.logLabour} className="filters">
                {hidden("jobId", job.id)}
                {sup ? <select className="field" name="staffId" aria-label="Person" defaultValue={job.leadId ?? undefined}>{crew.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select> : <span className="muted">{user.name}</span>}
                <input type="date" name="workDate" defaultValue={today()} max={today()} aria-label="Date" />
                <input type="number" name="hours" min="0.25" max="24" step="0.25" placeholder="Hours" style={{ width: 90 }} required aria-label="Hours" />
                <input type="text" name="note" placeholder="What was done (optional)" style={{ flex: "1 1 160px" }} aria-label="Note" />
                <SubmitButton>Log time</SubmitButton>
              </form>
            )}
          </div></section>

          <section className="sect"><h3>Quality check <span className="muted" style={{ fontFamily: "var(--f-body)", fontSize: ".8rem", textTransform: "none", letterSpacing: 0 }}>{qcDone}/{qc.length}</span></h3><div className="in">
            {qc.map((q) => (
              <form key={q.id} action={A.toggleQc} className={`task ${q.passedAt ? "done" : ""}`}>
                {hidden("jobId", job.id)}{hidden("qcId", q.id)}
                <button className="tick" disabled={!can(user.role, "job.qc") || job.status !== "quality_check"} aria-label={`QC: ${q.item}`}>{q.passedAt ? "✓" : ""}</button>
                <span>{q.item}</span>
              </form>
            ))}
            <small className="muted">{job.status === "quality_check" ? "The supervisor ticks every item before the machine can be released." : idx > STATUSES.indexOf("quality_check") ? "QC passed." : "Opens when the job reaches Quality Check."}</small>
          </div></section>

          {(job.status === "ready_for_pickup" || job.signoffAt) && (
            <section className="sect"><h3>Handover &amp; customer sign-off {job.signoffAt && <span className="pill ok">Signed</span>}</h3>
              {job.signoffAt ? (
                <div className="facts">
                  <div><span className="label">Received by</span><b>{job.signoffName}</b></div>
                  <div><span className="label">Hour meter out</span><b className="hm">{job.signoffHourMeter?.toLocaleString()} h</b></div>
                  <div><span className="label">Signed</span><b>{fmtDateTime(job.signoffAt)}</b></div>
                  <div style={{ gridColumn: "1/-1" }}><span className="label">Customer signature</span><img className="sigimg" src={`/api/jobs/${job.id}/signature`} alt="Customer signature" style={{ maxWidth: 320, background: "#fff", border: "1px solid var(--line)", borderRadius: 4 }} /></div>
                </div>
              ) : can(user.role, "job.handover") ? (
                <form action={A.handover} className="in">
                  {hidden("jobId", job.id)}
                  <div className="form">
                    <label>Received by (customer name)<input type="text" name="name" defaultValue={customer.contactName ?? ""} required /></label>
                    <label>Hour meter out<input type="number" name="hourMeter" defaultValue={unit.hourMeter} min={1} required /></label>
                  </div>
                  <span className="label">Customer signature</span>
                  <SignaturePad />
                  <div><SubmitButton className="btn primary">Confirm handover &amp; close job</SubmitButton></div>
                </form>
              ) : <div className="in muted">The supervisor records the handover when the customer collects.</div>}
            </section>
          )}

          <section className="sect"><h3>Activity</h3><div className="in">
            <form action={A.addNote} className="filters">
              {hidden("jobId", job.id)}
              <input type="text" name="text" placeholder="Add a note or update (no prices)" style={{ flex: "1 1 220px" }} required aria-label="Note" />
              <SubmitButton>Post</SubmitButton>
            </form>
            <ul className="log">{activity.map((a) => <li key={a.id}><time>{fmtDateTime(a.createdAt)}</time><span>{a.text}</span></li>)}</ul>
          </div></section>
        </div>

        <aside className="stack">
          <section className="sect"><h3>People</h3><div className="in">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {lead ? <span style={{ display: "flex", gap: 8, alignItems: "center" }}><Avatar name={lead.name} /> {lead.name} <span className="muted">Lead</span></span> : <span className="due over">No lead assigned</span>}
              {team.map((t) => (
                <span key={t.id} style={{ display: "flex", gap: 8, alignItems: "center" }}><Avatar name={t.name} /> {t.name} <span className="muted">{ROLE_LABEL[t.role]}</span>
                  {sup && open && <form action={A.removeTeamMember} className="inline" style={{ marginLeft: "auto" }}>{hidden("jobId", job.id)}{hidden("staffId", t.id)}<button className="linkbtn muted" aria-label={`Remove ${t.name}`}>Remove</button></form>}
                </span>
              ))}
            </div>
            {sup && open && (<>
              <form action={A.assignLead} className="filters">
                {hidden("jobId", job.id)}
                <select className="field" name="leadId" defaultValue={job.leadId ?? ""} aria-label="Lead" style={{ flex: 1 }}><option value="">No lead</option>{staffList.filter((s) => LEAD_ROLES.includes(s.role)).map((s) => <option key={s.id} value={s.id}>{s.name} · {ROLE_LABEL[s.role]}</option>)}</select>
                <SubmitButton>Set lead</SubmitButton>
              </form>
              <form action={A.addTeamMember} className="filters">
                {hidden("jobId", job.id)}
                <select className="field" name="staffId" aria-label="Add to team" style={{ flex: 1 }}>{crew.filter((s) => s.id !== job.leadId && !teamIds.includes(s.id)).map((s) => <option key={s.id} value={s.id}>{s.name} · {ROLE_LABEL[s.role]}</option>)}</select>
                <SubmitButton>Add</SubmitButton>
              </form>
            </>)}
          </div></section>

          <section className="sect"><h3>Machine &amp; customer</h3><div className="facts">
            <div><span className="label">Model</span><b><Link href={`/machinery/${unit.id}`}>{model.make} {model.model}</Link> · {model.type}</b></div>
            <div><span className="label">Serial no.</span><b className="mono">{unit.serialNo}</b></div>
            <div><span className="label">Hour meter in</span><b className="hm">{(job.hourMeterIn ?? unit.hourMeter).toLocaleString()} h</b></div>
            <div><span className="label">Customer</span><b>{customer.name}</b></div>
            <div><span className="label">Contact</span><b>{customer.contactName ?? "—"} · <span className="mono">{customer.phone ?? ""}</span></b></div>
            <div><span className="label">Opened / due</span><b>{fmtDate(job.openedAt)} → {fmtDate(job.dueDate)}</b></div>
          </div></section>

          {can(user.role, "money.selling") && (
            <section className="sect"><h3>Job value</h3><div className="totals" style={{ borderTop: 0 }}>
              <span>Labour {hours} h × {rm(LABOUR_RATE)}{job.category === "WARR" ? " (warranty, not charged)" : ""}</span><b>{rm(charge)}</b>
              <span className="muted">Parts</span><b className="muted">Phase 2</b>
              {can(user.role, "money.labourCost") && (<>
                <span className="muted">Labour cost (pay rates)</span><b className="muted">{rm(labourCost)}</b>
                <span><b>Gross margin on labour</b></span><b>{rm(charge - labourCost)}</b>
              </>)}
            </div></section>
          )}

          {can(user.role, "job.editDetails") && open && (
            <details className="sect"><summary style={{ padding: "10px 14px", cursor: "pointer", fontFamily: "var(--f-display)", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600 }}>Edit job details</summary>
              <form action={A.updateDetails} className="in form" style={{ gridTemplateColumns: "1fr" }}>
                {hidden("jobId", job.id)}
                <label>Category<select className="field" name="category" defaultValue={job.category}>{CATEGORY_KEYS.map((k) => <option key={k} value={k}>{CATEGORIES[k].name}</option>)}</select></label>
                <label>Priority<select className="field" name="priority" defaultValue={job.priority}>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</select></label>
                <label>Target due date<input type="date" name="dueDate" defaultValue={job.dueDate} required /></label>
                <label>Service location<select className="field" name="siteType" defaultValue={job.siteType}><option value="workshop">Workshop</option><option value="field">Field (customer site)</option></select></label>
                <label>Bay (workshop jobs)<select className="field" name="bay" defaultValue={job.siteType === "workshop" ? job.siteLocation : BAYS[0]}>{BAYS.map((b) => <option key={b}>{b}</option>)}</select></label>
                <label>Site address (field jobs)<input type="text" name="siteAddress" defaultValue={job.siteType === "field" ? job.siteLocation : ""} /></label>
                <label>Customer complaint<textarea name="complaint" rows={3} defaultValue={job.complaint} /></label>
                <div><SubmitButton className="btn small primary">Save details</SubmitButton></div>
              </form>
            </details>
          )}
        </aside>
      </div>
    </div>
  );
}
