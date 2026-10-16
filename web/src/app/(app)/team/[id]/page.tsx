import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can, ROLE_LABEL } from "@/lib/permissions";
import { STATUS_LABEL } from "@/lib/jobs";
import { daysBetween, fmtDate, rm, today } from "@/lib/format";
import { listJobs } from "@/lib/queries";
import { Avatar, CatChip, Notice } from "@/components/ui";
import StaffFields from "@/components/StaffFields";
import SubmitButton from "@/components/SubmitButton";
import { addCert, removeCert, resetPassword, setActive, updateStaff } from "../actions";

export const metadata = { title: "Staff profile" };

export default async function StaffPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (id !== user.id && !can(user.role, "staff.view")) notFound();
  const sp = await searchParams;
  const [p] = Number.isInteger(id) ? await db.select().from(schema.staff).where(eq(schema.staff.id, id)) : [];
  if (!p) notFound();
  const manage = can(user.role, "staff.manage"), editCerts = can(user.role, "staff.view");
  const [certs, manager, managers, jobs] = await Promise.all([
    db.select().from(schema.certifications).where(eq(schema.certifications.staffId, id)).orderBy(asc(schema.certifications.expiry)),
    p.reportsTo ? db.select({ name: schema.staff.name }).from(schema.staff).where(eq(schema.staff.id, p.reportsTo)) : Promise.resolve([]),
    manage ? db.select({ id: schema.staff.id, name: schema.staff.name }).from(schema.staff).where(inArray(schema.staff.role, ["boss", "supervisor", "mechanic"])) : Promise.resolve([]),
    listJobs(user),
  ]);
  const theirs = jobs.filter((j) => j.leadId === id || j.teamIds.includes(id));
  const t = today();
  return (
    <div className="page">
      <div className="crumbs"><Link href="/team">Team</Link> / {p.name}</div>
      <div className="view-head"><Avatar name={p.name} size="lg" /><h2>{p.name} <span className="muted" style={{ fontSize: "1rem" }}>{ROLE_LABEL[p.role]}{manager[0] ? ` · reports to ${manager[0].name}` : ""}</span></h2>{!p.active && <span className="state leave">Inactive</span>}</div>
      <Notice error={sp.error} ok={sp.ok} />
      <div className="panel"><div className="facts">
        <div><span className="label">Phone</span><b className="mono">{p.phone}</b></div>
        <div><span className="label">Joined</span><b>{fmtDate(p.joined, true)}</b></div>
        <div><span className="label">IC / passport</span><b>{p.idNumber ?? "—"}</b></div>
        <div><span className="label">Work permit expiry</span><b className={p.permitExpiry && daysBetween(t, p.permitExpiry) < 45 ? "stock-low" : ""}>{fmtDate(p.permitExpiry, true)}</b></div>
        <div><span className="label">Emergency contact</span><b>{p.emergencyContact ?? "—"}</b></div>
        {can(user.role, "money.labourCost") && <div><span className="label">Pay rate</span><b className="num">{rm(Number(p.payRate))}/h</b></div>}
        <div style={{ gridColumn: "1/-1" }}><span className="label">Skills</span><div className="tags">{p.skills.map((s) => <span key={s} className="tag">{s}</span>)}{p.skills.length === 0 && "—"}</div></div>
      </div></div>

      <div className="two">
        <div className="panel"><div className="panel-head"><h3>Certifications &amp; permits</h3></div><div className="in" style={{ padding: 14 }}>
          {certs.map((c) => { const d = c.expiry ? daysBetween(t, c.expiry) : 999; return (
            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <span>{c.name}{c.number ? <small className="muted"> · {c.number}</small> : null}</span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}><span className={`tag ${d < 0 ? "expd" : d < 45 ? "exp" : ""}`}>{c.expiry ? (d < 0 ? "Expired " : "Expires ") + fmtDate(c.expiry, true) : "No expiry"}</span>
                {editCerts && <form action={removeCert}><input type="hidden" name="staffId" value={id} /><input type="hidden" name="certId" value={c.id} /><button className="linkbtn muted" aria-label={`Remove ${c.name}`}>Remove</button></form>}</span>
            </div>); })}
          {certs.length === 0 && <span className="muted">None recorded.</span>}
          {editCerts && <form action={addCert} className="filters" style={{ marginTop: 8 }}>
            <input type="hidden" name="staffId" value={id} />
            <input name="name" placeholder="e.g. CIDB Green Card" required style={{ flex: "1 1 160px" }} aria-label="Certificate" />
            <input name="number" placeholder="Number" style={{ width: 110 }} aria-label="Number" />
            <input type="date" name="expiry" aria-label="Expiry" />
            <SubmitButton>Add</SubmitButton>
          </form>}
        </div></div>
        <div className="panel"><div className="panel-head"><h3>Jobs</h3><span className="muted" style={{ fontSize: ".8rem" }}>{theirs.filter((j) => j.status !== "closed").length} open</span></div>
          <div className="tbl-wrap" style={{ border: 0, borderRadius: 0 }}><table><tbody>
            {theirs.slice(0, 30).map((j) => <tr key={j.id}><td className="mono"><Link href={`/jobs/${j.id}`}>{j.jobNo}</Link></td><td>{j.make} {j.model}</td><td><CatChip cat={j.category} /></td><td>{STATUS_LABEL[j.status]}</td></tr>)}
            {theirs.length === 0 && <tr><td className="muted">No jobs.</td></tr>}
          </tbody></table></div></div>
      </div>

      {manage && (<>
        <details className="panel"><summary className="panel-head" style={{ cursor: "pointer" }}><h3>Edit profile</h3></summary>
          <form action={updateStaff} className="form" style={{ padding: 14 }}><input type="hidden" name="id" value={id} />
            <StaffFields s={p} managers={managers.filter((m) => m.id !== id)} /><div className="full"><SubmitButton className="btn primary">Save</SubmitButton></div></form>
        </details>
        <div className="panel"><div className="panel-head"><h3>Sign-in</h3></div><div className="in" style={{ padding: 14 }}>
          <form action={resetPassword} className="filters"><input type="hidden" name="id" value={id} />
            <input name="password" type="text" minLength={8} required placeholder="New temporary password" autoComplete="off" aria-label="New password" style={{ flex: "1 1 200px" }} />
            <SubmitButton>Reset password</SubmitButton></form>
          {id !== user.id && <form action={setActive}><input type="hidden" name="id" value={id} /><input type="hidden" name="active" value={p.active ? "0" : "1"} />
            <SubmitButton className={p.active ? "btn small" : "btn small primary"}>{p.active ? "Deactivate account (left the company)" : "Re-activate account"}</SubmitButton></form>}
        </div></div>
      </>)}
    </div>
  );
}
