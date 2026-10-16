import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { daysBetween, fmtDate, today } from "@/lib/format";
import { unitsWithNames } from "@/lib/queries";

export const metadata = { title: "Machinery" };

export default async function MachineryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const units = (await unitsWithNames()).filter((u) => !q || [u.make, u.model, u.serialNo, u.plateNo, u.customerName].join(" ").toLowerCase().includes(q));
  const t = today();
  return (
    <div className="page">
      <div className="view-head"><h2>Machinery</h2>
        <Link className="btn" href="/machinery/models">Model library</Link>
        {can(user.role, "machine.manage") && <Link className="btn primary" href="/machinery/new">+ Add machine</Link>}</div>
      <form className="filters" method="get"><input type="search" name="q" defaultValue={sp.q ?? ""} placeholder="Search model, serial, plate, customer" style={{ flex: "1 1 260px" }} aria-label="Search" /><button className="btn">Search</button></form>
      <div className="tbl-wrap"><table>
        <thead><tr><th>Machine</th><th>Serial no.</th><th>Owner</th><th>Location</th><th className="r">Hour meter</th><th>Next service</th></tr></thead>
        <tbody>
          {units.map((u) => {
            const stay = u.arrivedAt ? daysBetween(u.arrivedAt, t) : null;
            return (
              <tr key={u.id}>
                <td><Link href={`/machinery/${u.id}`}><b>{u.make} {u.model}</b></Link><br /><small className="muted">{u.type}</small></td>
                <td className="mono">{u.serialNo}{u.plateNo ? <><br /><small className="muted">{u.plateNo}</small></> : null}</td>
                <td>{u.customerName}</td>
                <td>{u.location}{stay !== null && stay > 30 && <> <span className="badge-long">{stay} days</span></>}</td>
                <td className="r num">{u.hourMeter.toLocaleString()} h</td>
                <td>{u.nextServiceDate ? `${u.nextServiceType ?? "Service"}, ${fmtDate(u.nextServiceDate)}` : "—"}</td>
              </tr>
            );
          })}
          {units.length === 0 && <tr><td colSpan={6} className="muted">No machines yet.</td></tr>}
        </tbody>
      </table></div>
    </div>
  );
}
