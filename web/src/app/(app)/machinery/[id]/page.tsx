import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { CATEGORIES, type Category } from "@/lib/jobs";
import { daysBetween, fmtDate, today } from "@/lib/format";
import { listJobs } from "@/lib/queries";
import { getI18n } from "@/i18n/server";
import { placeLabel } from "@/i18n";
import { catLabel, statusLabel } from "@/i18n/labels";
import { Notice } from "@/components/ui";
import UnitForm from "@/components/UnitForm";
import { updateUnit } from "../actions";

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
  const [models, customers] = manage ? await Promise.all([
    db.select().from(schema.machineModels).orderBy(asc(schema.machineModels.make)), db.select().from(schema.customers).orderBy(asc(schema.customers.name)),
  ]) : [[], []];

  return (
    <div className="page">
      <div className="crumbs"><Link href="/machinery">{t("mach.title")}</Link> / {unit.serialNo}</div>
      <div className="view-head">
        <h2>{model.make} {model.model} <span className="muted" style={{ fontSize: "1rem" }}>{model.type}</span></h2>
        {stay !== null && stay > 30 && <span className="badge-long">{t("mach.withUs", { n: stay })}</span>}
        {can(user.role, "job.report") && <Link className="btn" href={`/machinery/${id}/history`}>{t("mach.historyReport")}</Link>}
        {can(user.role, "job.create") && <Link className="btn primary" href={`/jobs/new?unit=${id}`}>{t("mach.newJob")}</Link>}
      </div>
      <Notice error={sp.error} ok={sp.ok} />
      <div className="panel"><div className="facts">
        <div><span className="label">{t("col.serial")}</span><b className="mono">{unit.serialNo}</b></div>
        <div><span className="label">{t("col.owner")}</span><b>{customer.name}</b></div>
        <div><span className="label">{t("col.hourMeter")}</span><b className="hm">{unit.hourMeter.toLocaleString()} h</b></div>
        <div><span className="label">{t("col.location")}</span><b>{placeLabel(t, unit.location)}</b></div>
        <div><span className="label">{t("mach.onPremises")}</span><b>{unit.arrivedAt ? `${fmtDate(unit.arrivedAt, true, locale)} (${t("mach.days", { n: stay ?? 0 })})` : t("mach.notOnPremises")}</b></div>
        <div><span className="label">{t("u.year")} / {t("u.plate")}</span><b>{unit.year ?? "—"} · {unit.plateNo ?? "—"}</b></div>
        <div><span className="label">{t("mach.engineNo")}</span><b className="mono">{unit.engineNo ?? "—"}</b></div>
        <div><span className="label">{t("mach.nextService")}</span><b>{unit.nextServiceDate ? `${unit.nextServiceType ?? t("hist.serviceDefault")}, ${fmtDate(unit.nextServiceDate, true, locale)}` : "—"}</b></div>
        <div><span className="label">{t("mach.modelPage")}</span><b><Link href={`/machinery/models/${model.id}`}>{t("mach.specsIssues")}</Link></b></div>
      </div>{unit.notes && <div className="in" style={{ padding: "0 14px 14px" }}><span className="muted">{unit.notes}</span></div>}</div>

      <div className="panel">
        <div className="panel-head" style={{ flexWrap: "wrap" }}><h3>{t("mach.history")}</h3>
          <div className="chipbar">
            <Link className="chip" href={`/machinery/${id}`} aria-pressed={!sp.cat} style={{ textDecoration: "none" }}>{t("mach.all")}</Link>
            {cats.map((c) => <Link key={c} className="chip" href={`/machinery/${id}?cat=${c}`} aria-pressed={sp.cat === c} style={{ ["--cat" as string]: CATEGORIES[c as Category].color, textDecoration: "none" }}>{catLabel(t, c as Category)}</Link>)}
          </div></div>
        <ul className="timeline">
          {shown.map((j) => (
            <li key={j.id} style={{ ["--cat" as string]: CATEGORIES[j.category].color }}>
              <span className="tl-date">{fmtDate(j.openedAt, true, locale)}</span><span className="tl-mark" />
              <div className="tl-body"><Link href={`/jobs/${j.id}`}><b>{j.complaint}</b></Link><small>{j.jobNo} · {catLabel(t, j.category)} · {j.leadName ?? t("dash.unassigned")} · {statusLabel(t, j.status)}</small></div>
            </li>
          ))}
          {shown.length === 0 && <li className="muted" style={{ display: "block" }}>{can(user.role, "job.viewAll") ? t("mach.noHistory") : t("mach.noHistoryMine")}</li>}
        </ul>
      </div>

      {manage && (
        <details className="panel"><summary className="panel-head" style={{ cursor: "pointer" }}><h3>{t("mach.edit")}</h3></summary>
          <UnitForm t={t} action={updateUnit} submit={t("mach.saveChanges")} unit={unit} models={models.map((m) => ({ id: m.id, label: `${m.make} ${m.model} · ${m.type}` }))} customers={customers.map((c) => ({ id: c.id, label: c.name }))} />
        </details>
      )}
    </div>
  );
}
