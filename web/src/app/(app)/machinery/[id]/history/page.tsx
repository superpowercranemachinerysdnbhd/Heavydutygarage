import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { CATEGORIES, CATEGORY_KEYS, STATUS_LABEL } from "@/lib/jobs";
import { LABOUR_RATE, addDays, daysBetween, fmtDate, fmtDateTime, rm, today } from "@/lib/format";
import { listJobs } from "@/lib/queries";
import PrintButton from "@/components/PrintButton";

export const metadata = { title: "Machine service history" };

export default async function HistoryReport({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ range?: string; prices?: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "job.report")) notFound();
  const id = Number((await params).id);
  const sp = await searchParams;
  const [row] = await db.select({ unit: schema.machineUnits, model: schema.machineModels, customer: schema.customers }).from(schema.machineUnits)
    .innerJoin(schema.machineModels, eq(schema.machineUnits.modelId, schema.machineModels.id))
    .innerJoin(schema.customers, eq(schema.machineUnits.customerId, schema.customers.id)).where(eq(schema.machineUnits.id, id));
  if (!row) notFound();
  const { unit, model, customer } = row;
  const all = sp.range === "all", prices = sp.prices === "1";
  const t = today(), from = all ? "0000-00-00" : addDays(t, -365);
  const list = (await listJobs(user, { unitId: id })).filter((j) => j.openedAt >= from);
  const down = (j: (typeof list)[number]) => Math.max(1, daysBetween(j.openedAt, j.closedAt ?? t));
  const value = (j: (typeof list)[number]) => (j.category === "WARR" ? 0 : j.labourHours * LABOUR_RATE);
  const hrs = list.reduce((a, j) => a + j.labourHours, 0), days = list.reduce((a, j) => a + down(j), 0), billed = list.reduce((a, j) => a + value(j), 0);
  const byCat = CATEGORY_KEYS.map((k) => [k, list.filter((j) => j.category === k).length] as const).filter(([, n]) => n);
  const q = (r: string, p: boolean) => `?range=${r}&prices=${p ? 1 : 0}`;

  return (
    <div className="page" style={{ maxWidth: 900, marginInline: "auto" }}>
      <div className="no-print stack">
        <div className="crumbs"><Link href={`/machinery/${id}`}>{unit.serialNo}</Link> / Service history report</div>
        <div className="docbar"><div className="filters">
          <span className="label">Period</span>
          <Link className="btn small" href={q("12", prices)} aria-pressed={!all}>{!all ? "✓ " : ""}Last 12 months</Link>
          <Link className="btn small" href={q("all", prices)} aria-pressed={all}>{all ? "✓ " : ""}All records</Link>
          <Link className="btn small" href={q(all ? "all" : "12", !prices)} aria-pressed={prices}>{prices ? "✓ " : ""}Labour amounts</Link>
          <PrintButton />
        </div></div>
      </div>
      <article className="doc" aria-label="Machine service history">
        <div className="doc-head">
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}><Image src="/logo.jpg" alt="" width={64} height={64} />
            <div><div className="doc-brand">Heavyworks Garage</div><small>Heavy machinery service &amp; repair · [Company address · phone · SSM no.]</small></div></div>
          <div className="doc-meta"><b>Service history</b><span>{unit.serialNo}</span><span>{fmtDate(t, true)}</span></div>
        </div>
        <div className="doc-grid">
          <div><h4>Machine</h4><dl><dt>Model</dt><dd>{model.make} {model.model} · {model.type}</dd><dt>Serial no.</dt><dd>{unit.serialNo}</dd><dt>Year / plate</dt><dd>{unit.year ?? "—"} · {unit.plateNo ?? "—"}</dd><dt>Hour meter</dt><dd>{unit.hourMeter.toLocaleString()} h</dd></dl></div>
          <div><h4>Owner</h4><dl><dt>Company</dt><dd>{customer.name}</dd><dt>Contact</dt><dd>{customer.contactName ?? "—"} · {customer.phone ?? ""}</dd><dt>Location</dt><dd>{unit.location}</dd>{unit.arrivedAt && <><dt>With us since</dt><dd>{fmtDate(unit.arrivedAt, true)} ({daysBetween(unit.arrivedAt, t)} days)</dd></>}</dl></div>
        </div>
        <div><h4>Summary · {all ? "all records" : "last 12 months"}</h4>
          <div className="sumrow"><div><b>{list.length}</b><small>Jobs</small></div><div><b>{hrs}</b><small>Labour hours</small></div><div><b>{days}</b><small>Days off work</small></div>{prices && <div><b>{rm(billed)}</b><small>Labour billed</small></div>}</div>
          <p style={{ marginTop: 8 }}>{byCat.map(([k, n]) => `${n} × ${CATEGORIES[k].name}`).join(" · ") || "No jobs in this period."}</p></div>
        <div><h4>Job history</h4><div className="dt"><table>
          <thead><tr><th>Date</th><th>Job</th><th>Type</th><th>Complaint and findings</th><th className="r">Days</th>{prices && <th className="r">Labour</th>}</tr></thead>
          <tbody>{list.map((j) => <tr key={j.id}><td style={{ whiteSpace: "nowrap" }}>{fmtDate(j.openedAt, true)}</td><td className="mono" style={{ whiteSpace: "nowrap" }}>{j.jobNo}</td><td>{CATEGORIES[j.category].name}</td>
            <td><b>{j.complaint}</b>{j.status !== "closed" && <><br /><small>Open · {STATUS_LABEL[j.status]}</small></>}</td><td className="r">{down(j)}</td>{prices && <td className="r">{j.category === "WARR" ? "Warranty" : rm(value(j))}</td>}</tr>)}</tbody>
        </table></div></div>
        <div><h4>Coming up</h4><p>{unit.nextServiceDate ? `${unit.nextServiceType ?? "Service"} due around ${fmtDate(unit.nextServiceDate, true)}.` : "No scheduled service on record. Send us the hour meter reading to plan the next service."}</p></div>
        <div className="doc-foot">Generated {fmtDateTime(new Date())} by {user.name}.</div>
      </article>
    </div>
  );
}
