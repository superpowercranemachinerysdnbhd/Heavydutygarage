import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can, canWorkOnJob, CREW_ROLES, LEAD_ROLES } from "@/lib/permissions";
import { CREW_STATUSES, PRIORITIES, STATUSES, qcMessageKey } from "@/lib/jobs";
import { labourRate, fmtDate, fmtDateTime, rm, today } from "@/lib/format";
import { activeStaff, getJob } from "@/lib/queries";
import { jobPartsFor, jobPurchasesFor, partsForJob, requestsFor } from "@/lib/inventory";
import { qcSuggestions, settings } from "@/lib/lists";
import { activeSuppliers } from "@/lib/purchasing";
import { getI18n } from "@/i18n/server";
import { placeLabel, type MessageKey } from "@/i18n";
import { activityText, catLabel, priLabel, roleLabel, stageLabel, statusLabel } from "@/i18n/labels";
import { AgeText, Avatar, CatChip, Notice, Pri, dueInfo } from "@/components/ui";
import SignaturePad from "@/components/SignaturePad";
import SubmitButton from "@/components/SubmitButton";
import ChatRoom from "@/components/ChatRoom";
import PhotoInput from "@/components/PhotoInput";
import { jobThreadId, messagesFor } from "@/lib/chat";
import * as A from "../actions";
import { machineTypeLabel, unitRef } from "@/lib/machine-types";
import { bayCodes, categoryCodes } from "@/lib/lists";

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
  const chatId = await jobThreadId(job.id);
  const [issued, bought, requests, stockParts, chatInitial, sups] = await Promise.all([jobPartsFor(job.id), jobPurchasesFor(job.id), requestsFor(job.id), open ? partsForJob(model.id) : Promise.resolve([]), messagesFor(user, chatId),
    open && can(user.role, "stock.manage") ? activeSuppliers() : Promise.resolve([])]);
  const suggestions = qcSuggestions(job.category, t).filter((g) => !qc.some((q) => (g.itemKey && q.itemKey === g.itemKey) || q.item.toLowerCase() === g.item.toLowerCase()));
  const partLines = [...issued, ...bought];
  const partsSell = partLines.reduce((a, x) => a + x.qty * x.unitPrice, 0), partsCost = partLines.reduce((a, x) => a + x.qty * x.unitCost, 0);
  const q2 = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));
  const crew = staffList.filter((s) => CREW_ROLES.includes(s.role));
  const hours = labour.reduce((a, l) => a + Number(l.hours), 0);
  const labourCost = labour.reduce((a, l) => a + Number(l.hours) * Number(l.payRate), 0);
  const charge = job.category === "WARR" ? 0 : hours * labourRate();
  const qcDone = qc.filter((q) => q.passedAt).length;
  const due = dueInfo(job, t, locale);
  const hidden = (n: string, v: string | number) => <input type="hidden" name={n} value={v} />;
  const canWrite = open || can(user.role, "job.editDetails");
  const qcText = (q: (typeof qc)[number]) => (q.itemKey ? t(qcMessageKey(q.itemKey)) : q.item);

  return (
    <div className="page">
      <div className="crumbs"><Link href="/jobs">{t("nav.jobs")}</Link> / {job.jobNo}</div>
      <div className="job-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="mono">{job.jobNo} · {job.siteType === "field" ? t("job.fieldService") : t("job.workshop")} · {placeLabel(t, job.siteLocation)}</span>
          <h1>{model.make} {model.model}</h1>
          <span className="mono">{unitRef(unit)} · {customer.name}</span>
        </div>
        {can(user.role, "job.editDetails") && <Link className="btn small primary" href={`/jobs/${job.id}/edit`}>{t("job.edit")}</Link>}
        {!open && can(user.role, "job.anyStatus") && <form action={A.reopenJob}>{hidden("jobId", job.id)}<SubmitButton className="btn small">{t("job.reopen")}</SubmitButton></form>}
        <a className="btn small" href="#chat">{t("chat.jobChat")}</a>
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
          <section className="sect" id="writeup"><h3>{t("job.writeup")}</h3><div className="in">
            <div><span className="label">{t("job.complaint")}{job.reportedBy ? ` · ${t("job.reportedBy", { name: job.reportedBy })}` : ""}</span><p style={{ margin: "2px 0 0" }}>{job.complaint}</p></div>
            <form action={A.saveWriteup} className="form" style={{ gridTemplateColumns: "1fr" }}>
              {hidden("jobId", job.id)}
              <label>{t("job.diagnosis")}<textarea name="diagnosis" rows={3} defaultValue={job.diagnosis} disabled={!canWrite} placeholder={t("job.diagnosisPh")} /></label>
              <label>{t("job.workDone")}<textarea name="workDone" rows={4} defaultValue={job.workDone} disabled={!canWrite} placeholder={t("job.workDonePh")} /></label>
              <label>{t("job.recommendations")}<textarea name="recommendations" rows={2} defaultValue={job.recommendations ?? ""} disabled={!canWrite} placeholder={t("job.recommendationsPh")} /></label>
              <div className="form" style={{ gridTemplateColumns: "minmax(0,1fr) 170px", gap: 10 }}>
                <label>{t("job.followUp")}<textarea name="followUp" rows={2} defaultValue={job.followUp ?? ""} disabled={!canWrite} placeholder={t("job.followUpPh")} /></label>
                <label>{t("job.followUpDate")}<input type="date" name="followUpDate" defaultValue={job.followUpDate ?? ""} disabled={!canWrite} /></label>
              </div>
              {canWrite && <div><SubmitButton className="btn small primary">{t("job.saveWriteup")}</SubmitButton></div>}
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
              <PhotoInput name="photos" multiple required ariaLabel={t("job.photos")} />
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

          <section className="sect" id="parts"><h3>{t("job.parts")} <span className="muted" style={subtle}>{issued.length + bought.length}</span></h3>
            <div className="in">
              <span className="label">{t("jp.internal")}</span>
              {issued.length > 0 ? (
                <div className="tbl-wrap"><table>
                  <thead><tr><th>{t("jp.issued")}</th><th className="r">{t("po.qty")}</th>{can(user.role, "money.selling") && <th className="r">{t("parts.sell")}</th>}{can(user.role, "money.cost") && <th className="r">{t("parts.costCol")}</th>}</tr></thead>
                  <tbody>{issued.map((x) => <tr key={x.id}><td><span className="mono">{x.sku}</span> {x.description}<br /><small className="muted">{fmtDateTime(x.issuedAt, locale)}</small></td><td className="r num">{q2(x.qty)} {x.uom}</td>
                    {can(user.role, "money.selling") && <td className="r num">{rm(x.qty * x.unitPrice)}</td>}{can(user.role, "money.cost") && <td className="r num">{rm(x.qty * x.unitCost)}</td>}</tr>)}</tbody>
                </table></div>
              ) : <small className="muted">—</small>}
              {requests.map((r) => (
                <div key={r.id} className="req">
                  <div><b>{q2(r.qty)} {r.uom} · {r.description}</b> <span className="mono muted">{r.sku}</span><br />
                    <small>{r.by ?? "—"} · {fmtDateTime(r.createdAt, locale)}{r.note ? ` · ${r.note}` : ""} · {t("jp.onShelf", { n: q2(r.onHand), uom: r.uom, bin: r.bin ?? "—" })}</small></div>
                  <div className="btnrow">
                    <span className={`pill ${r.status === "requested" ? "info" : r.status === "issued" ? "ok" : "mute"}`}>{t(`rq.${r.status}` as MessageKey)}</span>
                    {r.status === "requested" && can(user.role, "stock.manage") && <>
                      <form action={A.issueRequest}>{hidden("jobId", job.id)}{hidden("requestId", r.id)}<SubmitButton className="btn small primary">{t("jp.issue")}</SubmitButton></form>
                      <form action={A.rejectRequest}>{hidden("jobId", job.id)}{hidden("requestId", r.id)}<SubmitButton>{t("jp.reject")}</SubmitButton></form>
                      {r.onHand < r.qty && can(user.role, "po.create") && <Link className="btn small" href={`/purchasing/new?request=${r.id}`}>{t("jp.order")}</Link>}
                    </>}
                  </div>
                </div>
              ))}
              {open && stockParts.length > 0 && (<>
                <form action={A.requestPart} className="filters" style={{ marginTop: 6 }}>
                  {hidden("jobId", job.id)}
                  <select className="field" name="partId" required aria-label={t("jp.part")} style={{ flex: "1 1 240px" }} defaultValue=""><option value="" disabled>{t("jp.chooseAny")}</option>
                    <optgroup label={t("jp.fits")}>{stockParts.filter((p) => p.fits).map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.description} ({t("jp.inStock", { n: q2(p.onHand), uom: p.uom })})</option>)}</optgroup>
                    <optgroup label={t("jp.otherParts")}>{stockParts.filter((p) => !p.fits).map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.description} ({t("jp.inStock", { n: q2(p.onHand), uom: p.uom })})</option>)}</optgroup></select>
                  <input type="number" name="qty" min="0.01" step="any" defaultValue={1} style={{ width: 80 }} aria-label={t("po.qty")} />
                  <input type="text" name="note" placeholder={t("jp.notePh")} style={{ flex: "1 1 140px" }} aria-label={t("col.note")} />
                  <SubmitButton>{t("jp.request")}</SubmitButton>
                </form>
                {can(user.role, "stock.manage") && (
                  <form action={A.issueDirect} className="filters">
                    {hidden("jobId", job.id)}
                    <select className="field" name="partId" required aria-label={t("jp.part")} style={{ flex: "1 1 240px" }} defaultValue=""><option value="" disabled>{t("jp.issueDirect")}</option>
                      <optgroup label={t("jp.fits")}>{stockParts.filter((p) => p.fits).map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.description} ({t("jp.inStock", { n: q2(p.onHand), uom: p.uom })})</option>)}</optgroup>
                      <optgroup label={t("jp.otherParts")}>{stockParts.filter((p) => !p.fits).map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.description} ({t("jp.inStock", { n: q2(p.onHand), uom: p.uom })})</option>)}</optgroup></select>
                    <input type="number" name="qty" min="0.01" step="any" defaultValue={1} style={{ width: 80 }} aria-label={t("po.qty")} />
                    <SubmitButton className="btn small primary">{t("jp.issue")}</SubmitButton>
                  </form>
                )}
              </>)}
              {open && stockParts.length === 0 && <small className="muted">{t("jp.noStock")}</small>}
            </div>

            <div className="in" style={{ borderTop: "1px solid var(--line)" }}>
              <span className="label">{t("jp.bought")}</span>
              {bought.length > 0 ? (
                <div className="tbl-wrap"><table>
                  <thead><tr><th>{t("jp.desc")}</th><th className="r">{t("po.qty")}</th>{can(user.role, "money.selling") && <th className="r">{t("parts.sell")}</th>}{can(user.role, "money.cost") && <th className="r">{t("parts.costCol")}</th>}{open && can(user.role, "stock.manage") && <th />}</tr></thead>
                  <tbody>{bought.map((x) => <tr key={x.id}><td>{x.partNo && <span className="mono">{x.partNo} </span>}{x.description}<br /><small className="muted">{fmtDate(x.purchasedAt, false, locale)}{x.supplier ? ` · ${t("jp.from", { s: x.supplier })}` : ""}{x.ref ? ` · ${x.ref}` : ""}</small></td>
                    <td className="r num">{q2(x.qty)} {x.uom}</td>
                    {can(user.role, "money.selling") && <td className="r num">{rm(x.qty * x.unitPrice)}</td>}{can(user.role, "money.cost") && <td className="r num">{rm(x.qty * x.unitCost)}</td>}
                    {open && can(user.role, "stock.manage") && <td className="r"><form action={A.removeJobPurchase}>{hidden("jobId", job.id)}{hidden("purchaseId", x.id)}<button className="linkbtn muted">{t("jp.remove")}</button></form></td>}</tr>)}</tbody>
                </table></div>
              ) : <small className="muted">{t("jp.noBought")}</small>}
              {open && can(user.role, "stock.manage") && (
                <details className="add-bought"><summary className="btn small">{t("jp.addBought")}</summary>
                  <form action={A.addJobPurchase} className="form" style={{ marginTop: 10 }}>
                    {hidden("jobId", job.id)}
                    <label className="full">{t("jp.desc")}<input name="description" required placeholder="Hydraulic hose 1/2&quot; x 1.5 m" /></label>
                    <label>{t("jp.partNo")}<input name="partNo" /></label>
                    <label>{t("jp.supplier")}<select className="field" name="supplierId" defaultValue=""><option value="">{t("sup.newBelow")}</option>{sups.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
                    <label>{t("sup.name")}<input name="supplierName" placeholder={t("sup.name")} /></label>
                    <label>{t("po.qty")}<input type="number" name="qty" min="0.01" step="any" defaultValue={1} required /></label>
                    <label>{t("parts.uom")}<input name="uom" defaultValue="pc" list="uoms-job" /></label>
                    <datalist id="uoms-job"><option>pc</option><option>set</option><option>m</option><option>L</option><option>kg</option></datalist>
                    <label>{t("jp.unitCost")}<input type="number" name="unitCost" min={0} step="0.01" required /></label>
                    <label>{t("jp.unitPrice")}<input type="number" name="unitPrice" min={0} step="0.01" placeholder={t("jp.sellAuto", { pct: settings().jobPurchaseMarkup })} /></label>
                    <label>{t("jp.ref")}<input name="ref" /></label>
                    <label>{t("jp.date")}<input type="date" name="purchasedAt" defaultValue={today()} /></label>
                    <div className="full"><SubmitButton className="btn small primary">{t("common.add")}</SubmitButton></div>
                  </form>
                </details>
              )}
            </div>
          </section>

          <section className="sect" id="qc"><h3>{t("job.qc")} <span className="muted" style={subtle}>{qcDone}/{qc.length}</span></h3><div className="in">
            {qc.map((q) => (
              <div key={q.id} className={`task ${q.passedAt ? "done" : ""}`}>
                <form action={A.toggleQc}>{hidden("jobId", job.id)}{hidden("qcId", q.id)}
                  <button className="tick" disabled={!can(user.role, "job.qc") || !open} aria-label={`${t("job.qc")}: ${qcText(q)}`}>{q.passedAt ? "✓" : ""}</button></form>
                <span>{qcText(q)}</span>
                {open && can(user.role, "job.qc") && !q.passedAt && <form action={A.removeQcItem} style={{ marginLeft: "auto" }}>{hidden("jobId", job.id)}{hidden("qcId", q.id)}<button className="linkbtn muted" aria-label={`${t("common.remove")}: ${qcText(q)}`}>✕</button></form>}
              </div>
            ))}
            {qc.length === 0 && <small className="muted">{t("qc.none")}</small>}
            {open && (<>
              <form action={A.addQcItem} className="filters">
                {hidden("jobId", job.id)}
                <input name="item" list="qc-suggest" required placeholder={t("qc.addPh")} aria-label={t("qc.add")} style={{ flex: "1 1 260px" }} />
                <datalist id="qc-suggest">{suggestions.map((g) => <option key={g.itemKey ?? g.item} value={g.item} />)}</datalist>
                <SubmitButton>{t("qc.add")}</SubmitButton>
              </form>
              {suggestions.length > 0 && <form action={A.addQcItem}>{hidden("jobId", job.id)}{hidden("standard", 1)}<SubmitButton className="linkbtn">{`+ ${t("qc.addStandard")} (${suggestions.length})`}</SubmitButton></form>}
            </>)}
            <small className="muted">{open ? t("job.qcHelpNow") : t("job.qcPassed")}</small>
          </div></section>

          {job.status === "closed" && (
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
          <section className="sect" id="chat"><h3>{t("chat.jobChat")} <Link className="btn small" href={`/chat?t=${chatId}`} style={subtle}>{t("chat.openFull")}</Link></h3>
            <ChatRoom threadId={chatId} meId={user.id} initial={chatInitial} info={t("chat.jobInfo")} priceHint={can(user.role, "money.cost") || can(user.role, "money.selling")} compact />
          </section>
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
            <div><span className="label">{t("job.model")}</span><b><Link href={`/machinery/${unit.id}`}>{model.make} {model.model}</Link> · {machineTypeLabel(t, unit.category ?? model.type)}</b></div>
            <div><span className="label">{t("u.plate")}</span><b className="mono">{unit.plateNo ?? "—"}</b></div>
            <div><span className="label">{t("job.serial")}</span><b className="mono">{unit.serialNo ?? "—"}</b></div>
            <div><span className="label">{t("job.hmIn")}</span><b className="hm">{(job.hourMeterIn ?? unit.hourMeter).toLocaleString()} h</b></div>
            <div><span className="label">{t("job.customer")}</span><b>{customer.name}</b></div>
            <div><span className="label">{t("job.contact")}</span><b>{customer.contactName ?? "—"} · <span className="mono">{customer.phone ?? ""}</span></b></div>
            <div><span className="label">{t("job.openedDue")}</span><b>{fmtDate(job.openedAt, false, locale)} → {fmtDate(job.dueDate, false, locale)}</b></div>
          </div></section>

          {can(user.role, "money.selling") && (
            <section className="sect"><h3>{t("job.value")}</h3><div className="totals" style={{ borderTop: 0 }}>
              <span>{t("job.labourCharge", { h: hours, rate: rm(labourRate()) })}{job.category === "WARR" ? t("job.warrantyNoCharge") : ""}</span><b>{rm(charge)}</b>
              <span>{t("job.parts")}{job.category === "WARR" ? t("job.warrantyNoCharge") : ""}</span><b>{rm(job.category === "WARR" ? 0 : partsSell)}</b>
              <span><b>{t("job.total")}</b></span><b>{rm(charge + (job.category === "WARR" ? 0 : partsSell))}</b>
              {can(user.role, "money.cost") && <><span className="muted">{t("job.partsCost")}</span><b className="muted">{rm(partsCost)}</b></>}
              {can(user.role, "money.labourCost") && (<>
                <span className="muted">{t("job.labourCostPay")}</span><b className="muted">{rm(labourCost)}</b>
                <span><b>{t("job.marginTotal")}</b></span><b>{rm(charge + (job.category === "WARR" ? 0 : partsSell) - labourCost - partsCost)}</b>
              </>)}
            </div></section>
          )}

        </aside>
      </div>
    </div>
  );
}
