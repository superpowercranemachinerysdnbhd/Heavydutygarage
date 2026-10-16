import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { CATEGORIES } from "@/lib/jobs";
import { LABOUR_RATE, fmtDate, fmtDateTime, rm, today } from "@/lib/format";
import { getJob } from "@/lib/queries";
import { Notice } from "@/components/ui";
import PrintButton from "@/components/PrintButton";
import SubmitButton from "@/components/SubmitButton";
import { saveRecommendations } from "../../actions";

export const metadata = { title: "Service report" };

function defaultRecommendations(d: NonNullable<Awaited<ReturnType<typeof getJob>>>): string {
  const out: string[] = [];
  if (d.job.category === "WARR") out.push("Repeat repair carried out under warranty at no charge.");
  if (["HYD", "EMG"].includes(d.job.category)) out.push("Check hoses and fittings daily for leaks. Report any loss of power early to avoid a breakdown.");
  if (d.unit.nextServiceType && d.unit.nextServiceDate) out.push(`Next scheduled service: ${d.unit.nextServiceType}, due around ${fmtDate(d.unit.nextServiceDate, true)}.`);
  const left = d.tasks.filter((t) => !t.doneAt);
  if (left.length) out.push("Outstanding: " + left.map((t) => t.description).join("; ") + ".");
  return out.join("\n");
}

