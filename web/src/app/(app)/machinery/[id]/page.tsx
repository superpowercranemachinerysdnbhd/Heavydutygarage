import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import type { Category } from "@/lib/jobs";
import { catColor } from "@/lib/lists";
import { rm, addDays, daysBetween, fmtDate, today, hmText } from "@/lib/format";
import { listJobs, machineFormOptions } from "@/lib/queries";
import { machinePhotoUrl, machineTypeLabel, unitRef } from "@/lib/machine-types";
import { getI18n } from "@/i18n/server";
import { placeLabel } from "@/i18n";
import { catLabel, statusLabel } from "@/i18n/labels";
import { Notice } from "@/components/ui";
import UnitForm from "@/components/UnitForm";
import { updateUnit } from "../actions";
import ServicePanel from "@/components/ServicePanel";
import { servicesFor } from "@/lib/services";
import { costRows, sum } from "@/lib/costs";
import { eventsForUnit, isLate } from "@/lib/events";
import { eventColor } from "@/lib/lists";

export async function generateMetadata() {
  return { title: (await getI18n()).t("mach.title") };
}

export default async function UnitPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cat?: string; error?: string; ok?: string }> }) {
  const user = await requireUser();
  const { t, locale } = await getI18n();
  const id = Number((await params).id);
  const sp = await searchParams;
  const [row] = Number.isInteger(id) ? await db.select({ unit: schema.machineUnits, model: schema.machineModels, customer: schema.customers }).from(schema.machineUnits)
    .innerJoin(schema.machineModels, eq(schema.machineUnits.modelId, schema.machineModels.id))
    .innerJoin(schema.customers, eq(schema.machineUnits.customerId, schema.customers.id)).where(eq(schema.machineUnits.id, id)) : [];
  if (!row) notFound();
  const { unit, model, customer } = row;
  const history = await listJobs(user, { unitId: id });
  const cats = [...new Set(history.map((j) => j.category))];
  const shown = sp.cat ? history.filter((j) => j.category === sp.cat) : history;
  const stay = unit.arrivedAt ? daysBetween(unit.arrivedAt, today()) : null;
  const manage = can(user.role, "machine.manage");
  // Maintenance cost (Supervisor: parts only; Head Manager: parts and labour at pay rates).
  const seeCost = can(user.role, "money.cost"), seeLabour = can(user.role, "money.labourCost");
  const costs = seeCost ? await costRows({ unitId: id }) : [];
  const yr = today().slice(0, 4), last12 = addDays(today(), -365);
  const costCols = [[t("mc.thisYear"), sum(costs.filter((c) => c.opened.startsWith(yr)))], [t("mc.last12"), sum(costs.filter((c) => c.opened >= last12))], [t("mc.allTime"), sum(costs)]] as const;
  const [services, events] = await Promise.all([servicesFor(id), eventsForUnit(id)]);
  const options = manage ? await machineFormOptions() : null;
  const photo = machinePhotoUrl(unit.id, unit.photoPath);
  const comp = [[t("u.engineModel"), unit.engineModel], [t("u.transmissionModel"), unit.transmissionModel], [t("u.pumpModel"), unit.pumpModel]] as const;

  return (
    <div className="page">
      <div className="crumbs"><Link href="/machinery">{t("mach.title")}</Link> / {unitRef(unit)}</div>
      <div className="view-head">
        <h2>{unit.plateNo && <span className="mono">{unit.plateNo} · </span>}{model.make} {model.model} <span className="muted" style={{ fontSize: "1rem" }}>{machineTypeLabel(t, unit.category ?? model.type)}</span></h2>
        {stay !== null && stay > 30 && <span className="badge-long">{t("mach.withUs", { n: stay })}</span>}
        {can(user.role, "job.report") && <Link className="btn" href={`/machinery/${id}/history`}>{t("mach.historyReport")}</Link>}
        {can(user.role, "machine.manage") && <Link className="btn" href={`/machinery/${id}/qr`}>{t("qr.sticker")}</Link>}
        {can(user.role, "job.create") && <Link className="btn primary" href={`/jobs/new?unit=${id}`}>{t("mach.newJob")}</Link>}
      </div>
      <Notice error={sp.error} ok={sp.ok} />
      <div className="panel mach-top">
        {photo ? <a href={photo} target="_blank" rel="noreferrer" data-viewer="machine"><img className="mach-photo" src={photo} alt={`${model.make} ${model.model}`} /></a> : <div className="mach-photo mach-thumb none" role="img" aria-label={t("mach.noPhoto")} />}
        <div className="facts">
        <div><span className="label">{t("u.plate")}</span><b className="mono">{unit.plateNo ?? "—"}</b></div>
        <div><span className="label">{t("col.serial")}</span><b className="mono">{unit.serialNo ?? "—"}</b></div>
        <div><span className="label">{t("col.owner")}</span><b>{customer.name}</b></div>
        <div><span className="label">{t("col.hourMeter")}</span><b className="hm">{hmText(unit.hourMeter)}</b></div>
        <div><span className="label">{t("col.location")}</span><b>{placeLabel(t, unit.location)}</b></div>
        <div><span className="label">{t("mach.onPremises")}</span><b>{unit.arrivedAt ? `${fmtDate(unit.arrivedAt, true, locale)} (${t("mach.days", { n: stay ?? 0 })})` : t("mach.notOnPremises")}</b></div>
        <div><span className="label">{t("u.year")}</span><b>{unit.year ?? "—"}</b></div>
        {comp.map(([label, v]) => <div key={label}><span className="label">{label}</span><b className="mono">{v ?? "—"}</b></div>)}
        <div><span className="label">{t("mach.engineNo")}</span><b className="mono">{unit.engineNo ?? "—"}</b></div>
        <div><span className="label">{t("mach.nextService")}</span><b>{unit.nextServiceDate ? `${unit.nextServiceType ?? t("hist.serviceDefault")}, ${fmtDate(unit.nextServiceDate, true, locale)}` : "—"}</b></div>
        <div><span className="label">{t("mach.modelPage")}</span><b><Link href={`/machinery/models/${model.id}`}>{t("mach.specsIssues")}</Link></b></div>
      </div></div>{unit.notes && <div className="panel in" style={{ padding: "10px 14px" }}><span className="muted">{unit.notes}</span></div>}

      {seeCost && (
        <section className="panel" id="cost">
          <div className="panel-head"><h3>{t("mc.title")}</h3>{seeLabour && <Link href="/reports" className="muted" style={{ fontSize: ".8rem" }}>{t("nav.reports")}</Link>}</div>
          <div className="tbl-wrap" style={{ border: 0, borderRadius: 0 }}><table>
            <thead><tr><th></th>{costCols.map(([l]) => <th key={l} className="r">{l}</th>)}</tr></thead>
            <tbody>
              <tr><td>{t("mc.orders")}</td>{costCols.map(([l, c]) => <td key={l} className="r num">{c.n}</td>)}</tr>
              <tr><td>{t("mc.parts")}</td>{costCols.map(([l, c]) => <td key={l} className="r num">{rm(c.parts)}</td>)}</tr>
              {costs.some((c) => c.outside > 0) && <tr><td>{t("rp.outside")}</td>{costCols.map(([l, c]) => <td key={l} className="r num">{rm(c.outside)}</td>)}</tr>}
              {seeLabour && <tr><td>{t("mc.labour")}</td>{costCols.map(([l, c]) => <td key={l} className="r num">{rm(c.labour)}</td>)}</tr>}
              <tr><td><b>{seeLabour ? t("mc.total") : t("mc.partsTotal")}</b></td>{costCols.map(([l, c]) => <td key={l} className="r num"><b>{rm(c.parts + c.outside + (seeLabour ? c.labour : 0))}</b></td>)}</tr>
            </tbody>
          </table></div>
        </section>
      )}
      <ServicePanel unitId={id} services={services} manage={manage} t={t} locale={locale} />
      <section className="panel" id="events">
        <div className="panel-head"><h3>{t("ev.forMachine")}</h3>{can(user.role, "job.assign") && <Link className="btn small" href={`/calendar/event/new?unit=${id}`}>{t("ev.add")}</Link>}</div>
        <div className="panel-body">
          {events.map((e) => (
            <Link key={e.id} href={`/calendar/event/${e.id}`} className={`svc-line plain ${e.doneAt ? "done-line" : ""}`} style={{ ["--cat" as string]: eventColor(e.type) }}>
              <i className="evdot" /><span>{e.title}{e.repeatMonths ? ` · ${t("ev.everyN", { n: e.repeatMonths })}` : ""}</span>
              <small className={isLate(e) ? "due over" : "muted"}>{fmtDate(e.day, true, locale)}{e.doneAt ? ` · ${t("ev.isDone")}` : ""}</small>
            </Link>
          ))}
          {events.length === 0 && <div className="empty">{t("ev.noneForMachine")}</div>}
        </div>
      </section>

      <div className="panel">
        <div className="panel-head" style={{ flexWrap: "wrap" }}><h3>{t("mach.history")}</h3>
          <div className="chipbar">
            <Link className="chip" href={`/machinery/${id}`} aria-pressed={!sp.cat} style={{ textDecoration: "none" }}>{t("mach.all")}</Link>
            {cats.map((c) => <Link key={c} className="chip" href={`/machinery/${id}?cat=${c}`} aria-pressed={sp.cat === c} style={{ ["--cat" as string]: catColor(c as Category), textDecoration: "none" }}>{catLabel(t, c as Category)}</Link>)}
          </div></div>
        <ul className="timeline">
          {shown.map((j) => (
            <li key={j.id} style={{ ["--cat" as string]: catColor(j.category) }}>
              <span className="tl-date">{fmtDate(j.openedAt, true, locale)}</span><span className="tl-mark" />
              <div className="tl-body"><Link href={`/jobs/${j.id}`}><b>{j.complaint}</b></Link><small>{j.jobNo} · {catLabel(t, j.category)} · {j.outsourced ? `${t("out.badge")}: ${j.vendorName ?? ""}` : j.leadName ?? t("dash.unassigned")} · {statusLabel(t, j.status)}</small></div>
            </li>
          ))}
          {shown.length === 0 && <li className="muted" style={{ display: "block" }}>{can(user.role, "job.viewAll") ? t("mach.noHistory") : t("mach.noHistoryMine")}</li>}
        </ul>
      </div>

      {manage && (
        <details className="panel"><summary className="panel-head" style={{ cursor: "pointer" }}><h3>{t("mach.edit")}</h3></summary>
          <UnitForm t={t} action={updateUnit} submit={t("mach.saveChanges")} options={options!}
            unit={{ ...unit, machineType: unit.category ?? (model.type as string), make: model.make, model: model.model, hasPhoto: !!unit.photoPath }} />
        </details>
      )}
    </div>
  );
}
