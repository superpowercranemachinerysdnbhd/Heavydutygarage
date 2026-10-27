import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can, canWorkOnJob, CREW_ROLES, LEAD_ROLES } from "@/lib/permissions";
import { CREW_STATUSES, PRIORITIES, STAGES as STEPS, STATUSES, qcMessageKey, invoicePending } from "@/lib/jobs";
import { daysBetween, fmtDate, fmtDateTime, rm, today, hmText } from "@/lib/format";
import { activeStaff, getJob, listJobs } from "@/lib/queries";
import { jobPartsFor, jobPurchasesFor, partsForJob, requestsFor } from "@/lib/inventory";
import { qcSuggestions } from "@/lib/lists";
import { activeSuppliers } from "@/lib/purchasing";
import { getI18n } from "@/i18n/server";
import { placeLabel, type MessageKey } from "@/i18n";
import { activityText, catLabel, priLabel, roleLabel, stageLabel, statusLabel } from "@/i18n/labels";
import { AgeText, Avatar, CatChip, Notice, Pri, dueInfo } from "@/components/ui";
import SignaturePad from "@/components/SignaturePad";
import SubmitButton from "@/components/SubmitButton";
import ChatRoom from "@/components/ChatRoom";
import PhotoInput from "@/components/PhotoInput";
import StatusPicker from "@/components/StatusPicker";
import LabourHours from "@/components/LabourHours";
import { RATE_TYPES } from "@/lib/pay";
import PartPicker from "@/components/PartPicker";
import BoughtLines from "@/components/BoughtLines";
import Suggest from "@/components/Suggest";
import { recommendationIdeas } from "@/lib/recommendations";
import { ServiceDue } from "@/components/ServicePanel";
import { servicesFor, servicesOnJob, servicesOnJobs } from "@/lib/services";
import { isServiceCategory, itemLabel, listItems, settings } from "@/lib/lists";
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

