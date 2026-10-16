import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { Notice } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { addKnownIssue } from "../../actions";

export const metadata = { title: "Model" };

export default async function ModelPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  await requireUser();
  const id = Number((await params).id);
  const sp = await searchParams;
  const [m] = Number.isInteger(id) ? await db.select().from(schema.machineModels).where(eq(schema.machineModels.id, id)) : [];
  if (!m) notFound();
  const [issues, units] = await Promise.all([
    db.select({ i: schema.knownIssues, by: schema.staff.name }).from(schema.knownIssues).leftJoin(schema.staff, eq(schema.knownIssues.addedBy, schema.staff.id)).where(eq(schema.knownIssues.modelId, id)).orderBy(desc(schema.knownIssues.createdAt)),
    db.select({ u: schema.machineUnits, c: schema.customers.name }).from(schema.machineUnits).innerJoin(schema.customers, eq(schema.machineUnits.customerId, schema.customers.id)).where(eq(schema.machineUnits.modelId, id)),
  ]);
  return (
    <div className="page">
      <div className="crumbs"><Link href="/machinery">Machinery</Link> / <Link href="/machinery/models">Model library</Link> / {m.make} {m.model}</div>
      <h2>{m.make} {m.model} <span className="muted" style={{ fontSize: "1rem" }}>{m.type}</span></h2>
      <Notice error={sp.error} ok={sp.ok} />
      <div className="panel"><div className="facts">
        {Object.entries(m.specs).map(([k, v]) => <div key={k}><span className="label">{k}</span><b>{v}</b></div>)}
        <div><span className="label">Service intervals</span><b className="mono">{m.serviceIntervals.length ? m.serviceIntervals.join(" / ") + " h" : "—"}</b></div>
      </div></div>
      <div className="two">
        <div className="panel"><div className="panel-head"><h3>Known issues &amp; fixes</h3></div>
          {issues.map(({ i, by }) => <div key={i.id} className="issue"><b>{i.title}</b><span className="muted">{i.fix}</span><br /><small className="muted">{by ?? "—"} · {fmtDate(i.createdAt.toISOString().slice(0, 10), true)}</small></div>)}
          {issues.length === 0 && <div className="issue muted">No entries yet. Add fixes here as the team learns them.</div>}
          <form action={addKnownIssue} className="in form" style={{ padding: 14, gridTemplateColumns: "1fr", borderTop: "1px solid var(--line)" }}>
            <input type="hidden" name="modelId" value={m.id} />
            <label>Problem<input name="title" required placeholder="e.g. Main pump not building pressure" /></label>
            <label>What fixed it<textarea name="fix" rows={2} required placeholder="Checks to do first, part numbers, settings" /></label>
            <div><SubmitButton>Add to knowledge base</SubmitButton></div>
          </form>
        </div>
        <div className="panel"><div className="panel-head"><h3>Machines of this model</h3></div>
          {units.map(({ u, c }) => <Link key={u.id} href={`/machinery/${u.id}`} className="li plain"><div className="li-main"><b className="mono">{u.serialNo}</b><small>{c} · {u.hourMeter.toLocaleString()} h</small></div></Link>)}
          {units.length === 0 && <div className="issue muted">None on file.</div>}
        </div>
      </div>
    </div>
  );
}
