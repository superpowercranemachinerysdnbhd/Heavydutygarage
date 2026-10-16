import Link from "next/link";
import { asc, count, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Notice } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { createModel } from "../actions";

export const metadata = { title: "Model library" };

export default async function ModelsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const models = await db.select({ m: schema.machineModels, units: count(schema.machineUnits.id) }).from(schema.machineModels)
    .leftJoin(schema.machineUnits, eq(schema.machineUnits.modelId, schema.machineModels.id))
    .groupBy(schema.machineModels.id).orderBy(asc(schema.machineModels.make), asc(schema.machineModels.model));
  return (
    <div className="page">
      <div className="crumbs"><Link href="/machinery">Machinery</Link> / Model library</div>
      <h2>Model library</h2>
      <Notice error={sp.error} />
      <div className="tbl-wrap"><table>
        <thead><tr><th>Make &amp; model</th><th>Type</th><th>Service intervals</th><th className="r">Machines on file</th></tr></thead>
        <tbody>{models.map(({ m, units }) => <tr key={m.id}><td><Link href={`/machinery/models/${m.id}`}><b>{m.make} {m.model}</b></Link></td><td>{m.type}</td><td className="mono">{m.serviceIntervals.length ? m.serviceIntervals.join(" / ") + " h" : "—"}</td><td className="r num">{units}</td></tr>)}
          {models.length === 0 && <tr><td colSpan={4} className="muted">No models yet. Add the machines you commonly service.</td></tr>}</tbody>
      </table></div>
      {can(user.role, "machine.manage") && (
        <form action={createModel} className="panel">
          <div className="panel-head"><h3>Add a model</h3></div>
          <div className="form" style={{ padding: 14 }}>
            <label>Make<input name="make" required placeholder="Komatsu" /></label>
            <label>Model<input name="model" required placeholder="PC200-8" /></label>
            <label>Type<input name="type" required placeholder="Excavator" list="types" /></label>
            <datalist id="types"><option>Excavator</option><option>Rough-terrain crane</option><option>Mobile crane</option><option>Wheel loader</option><option>Forklift</option><option>Bulldozer</option><option>Motor grader</option><option>Backhoe loader</option></datalist>
            <label>Service intervals (hours)<input name="intervals" placeholder="250, 500, 1000, 2000" /></label>
            <label className="full">Specs, one per line as Name: value<textarea name="specs" rows={4} placeholder={"Operating weight: 20 t\nEngine: SAA6D107E-1\nEngine oil: 23 L"} /></label>
            <div className="full"><SubmitButton className="btn primary">Add model</SubmitButton></div>
          </div>
        </form>
      )}
    </div>
  );
}