export default async function ReportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  if (!can(user.role, "job.report")) notFound();
  const d = await getJob(Number((await params).id));
  if (!d) notFound();
  const sp = await searchParams;
  const o = { prices: sp.prices === "1", photos: sp.photos !== "0", qc: sp.qc !== "0" };
  const { job, unit, model, customer, lead, team, tasks, qc, labour, photos } = d;
  const final = job.status === "closed";
  const no = "SR-" + job.jobNo.slice(2);
  const warr = job.category === "WARR";
  const byPerson = new Map<string, number>();
  labour.forEach((l) => byPerson.set(l.name, (byPerson.get(l.name) ?? 0) + Number(l.hours)));
  const hours = [...byPerson.values()].reduce((a, b) => a + b, 0);
  const rec = job.recommendations ?? defaultRecommendations(d);
  const stages = (["before", "during", "after", "qc"] as const).map((s) => [s, photos.filter((p) => p.stage === s)] as const).filter(([, l]) => l.length);
  const techs = [lead, ...team].filter(Boolean).map((p) => p!.name);
  const opt = (k: keyof typeof o, v: boolean) => `?${new URLSearchParams({ prices: k === "prices" ? (v ? "1" : "0") : o.prices ? "1" : "0", photos: k === "photos" ? (v ? "1" : "0") : o.photos ? "1" : "0", qc: k === "qc" ? (v ? "1" : "0") : o.qc ? "1" : "0" })}`;

  return (
    <div className="page" style={{ maxWidth: 860, marginInline: "auto" }}>
      <div className="no-print stack">
        <div className="crumbs"><Link href={`/jobs/${job.id}`}>{job.jobNo}</Link> / Service report</div>
        <Notice error={sp.error} ok={sp.ok} />
        <div className="docbar">
          <div className="filters"><span className="label">Include</span>
            <Link className="btn small" href={opt("prices", !o.prices)} aria-pressed={o.prices}>{o.prices ? "✓ " : ""}Selling prices</Link>
            <Link className="btn small" href={opt("photos", !o.photos)} aria-pressed={o.photos}>{o.photos ? "✓ " : ""}Photos</Link>
            <Link className="btn small" href={opt("qc", !o.qc)} aria-pressed={o.qc}>{o.qc ? "✓ " : ""}QC checklist</Link>
          </div>
          <form action={saveRecommendations} className="stack" style={{ gap: 6 }}>
            <input type="hidden" name="jobId" value={job.id} />
            <input type="hidden" name="prices" value={o.prices ? "1" : "0"} /><input type="hidden" name="photos" value={o.photos ? "1" : "0"} /><input type="hidden" name="qc" value={o.qc ? "1" : "0"} />
            <label className="label" htmlFor="recommendations">Recommendations to customer</label>
            <textarea id="recommendations" name="recommendations" rows={3} defaultValue={rec} />
            <div className="btnrow"><SubmitButton>Save recommendations</SubmitButton><PrintButton /></div>
          </form>
          <small className="muted">Cost prices, pay rates and margins never appear on customer reports. To send it, choose Print and save as PDF, then share the PDF by WhatsApp or email.</small>
        </div>
      </div>

      <article className="doc" aria-label="Service report">
        <div className="doc-head">
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Image src="/logo.jpg" alt="" width={64} height={64} />
            <div><div className="doc-brand">Heavyworks Garage</div><small>Heavy machinery service &amp; repair · [Company address · phone · SSM no.]</small></div>
          </div>
          <div className="doc-meta"><b>Service report</b><span>{no}</span><span>{fmtDate(final ? job.closedAt ?? today() : today(), true)}</span></div>
        </div>
        <span className={`stamp ${final ? "final" : ""}`}>{final ? "Final report" : "Interim report · work in progress"}</span>
        <div className="doc-grid">
          <div><h4>Customer</h4><dl><dt>Company</dt><dd>{customer.name}</dd><dt>Contact</dt><dd>{customer.contactName ?? "—"}</dd><dt>Phone</dt><dd>{customer.phone ?? "—"}</dd></dl></div>
          <div><h4>Machine</h4><dl><dt>Model</dt><dd>{model.make} {model.model} · {model.type}</dd><dt>Serial no.</dt><dd>{unit.serialNo}</dd><dt>Year / plate</dt><dd>{unit.year ?? "—"} · {unit.plateNo ?? "—"}</dd><dt>Hour meter</dt><dd>{(job.hourMeterIn ?? 0).toLocaleString()} h in{job.signoffHourMeter ? ` · ${job.signoffHourMeter.toLocaleString()} h out` : ""}</dd></dl></div>
          <div><h4>Job</h4><dl><dt>Job no.</dt><dd>{job.jobNo}</dd><dt>Type</dt><dd>{CATEGORIES[job.category].name}</dd><dt>Location</dt><dd>{job.siteType === "field" ? "On site: " : "Workshop: "}{job.siteLocation}</dd><dt>Received</dt><dd>{fmtDate(job.openedAt, true)}</dd><dt>Completed</dt><dd>{job.closedAt ? fmtDate(job.closedAt, true) : "—"}</dd><dt>Technicians</dt><dd>{techs.join(", ") || "—"}</dd></dl></div>
        </div>
        <div><h4>Customer complaint</h4><p>{job.complaint}</p></div>
        <div><h4>Findings</h4><p>{job.diagnosis || "—"}</p></div>
        <div><h4>Work carried out</h4>{tasks.filter((t) => t.doneAt).length ? <ul>{tasks.filter((t) => t.doneAt).map((t) => <li key={t.id}>{t.description}</li>)}</ul> : <p>—</p>}</div>
        <div><h4>Labour</h4>{byPerson.size ? (
          <div className="dt"><table><thead><tr><th>Technician</th><th className="r">Hours</th>{o.prices && <th className="r">Amount</th>}</tr></thead>
            <tbody>{[...byPerson].map(([n, h]) => <tr key={n}><td>{n}</td><td className="r">{h}</td>{o.prices && <td className="r">{warr ? "No charge" : rm(h * LABOUR_RATE)}</td>}</tr>)}</tbody></table></div>
        ) : <p>—</p>}</div>
        {o.prices && <div className="tot"><span>Labour ({hours} h)</span><b>{warr ? "No charge" : rm(hours * LABOUR_RATE)}</b><span><b>Total (excl. SST)</b></span><b>{rm(warr ? 0 : hours * LABOUR_RATE)}</b></div>}
        {o.photos && stages.length > 0 && <div><h4>Photos</h4>{stages.map(([s, l]) => (
          <div key={s} className="photos" style={{ marginBottom: 8 }}>{l.map((p) => <figure key={p.id} className="photo"><img src={`/api/photos/${p.id}`} alt={p.caption ?? s} /><figcaption><span className="stage">{s}</span> {p.caption}</figcaption></figure>)}</div>
        ))}</div>}
        {o.qc && qc.length > 0 && <div><h4>Quality check</h4><div className="dt"><table><tbody>{qc.map((q) => {
          const pending = !q.passedAt && !["quality_check", "ready_for_pickup", "closed"].includes(job.status);
          return <tr key={q.id}><td>{q.item}</td><td className={`r ${q.passedAt ? "ok" : pending ? "" : "no"}`}>{q.passedAt ? "Pass" : pending ? "Pending" : "Not done"}</td></tr>;
        })}</tbody></table></div></div>}
        <div><h4>Recommendations</h4><p className="rec">{rec || "—"}</p></div>
        <div className="sign">
          <div><div className="sline" /><small>Serviced by: {user.name}</small></div>
          <div><div className="sline">{job.signaturePath && <img src={`/api/jobs/${job.id}/signature`} alt="Customer signature" />}</div>
            <small>Customer acceptance: {job.signoffAt ? `${job.signoffName} · ${fmtDateTime(job.signoffAt)}` : "name, signature and date"}</small></div>
        </div>
        <div className="doc-foot">Generated {fmtDateTime(new Date())} by {user.name}. {final ? "" : "This is an interim report; the job is still open."}</div>
      </article>
    </div>
  );
}
