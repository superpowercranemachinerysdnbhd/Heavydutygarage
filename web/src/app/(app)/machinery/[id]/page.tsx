import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { CATEGORIES, STATUS_LABEL, type Category } from "@/lib/jobs";
import { daysBetween, fmtDate, today } from "@/lib/format";
import { listJobs } from "@/lib/queries";
import { Notice } from "@/components/ui";
import UnitForm from "@/components/UnitForm";
import { updateUnit } from "../actions";

export const metadata = { title: "Machine" };

export default async function UnitPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cat?: string; error?: string; ok?: string }> }) {
  const user = await requireUser();
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
      <div className="crumbs"><Link href="/machinery">Machinery</Link> / {unit.serialNo}</div>
      <div className="view-head">
        <h2>{model.make} {model.model} <span className="muted" style={{ fontSize: "1rem" }}>{model.type}</span></h2>
        {stay !== null && stay > 30 && <span className="badge-long">With us {stay} days</span>}
        {can(user.role, "job.report") && <Link className="btn" href={`/machinery/${id}/history`}>Service history report</Link>}
        {can(user.role, "job.create") && <Link className="btn primary" href={`/jobs/new?unit=${id}`}>+ New job for this machine</Link>}
      </div>
      <Notice error={sp.error} ok={sp.ok} />
      <div className="panel"><div className="facts">
        <div><span className="label">Serial no.</span><b className="mono">{unit.serialNo}</b></div>
        <div><span className="label">Owner</span><b>{customer.name}</b></div>
        <div><span className="label">Hour meter</span><b className="hm">{unit.hourMeter.toLocaleString()} h</b></div>
        <div><span className="label">Location</span><b>{unit.location}</b></div>
        <div><span className="label">On premises since</span><b>{unit.arrivedAt ? `${fmtDate(unit.arrivedAt, true)} (${stay} d)` : "Not on premises"}</b></div>
        <div><span className="label">Year / plate</span><b>{unit.year ?? "—"} · {unit.plateNo ?? "—"}</b></div>
        <div><span className="label">Engine no.</span><b className="mono">{unit.engineNo ?? "—"}</b></div>
        <div><span className="label">Next service</span><b>{unit.nextServiceDate ? `${unit.nextServiceType ?? "Service"}, ${fmtDate(unit.nextServiceDate, true)}` : "—"}</b></div>
        <div><span className="label">Model page</span><b><Link href={`/machinery/models/${model.id}`}>Specs &amp; known issues</Link></b></div>
      </div>{unit.notes && <div className="in" style={{ padding: "0 14px 14px" }}><span className="muted">{unit.notes}</span></div>}</div>

      <div className="panel">
        <div className="panel-head" style={{ flexWrap: "wrap" }}><h3>Service history</h3>
          <div className="chipbar">
            <Link className="chip" href={`/machinery/${id}`} aria-pressed={!sp.cat} style={{ textDecoration: "none" }}>All</Link>
            {cats.map((c) => <Link key={c} className="chip" href={`/machinery/${id}?cat=${c}`} aria-pressed={sp.cat === c} style={{ ["--cat" as string]: CATEGORIES[c as Category].color, textDecoration: "none" }}>{CATEGORIES[c as Category].name}</Link>)}
          </div></div>
        <ul className="timeline">
          {shown.map((j) => (
            <li key={j.id} style={{ ["--cat" as string]: CATEGORIES[j.category].color }}>
              <span className="tl-date">{fmtDate(j.openedAt, true)}</span><span className="tl-mark" />
              <div className="tl-body"><Link href={`/jobs/${j.id}`}><b>{j.complaint}</b></Link><small>{j.jobNo} · {CATEGORIES[j.category].name} · {j.leadName ?? "Unassigned"} · {STATUS_LABEL[j.status]}</small></div>
            </li>
          ))}
          {shown.length === 0 && <li className="muted" style={{ display: "block" }}>{can(user.role, "job.viewAll") ? "No jobs on record yet." : "No jobs you worked on for this machine."}</li>}
        </ul>
      </div>

      {manage && (
        <details className="panel"><summary className="panel-head" style={{ cursor: "pointer" }}><h3>Edit machine</h3></summary>
          <UnitForm action={updateUnit} submit="Save changes" unit={unit} models={models.map((m) => ({ id: m.id, label: `${m.make} ${m.model} · ${m.type}` }))} customers={customers.map((c) => ({ id: c.id, label: c.name }))} />
        </details>
      )}
    </div>
  );
}