export default async function JobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string; labour?: string; short?: string; part?: string; bought?: string; task?: string }> }) {
  const user = await requireUser();
  const { t, locale } = await getI18n();
  const id = Number((await params).id);
  const sp = await searchParams;
  const d = Number.isInteger(id) ? await getJob(id) : null;
  if (!d) notFound();
  const { job, unit, model, customer, lead, vendor, team, tasks, qc, labour, photos, activity, parent } = d;
  const teamIds = team.map((m) => m.id);
  if (!canWorkOnJob(user, { leadId: job.leadId, teamIds })) notFound();

  const sup = can(user.role, "job.anyStatus");
  const open = job.status !== "closed";
  const idx = STEPS.indexOf(job.status === "deferred" ? "received" : job.status);
  const statusOptions = sup ? STATUSES.filter((s) => s !== job.status) : CREW_STATUSES.filter((s) => s !== job.status);
  const staffList = sup ? await activeStaff() : [];
  const chatId = await jobThreadId(job.id);
  const [issued, bought, requests, stockParts, chatInitial, sups] = await Promise.all([jobPartsFor(job.id), jobPurchasesFor(job.id), requestsFor(job.id), open ? partsForJob(model.id) : Promise.resolve([]), messagesFor(user, chatId),
    can(user.role, "stock.manage") ? activeSuppliers() : Promise.resolve([])]);
  const suggestions = qcSuggestions(job.category, t).filter((g) => !qc.some((q) => (g.itemKey && q.itemKey === g.itemKey) || q.item.toLowerCase() === g.item.toLowerCase()));
  const stockCost = issued.reduce((a, x) => a + x.qty * x.unitCost, 0);
  const boughtCost = bought.filter((x) => x.kind !== "service").reduce((a, x) => a + x.qty * x.unitCost, 0);
  const outsideCost = bought.filter((x) => x.kind === "service").reduce((a, x) => a + x.qty * x.unitCost, 0);
  // "Not enough by the count": part~qty~request from the issue action, offered as "Issue anyway".
  const shortBits = (sp.short ?? "").split("~");
  const shortPart = can(user.role, "stock.manage") ? stockParts.find((p) => p.id === Number(shortBits[0])) : undefined;
  const short = shortPart && Number(shortBits[1]) > 0 ? { part: shortPart, qty: Number(shortBits[1]), requestId: Number(shortBits[2]) || 0 } : null;
  const pickParts = stockParts.map((p) => ({ id: p.id, sku: p.sku, oem: p.oemPartNo, description: p.description, category: p.category, bin: p.bin, onHand: p.onHand, uom: p.uom, fits: p.fits, models: p.models, bulk: p.bulk }));
  const recIdeas = recommendationIdeas(d, t, locale);
  const canFixParts = can(user.role, "stock.manage") && (open || can(user.role, "job.editDetails"));
  const editPart = canFixParts ? issued.find((x) => String(x.id) === sp.part) : undefined;
  const editBought = bought.find((x) => String(x.id) === sp.bought);
  const canLines = can(user.role, "stock.manage") && (open || can(user.role, "job.editDetails"));
  const canOutside = canLines;
  const pendingInvoice = invoicePending({ ...job, outsideLines: bought.filter((x) => x.kind === "service").length });
  const vendorLate = job.outsourced && !job.backAt && job.expectedBackAt && job.expectedBackAt < today() ? daysBetween(job.expectedBackAt, today()) : 0;
  const q2 = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));
  const crew = staffList.filter((s) => CREW_ROLES.includes(s.role));
  // Whose time can be logged: the crew and the Supervisor (who also works on machines; not paid overtime).
  const workers = staffList.filter((s) => CREW_ROLES.includes(s.role) || s.role === "supervisor");
  // Time entries: supervisors change any (also after completion); crew their own while the job is open.
  const canEditLabour = (l: { staffId: number; loggedBy: number | null }) =>
    (open || can(user.role, "job.editDetails")) && (can(user.role, "job.assign") || l.staffId === user.id || l.loggedBy === user.id);
  const editing = labour.find((l) => String(l.id) === sp.labour && canEditLabour(l));
  const hours = labour.reduce((a, l) => a + Number(l.hours), 0);
  const lineCost = (l: (typeof labour)[number]) => Number(l.hours) * Number(l.payRate) * Number(l.rateMult);
  const labourCost = labour.reduce((a, l) => a + lineCost(l), 0);
  // The type of hour is shown without its pay multiplier (that is set in Settings and only used for the cost).
  const rateSelect = (v = "normal") => (
    <select className="field" name="rateType" defaultValue={v} aria-label={t("lab.rateType")} style={{ width: "auto" }}>
      {RATE_TYPES.map((r) => <option key={r} value={r}>{t(`lab.ratePlain.${r}` as MessageKey)}</option>)}
    </select>);
  const qcDone = qc.filter((q) => q.passedAt).length;
  const due = dueInfo(job, t, locale);
  const hidden = (n: string, v: string | number) => <input type="hidden" name={n} value={v} />;
  const canWrite = open || can(user.role, "job.editDetails");
  const [services, doneHere, machineJobs] = await Promise.all([servicesFor(unit.id), servicesOnJob(job.id), listJobs(user, { unitId: unit.id })]);
  // Earlier work orders on this machine (newest first), with the services done on each.
  const previous = machineJobs.filter((p) => p.id !== job.id && p.openedAt <= job.openedAt).sort((a, b) => b.openedAt.localeCompare(a.openedAt) || b.id - a.id);
  const prevServices = new Map([...(await servicesOnJobs(previous.slice(0, 6).map((p) => p.id)))].map(([id, items]) => [id, items.map((i) => itemLabel(t, "service_item", i)).join(", ")]));
  const svcItems = listItems("service_item");
  // Services done: on service jobs, when the machine has a service due, or when this job already recorded one.
  const showServices = isServiceCategory(job.category) || services.some((x) => x.state === "overdue" || x.state === "soon") || doneHere.length > 0;
  const qcText = (q: (typeof qc)[number]) => (q.itemKey ? t(qcMessageKey(q.itemKey)) : q.item);

  return (
    <div className="page">
      <div className="crumbs"><Link href="/jobs">{t("nav.jobs")}</Link> / {job.jobNo}</div>
      <div className="job-head">
        <div className="job-head-main">
          <span className="job-head-no">{job.jobNo} · {job.siteLocation ? `${job.siteType === "field" ? t("job.fieldService") : t("job.workshop")} · ${placeLabel(t, job.siteLocation)}` : t("loc.tbd")}</span>
          {/* The plate number is how the workshop knows a machine; make and model when it has none. */}
          <h1 className={unit.plateNo ? "plate" : ""}><Link href={`/machinery/${unit.id}`} className="plain" title={t("job.machineFile")}>{unit.plateNo || `${model.make} ${model.model}`}</Link></h1>
          <span className="job-head-sub">{unit.plateNo ? `${model.make} ${model.model}` : unit.serialNo ?? ""}{(unit.plateNo || unit.serialNo) ? " · " : ""}{customer.name}</span>
        </div>
        <div className="job-head-actions">
          {can(user.role, "job.editDetails") && <Link className="btn small primary" href={`/jobs/${job.id}/edit`}>{t("job.edit")}</Link>}
          <Link className="btn small" href={`/machinery/${unit.id}#history`}>{t("job.machineFile")}</Link>
          {!open && can(user.role, "job.anyStatus") && <form action={A.reopenJob}>{hidden("jobId", job.id)}<SubmitButton className="btn small">{t("job.reopen")}</SubmitButton></form>}
          <a className="btn small" href="#chat">{t("chat.jobChat")}</a>
          {can(user.role, "job.report") && <Link className="btn small" href={`/jobs/${job.id}/report`}>{open ? t("job.interimReport") : t("job.report")}</Link>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <CatChip cat={job.category} t={t} /><Pri p={job.priority} t={t} /><span className={`due ${due.cls}`}>{due.text}</span><AgeText status={job.status} since={job.statusSince} t={t} />
        {job.source === "qr" && <span className="pill info">{t("job.fromQr")}</span>}
        {job.outsourced && <span className="pill out">🔧 {t("out.badge")}{vendor ? ` · ${vendor.name}` : ""}</span>}
        {parent && <span className="muted">{t("job.comebackOf")} <Link href={`/jobs/${parent.id}`}>{parent.jobNo}</Link></span>}
      </div>
      <Notice error={sp.error} ok={sp.ok} />
      {job.status === "deferred" && <div className="notice deferred-note">{t("job.deferredNote")}</div>}
      {job.outsourced && (
        <div className={`notice out-note ${vendorLate ? "late" : ""}`}>
          <div><b>{t("out.title")}: {vendor?.name ?? "—"}</b>{job.vendorRef ? <span className="mono"> · {job.vendorRef}</span> : ""}{vendor?.phone ? <> · <a href={`tel:${vendor.phone}`}>{vendor.phone}</a></> : ""}</div>
          <div className="muted">
            {job.sentOutAt && t("out.since", { date: fmtDate(job.sentOutAt, false, locale) })}
            {job.backAt ? ` · ${t("out.isBack", { date: fmtDate(job.backAt, false, locale) })}` : job.expectedBackAt ? ` · ${t("out.expectedOn", { date: fmtDate(job.expectedBackAt, false, locale) })}` : ""}
            {vendorLate > 0 && <b className="due over"> · {t("out.late", { n: vendorLate })}</b>}
          </div>
          {pendingInvoice && <div style={{ marginTop: 6 }}><span className="pill warn">{t("inv.pending")}</span> <small>{t("inv.pendingHelp")}</small></div>}
          {open && !job.backAt && bought.every((x) => x.kind !== "service") && job.invoiceStatus !== "none" && <small className="muted" style={{ marginTop: 4 }}>{t("inv.completeHint")}</small>}
          {can(user.role, "job.assign") && bought.every((x) => x.kind !== "service") && (
            <form action={A.setNoInvoice} style={{ marginTop: 4 }}>{hidden("jobId", job.id)}{hidden("none", job.invoiceStatus === "none" ? "0" : "1")}
              {job.invoiceStatus === "none" && <small className="muted">{t("inv.noneSet")} </small>}
              <SubmitButton className="linkbtn muted">{job.invoiceStatus === "none" ? t("inv.expectBtn") : t("inv.noneBtn")}</SubmitButton></form>
          )}
          {!job.backAt && open && can(user.role, "job.assign") && (
            <form action={A.markBackFromVendor} className="filters" style={{ marginTop: 6 }}>{hidden("jobId", job.id)}
              <input type="date" name="backAt" defaultValue={today()} min={job.sentOutAt ?? undefined} max={today()} aria-label={t("out.backOn")} style={{ width: 160 }} />
              <SubmitButton className="btn small primary">{t("out.markBack")}</SubmitButton></form>
          )}
        </div>
      )}
      <div className="steps">{STEPS.map((s, i) => <div key={s} className={`step ${i < idx ? "done" : i === idx ? "cur" : ""}`}>{statusLabel(t, s)}</div>)}</div>
      {open && statusOptions.length > 0 && (
        <form action={A.setStatus} className="filters status-move">
          {hidden("jobId", job.id)}
          <span className="label status-now">{t("job.statusNow", { status: statusLabel(t, job.status) })}</span>
          <label className="label" htmlFor="to">{t("job.moveTo")}</label>
          <StatusPicker options={statusOptions.map((s) => ({ value: s, label: statusLabel(t, s) }))} openedAt={job.openedAt} today={today()} dateLabel={t("job.completedOn")} />
          <SubmitButton className="btn small primary">{t("job.move")}</SubmitButton>
        </form>
      )}

      <div className="job-cols">
        <div className="stack">
          <section className="sect" id="writeup"><h3>{t("job.writeup")}</h3><div className="in">
            <div><span className="label">{t("job.complaint")}{job.reportedBy ? ` · ${t("job.reportedBy", { name: job.reportedBy })}` : ""}</span><p style={{ margin: "2px 0 0", whiteSpace: "pre-line" }}>{job.complaint}</p></div>
            <form action={A.saveWriteup} className="form" style={{ gridTemplateColumns: "1fr" }}>
              {hidden("jobId", job.id)}
              <label>{t("job.diagnosis")}<textarea name="diagnosis" rows={3} defaultValue={job.diagnosis} disabled={!canWrite} placeholder={t("job.diagnosisPh")} /></label>
              <label>{t("job.workDone")}<textarea name="workDone" rows={4} defaultValue={job.workDone} disabled={!canWrite} placeholder={t("job.workDonePh")} /></label>
              <label>{t("job.recommendations")}<textarea id="rec-text" name="recommendations" rows={2} defaultValue={job.recommendations ?? ""} disabled={!canWrite} placeholder={t("job.recommendationsPh")} /></label>
              {canWrite && recIdeas.length > 0 && <Suggest target="rec-text" label={t("rec.ideas")} items={recIdeas} />}
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
              const mayEdit = open && (can(user.role, "job.assign") || x.assigneeId === user.id);
              if (mayEdit && sp.task === String(x.id)) return (
                <div key={x.id} className="task-edit">
                  <form action={A.updateTask} className="filters">
                    {hidden("jobId", job.id)}{hidden("taskId", x.id)}
                    <input name="description" defaultValue={x.description} required aria-label={t("job.tasks")} style={{ flex: "1 1 220px" }} autoFocus />
                    {sup && <select className="field" name="assigneeId" defaultValue={x.assigneeId ?? ""} aria-label={t("job.assignTo")}><option value="">{t("common.anyone")}</option>{crew.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
                    <SubmitButton className="btn small primary">{t("common.save")}</SubmitButton>
                    <Link className="btn small" href={`/jobs/${job.id}`}>{t("common.cancel")}</Link>
                  </form>
                  <form action={A.removeTask}>{hidden("jobId", job.id)}{hidden("taskId", x.id)}<SubmitButton className="linkbtn muted" confirm={t("task.removeConfirm", { task: x.description })}>{t("task.remove")}</SubmitButton></form>
                </div>
              );
              return (
                <form key={x.id} action={A.toggleTask} className={`task ${x.doneAt ? "done" : ""}`}>
                  {hidden("jobId", job.id)}{hidden("taskId", x.id)}
                  <button className="tick" disabled={!open} aria-label={x.doneAt ? t("job.markNotDone", { task: x.description }) : t("job.markDone", { task: x.description })}>{x.doneAt ? "✓" : ""}</button>
                  <span>{x.description}</span><span className="who">{who && <Avatar name={who.name} />}</span>
                  {mayEdit && <Link className="task-edit-link plain muted" href={`/jobs/${job.id}?task=${x.id}`} aria-label={`${t("lab.edit")}: ${x.description}`}>{t("lab.edit")}</Link>}
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
                <figure key={p.id} className="photo"><a href={`/api/photos/${p.id}`} target="_blank" rel="noreferrer" data-viewer="job" data-caption={[stageLabel(t, p.stage), p.caption].filter(Boolean).join(" · ")}><img src={`/api/photos/${p.id}`} alt={p.caption ?? stageLabel(t, p.stage)} loading="lazy" /></a>
                  <figcaption><span className="stage">{stageLabel(t, p.stage)}</span> {p.caption}
                    {(can(user.role, "job.assign") ? canWrite : open && p.takenBy === user.id) && (
                      <form action={A.removePhoto} className="photo-del">{hidden("jobId", job.id)}{hidden("photoId", p.id)}<SubmitButton className="linkbtn muted" confirm={t("ph.confirm")}>{t("ph.remove")}</SubmitButton></form>
                    )}</figcaption></figure>
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

          <section className="sect" id="labour"><h3>{t("job.labour")} <span className="muted" style={subtle}>{hours} h</span></h3><div className="in">
            {job.outsourced && <small className="muted">{t("out.labourHint")}</small>}
            {labour.length > 0 && (
              <div className="tbl-wrap"><table><thead><tr><th>{t("col.date")}</th><th>{t("col.person")}</th><th>{t("col.note")}</th><th className="r">{t("col.hours")}</th>{can(user.role, "money.labourCost") && <th className="r">{t("col.labourCost")}</th>}<th></th></tr></thead>
                <tbody>{labour.map((l) => <tr key={l.id} className={editing?.id === l.id ? "row-sel" : ""}><td className="num">{fmtDate(l.workDate, false, locale)}{l.timeFrom && <><br /><small className="muted">{l.timeFrom}–{l.timeTo}</small></>}</td><td>{l.name}</td><td>{l.note}</td><td className="r num">{Number(l.hours)}{l.rateType !== "normal" && <><br /><span className="pill warn">{t(`lab.tagPlain.${l.rateType}` as MessageKey)}</span></>}</td>{can(user.role, "money.labourCost") && <td className="r num">{rm(lineCost(l))}</td>}
                  <td className="r">{canEditLabour(l) && <Link className="btn small" href={`/jobs/${job.id}?labour=${l.id}#labour`}>{t("lab.edit")}</Link>}</td></tr>)}</tbody></table></div>
            )}
            {editing && (
              <div className="lab-edit">
                <form action={A.updateLabour} className="filters">
                  {hidden("jobId", job.id)}{hidden("entryId", editing.id)}
                  {sup ? <select className="field" name="staffId" aria-label={t("col.person")} defaultValue={editing.staffId}>{[...workers, ...(workers.some((s) => s.id === editing.staffId) ? [] : [{ id: editing.staffId, name: editing.name }])].map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select> : <span className="muted">{editing.name}</span>}
                  <input type="date" name="workDate" defaultValue={editing.workDate} max={today()} aria-label={t("col.date")} required />
                  <input type="number" name="hours" min="0.25" max="24" step="0.25" defaultValue={Number(editing.hours)} style={{ width: 90 }} required aria-label={t("col.hours")} />
                  {rateSelect(editing.rateType)}
                  <input type="text" name="note" defaultValue={editing.note ?? ""} placeholder={t("job.whatDone")} style={{ flex: "1 1 160px" }} aria-label={t("col.note")} />
                  <SubmitButton className="btn small primary">{t("common.save")}</SubmitButton>
                  <Link className="btn small" href={`/jobs/${job.id}#labour`}>{t("common.cancel")}</Link>
                </form>
                <form action={A.removeLabour}>{hidden("jobId", job.id)}{hidden("entryId", editing.id)}<SubmitButton className="linkbtn muted">{t("lab.remove")}</SubmitButton></form>
              </div>
            )}
            {open && (
              <form action={A.logLabour} className="filters">
                {hidden("jobId", job.id)}
                {sup ? <select className="field" name="staffId" aria-label={t("col.person")} defaultValue={job.leadId ?? undefined}>{workers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select> : <span className="muted">{user.name}</span>}
                <input type="date" name="workDate" defaultValue={today()} max={today()} aria-label={t("col.date")} />
                <LabourHours otStart={settings().otStart} rateSelect={rateSelect()} />
                <input type="text" name="note" placeholder={t("job.whatDone")} style={{ flex: "1 1 160px" }} aria-label={t("col.note")} />
                <SubmitButton>{t("job.logTime")}</SubmitButton>
              </form>
            )}
          </div></section>

          <section className="sect" id="parts"><h3>{t("job.parts")} <span className="muted" style={subtle}>{issued.length + bought.length}</span></h3>
            <div className="in">
              {short && (
                <div className="notice err stack" style={{ gap: 8 }} role="alert">
                  <span>{t("jp.shortAsk", { qty: q2(short.qty), uom: short.part.uom, part: short.part.description, n: q2(short.part.onHand) })}</span>
                  <small>{t("jp.shortHelp")}</small>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <form action={short.requestId ? A.issueRequest : A.issueDirect}>
                      {hidden("jobId", job.id)}{hidden("force", "1")}{short.requestId ? hidden("requestId", short.requestId) : <>{hidden("partId", short.part.id)}{hidden("qty", short.qty)}</>}
                      <SubmitButton className="btn small primary">{t("jp.issueAnyway")}</SubmitButton>
                    </form>
                    <Link className="btn small" href={`/jobs/${job.id}#parts`}>{t("common.cancel")}</Link>
                  </div>
                </div>
              )}
              <span className="label">{t("jp.internal")}</span>
              {issued.length > 0 ? (
                <div className="tbl-wrap"><table>
                  <thead><tr><th>{t("jp.issued")}</th><th className="r">{t("po.qty")}</th>{can(user.role, "money.cost") && <th className="r">{t("parts.costCol")}</th>}{canFixParts && <th />}</tr></thead>
                  <tbody>{issued.map((x) => editPart?.id === x.id ? (
                    <tr key={x.id} className="row-sel"><td colSpan={can(user.role, "money.cost") ? 4 : 3}>
                      <span className="mono">{x.sku}</span> {x.description}
                      <div className="filters" style={{ marginTop: 6 }}>
                        <form action={A.updateIssuedPart} className="filters">{hidden("jobId", job.id)}{hidden("jobPartId", x.id)}
                          <label className="label" htmlFor={`q-${x.id}`}>{t("po.qty")}</label>
                          <input id={`q-${x.id}`} type="number" name="qty" min="0.01" step="any" defaultValue={x.qty} style={{ width: 100 }} required /> <span className="muted">{x.uom}</span>
                          <SubmitButton className="btn small primary">{t("common.save")}</SubmitButton></form>
                        <form action={A.updateIssuedPart}>{hidden("jobId", job.id)}{hidden("jobPartId", x.id)}{hidden("remove", "1")}
                          <SubmitButton className="btn small" confirm={t("jp.returnConfirm", { qty: q2(x.qty), uom: x.uom, part: x.description })}>{t("jp.returnAll")}</SubmitButton></form>
                        <Link className="btn small" href={`/jobs/${job.id}#parts`}>{t("common.cancel")}</Link>
                      </div>
                      <small className="muted">{t("jp.editHelp")}</small>
                    </td></tr>
                  ) : <tr key={x.id}><td><span className="mono">{x.sku}</span> {x.description}<br /><small className="muted">{fmtDateTime(x.issuedAt, locale)}</small></td><td className="r num">{q2(x.qty)} {x.uom}</td>
                    {can(user.role, "money.cost") && <td className="r num">{rm(x.qty * x.unitCost)}</td>}
                    {canFixParts && <td className="r"><Link className="btn small" href={`/jobs/${job.id}?part=${x.id}#parts`}>{t("lab.edit")}</Link></td>}</tr>)}</tbody>
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
                  <PartPicker parts={pickParts} placeholder={t("pp.requestPh")} />
                  <input type="number" name="qty" min="0.01" step="any" defaultValue={1} style={{ width: 80 }} aria-label={t("po.qty")} />
                  <input type="text" name="note" placeholder={t("jp.notePh")} style={{ flex: "1 1 140px" }} aria-label={t("col.note")} />
                  <SubmitButton>{t("jp.request")}</SubmitButton>
                </form>
                {can(user.role, "stock.manage") && (
                  <form action={A.issueDirect} className="filters">
                    {hidden("jobId", job.id)}
                    <PartPicker parts={pickParts} placeholder={t("pp.issuePh")} />
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
                  <thead><tr><th>{t("jp.partNo")}</th><th>{t("bl.desc")}</th><th className="r">{t("po.qty")}</th>{can(user.role, "money.cost") && <><th className="r">{t("bl.unitPrice")}</th><th className="r">{t("bl.total")}</th></>}{canLines && <th />}</tr></thead>
                  <tbody>{bought.map((x) => editBought?.id === x.id ? (
                    <tr key={x.id} className="row-sel"><td colSpan={can(user.role, "money.cost") ? 6 : 4}>
                      <form action={A.updateJobPurchase} className="filters">{hidden("jobId", job.id)}{hidden("purchaseId", x.id)}
                        <input name="partNo" defaultValue={x.partNo ?? ""} placeholder={t("jp.partNo")} aria-label={t("jp.partNo")} style={{ width: 120 }} />
                        <input name="description" defaultValue={x.description} required aria-label={t("bl.desc")} style={{ flex: "1 1 200px" }} />
                        {x.kind !== "service" && <input type="number" name="qty" min="0.01" step="any" defaultValue={x.qty} required aria-label={t("po.qty")} style={{ width: 80 }} />}
                        <input type="number" name="unitCost" min="0" step="0.01" defaultValue={x.unitCost} required aria-label={t("bl.unitPrice")} style={{ width: 110 }} />
                        <input name="ref" defaultValue={x.ref ?? ""} placeholder={t("jp.ref")} aria-label={t("jp.ref")} style={{ width: 120 }} />
                        <SubmitButton className="btn small primary">{t("common.save")}</SubmitButton>
                        <Link className="btn small" href={`/jobs/${job.id}#parts`}>{t("common.cancel")}</Link>
                      </form>
                    </td></tr>
                  ) : <tr key={x.id}><td className="mono">{x.partNo ?? "—"}</td><td>{x.kind === "service" && <><span className="pill out">{t("out.line")}</span> </>}{x.description}<br /><small className="muted">{fmtDate(x.purchasedAt, false, locale)}{x.supplier ? ` · ${t("jp.from", { s: x.supplier })}` : ""}{x.ref ? ` · ${x.ref}` : ""}</small></td>
                    <td className="r num">{q2(x.qty)} {x.uom}</td>
                    {can(user.role, "money.cost") && <><td className="r num">{rm(x.unitCost)}</td><td className="r num">{rm(x.qty * x.unitCost)}</td></>}
                    {canLines && <td className="r">{(open || x.kind === "service") && <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
                      <Link className="btn small" href={`/jobs/${job.id}?bought=${x.id}#parts`}>{t("lab.edit")}</Link>
                      <form action={A.removeJobPurchase}>{hidden("jobId", job.id)}{hidden("purchaseId", x.id)}<SubmitButton className="linkbtn muted" confirm={t("jp.removeConfirm")}>{t("jp.remove")}</SubmitButton></form></div>}</td>}</tr>)}</tbody>
                </table></div>
              ) : <small className="muted">{t("jp.noBought")}</small>}
              {open && can(user.role, "stock.manage") && (
                <details className="add-bought"><summary className="btn small">{t("jp.addBought")}</summary>
                  <BoughtLines action={A.addJobPurchases} jobId={job.id} suppliers={sups.map((x) => x.name)} today={today()} />
                </details>
              )}
              {canOutside && (
                <details className="add-bought add-outside" open={job.outsourced && bought.every((x) => x.kind !== "service") && !open}><summary className="btn small">{t("out.addCost")}</summary>
                  <form action={A.addJobPurchase} className="form" style={{ marginTop: 10 }}>
                    {hidden("jobId", job.id)}{hidden("kind", "service")}
                    <label className="full">{t("out.costDesc")}<input name="description" required placeholder={t("out.costDescPh")} /></label>
                    <label>{t("out.vendor")}<input name="supplierName" list="sups-job" defaultValue={vendor?.name ?? ""} placeholder={t("jp.supplierPh")} autoComplete="off" /></label>
                    <label>{t("out.amount")}<input type="number" name="unitCost" min={0} step="0.01" required /></label>
                    <label>{t("out.invoice")}<input name="ref" /></label>
                    <label>{t("jp.date")}<input type="date" name="purchasedAt" defaultValue={today()} max={today()} /></label>
                    <p className="full hint" style={{ margin: 0 }}>{t("out.costHelp")}</p>
                    <div className="full"><SubmitButton className="btn small primary">{t("common.add")}</SubmitButton></div>
                  </form>
                </details>
              )}
              {canOutside && !(open && can(user.role, "stock.manage")) && <datalist id="sups-job">{sups.map((x) => <option key={x.id} value={x.name} />)}</datalist>}
            </div>
          </section>

          {showServices && <section className="sect" id="services"><h3>{t("svc.onJob")} <Link className="btn small" href={`/machinery/${unit.id}#services`} style={subtle}>{t("svc.schedule")}</Link></h3><div className="in">
            {doneHere.length > 0 && (
              <div className="svc-done">
                <span className="label">{t("svc.doneHere")}</span>
                <ul>{doneHere.map((s) => (
                  <li key={s.id}>✓ <b>{itemLabel(t, "service_item", s.item)}</b> <small className="muted">{fmtDate(s.doneOn, false, locale)}{s.nextDue ? ` · ${t("svc.nextOn", { date: fmtDate(s.nextDue, false, locale) })}` : ""}</small>
                    {canWrite && can(user.role, "job.assign") && <form action={A.removeJobService} style={{ display: "inline" }}>{hidden("jobId", job.id)}{hidden("id", s.id)}<SubmitButton className="linkbtn muted" confirm={t("svc.removeConfirm")}>{t("jp.remove")}</SubmitButton></form>}</li>
                ))}</ul>
              </div>
            )}
            {canWrite ? (
              <form action={A.recordServices} className="stack" style={{ gap: 8 }}>
                {hidden("jobId", job.id)}
                <div className="svc-grid">
                  {svcItems.map((i) => {
                    const row = services.find((x) => x.item === i.code);
                    return (
                      <label key={i.code} className="svc-check">
                        <input type="checkbox" name="items" value={i.code} />
                        <span>{itemLabel(t, "service_item", i.code)}</span>
                        {row && <ServiceDue s={row} t={t} locale={locale} />}
                      </label>
                    );
                  })}
                </div>
                <div className="filters"><label className="label" htmlFor="svc-date">{t("svc.doneOn")}</label><input id="svc-date" type="date" name="date" defaultValue={today()} style={{ width: 170 }} />
                  <SubmitButton className="btn small primary">{t("svc.record")}</SubmitButton></div>
                <small className="muted">{t("svc.onJobHelp")}</small>
              </form>
            ) : doneHere.length === 0 && <span className="muted">—</span>}
          </div></section>}

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
                  <div><span className="label">{t("job.hmOut")}</span><b className="hm">{job.signoffHourMeter ? `${job.signoffHourMeter.toLocaleString()} h` : "—"}</b></div>
                  <div><span className="label">{t("job.signed")}</span><b>{fmtDateTime(job.signoffAt, locale)}</b></div>
                  <div style={{ gridColumn: "1/-1" }}><span className="label">{t("job.signature")}</span><img src={`/api/jobs/${job.id}/signature`} alt={t("job.signature")} style={{ maxWidth: 320, background: "#fff", border: "1px solid var(--line)", borderRadius: 4 }} /></div>
                </div>
              ) : can(user.role, "job.handover") ? (
                <form action={A.handover} className="in">
                  {hidden("jobId", job.id)}
                  <div className="form">
                    <label>{t("job.receivedByName")}<input type="text" name="name" defaultValue={customer.contactName ?? ""} required /></label>
                    <label>{t("job.hmOutOptional")}<input type="number" name="hourMeter" defaultValue={unit.hourMeter || ""} min={0} /></label>
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

          <section className="sect" id="previous"><h3>{t("job.previousWork")} <Link className="btn small" href={`/machinery/${unit.id}#history`} style={subtle}>{t("job.machineFile")}</Link></h3><div className="in">
            {previous.length === 0 ? <span className="muted">{t("job.noPrevious")}</span> : (
              <ul className="prev-list">{previous.slice(0, 6).map((p) => (
                <li key={p.id}>
                  <Link href={`/jobs/${p.id}`} className="plain"><b className="mono">{p.jobNo}</b> · {fmtDate(p.closedAt ?? p.openedAt, false, locale)} <CatChip cat={p.category} t={t} /></Link>
                  <small className="muted">{p.complaint.slice(0, 90)}{p.complaint.length > 90 ? "…" : ""}</small>
                  {prevServices.get(p.id) && <small>✓ {prevServices.get(p.id)}</small>}
                </li>))}</ul>
            )}
            {previous.length > 6 && <Link href={`/machinery/${unit.id}#history`} className="muted">{t("job.morePrevious", { n: previous.length - 6 })}</Link>}
          </div></section>

          <section className="sect"><h3>{t("job.machineCustomer")}</h3><div className="facts">
            <div><span className="label">{t("job.model")}</span><b><Link href={`/machinery/${unit.id}`}>{model.make} {model.model}</Link> · {machineTypeLabel(t, unit.category ?? model.type)}</b></div>
            <div><span className="label">{t("u.plate")}</span><b className="mono">{unit.plateNo ?? "—"}</b></div>
            <div><span className="label">{t("job.serial")}</span><b className="mono">{unit.serialNo ?? "—"}</b></div>
            <div><span className="label">{t("job.hmIn")}</span><b className="hm">{hmText(job.hourMeterIn ?? unit.hourMeter)}</b></div>
            <div><span className="label">{t("job.customer")}</span><b>{customer.name}</b></div>
            <div><span className="label">{t("job.contact")}</span><b>{customer.contactName ?? "—"} · <span className="mono">{customer.phone ?? ""}</span></b></div>
            <div><span className="label">{t("job.openedDue")}</span><b>{fmtDate(job.openedAt, false, locale)} → {fmtDate(job.dueDate, false, locale)}</b></div>
            {job.closedAt && <div><span className="label">{t("job.completedOn")}</span><b>{fmtDate(job.closedAt, false, locale)}</b></div>}
          </div></section>

          {can(user.role, "money.cost") && (
            <section className="sect"><h3>{t("job.cost")}</h3><div className="totals" style={{ borderTop: 0 }}>
              <span>{t("job.costStock")}</span><b>{rm(stockCost)}</b>
              <span>{t("job.costBought")}</span><b>{rm(boughtCost)}</b>
              {(outsideCost > 0 || job.outsourced) && <><span>{t("job.costOutside")}</span><b>{rm(outsideCost)}</b></>}
              {can(user.role, "money.labourCost") && <><span>{t("job.costLabour", { h: hours })}</span><b>{rm(labourCost)}</b></>}
              <span><b>{can(user.role, "money.labourCost") ? t("job.costTotal") : t("job.costParts")}</b></span><b>{rm(stockCost + boughtCost + outsideCost + (can(user.role, "money.labourCost") ? labourCost : 0))}</b>
            </div></section>
          )}

        </aside>
      </div>
    </div>
  );
}
