import Link from "next/link";
import { asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can, ROLE_LABEL } from "@/lib/permissions";
import { addDays, daysBetween, fmtDate, today } from "@/lib/format";
import { Avatar } from "@/components/ui";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const user = await requireUser();
  const all = can(user.role, "staff.view");
  const people = await db.select().from(schema.staff).where(all ? undefined : eq(schema.staff.id, user.id)).orderBy(asc(schema.staff.name));
  const ids = people.map((p) => p.id);
  const t = today(), weekAgo = addDays(t, -6);
  const [certs, labour, jobs, team] = ids.length ? await Promise.all([
    db.select().from(schema.certifications).where(inArray(schema.certifications.staffId, ids)),
    db.select({ staffId: schema.labourEntries.staffId, hours: schema.labourEntries.hours, d: schema.labourEntries.workDate }).from(schema.labourEntries).where(inArray(schema.labourEntries.staffId, ids)),
    db.select({ id: schema.jobs.id, leadId: schema.jobs.leadId, status: schema.jobs.status }).from(schema.jobs),
    db.select().from(schema.jobTeam),
  ]) : [[], [], [], []];
  const openFor = (id: number) => jobs.filter((j) => j.status !== "closed" && (j.leadId === id || team.some((m) => m.jobId === j.id && m.staffId === id))).length;
  const boss = people.filter((p) => p.role === "boss"), byManager = (id: number) => people.filter((p) => p.reportsTo === id && p.active);

  return (
    <div className="page">
      <div className="view-head"><h2>Team</h2>{can(user.role, "staff.manage") && <Link className="btn primary" href="/team/new">+ Add staff</Link>}</div>
      {all && (
        <div className="panel"><div className="panel-head"><h3>Chain of command</h3></div><div className="org">
          {boss.map((b) => (
            <div key={b.id} style={{ flexDirection: "column", alignItems: "flex-start" }}>
              <div>{<Avatar name={b.name} />} <b>{b.name}</b> <span className="muted">Boss</span></div>
              {byManager(b.id).map((s) => (
                <div key={s.id} style={{ paddingLeft: 24, flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
                  <div><Avatar name={s.name} /> <b>{s.name}</b> <span className="muted">{ROLE_LABEL[s.role]}</span></div>
                  <div style={{ paddingLeft: 24, display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
                    {byManager(s.id).map((c) => <span key={c.id} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Avatar name={c.name} /> {c.name} <span className="muted">{ROLE_LABEL[c.role]}{byManager(c.id).length ? ` · leads ${byManager(c.id).map((x) => x.name.split(" ")[0]).join(", ")}` : ""}</span></span>)}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div></div>
      )}
      <div className="team">
        {people.map((p) => {
          const hrs = labour.filter((l) => l.staffId === p.id && l.d >= weekAgo).reduce((a, l) => a + Number(l.hours), 0);
          const pc = certs.filter((c) => c.staffId === p.id);
          return (
            <Link key={p.id} href={`/team/${p.id}`} className="member plain">
              <div className="member-top"><Avatar name={p.name} size="lg" /><div><b>{p.name}</b><span className="muted">{ROLE_LABEL[p.role]}</span></div>{!p.active && <span className="state leave" style={{ marginLeft: "auto" }}>Inactive</span>}</div>
              {p.skills.length > 0 && <div className="tags">{p.skills.map((s) => <span key={s} className="tag">{s}</span>)}</div>}
              {pc.length > 0 && <div className="tags">{pc.map((c) => { const d = c.expiry ? daysBetween(t, c.expiry) : 999; return <span key={c.id} className={`tag ${d < 0 ? "expd" : d < 45 ? "exp" : ""}`}>{c.name}{c.expiry ? ` · ${d < 0 ? "expired" : "exp " + fmtDate(c.expiry)}` : ""}</span>; })}</div>}
              <div className="mstats"><div><b className="num">{openFor(p.id)}</b><span>Open jobs</span></div><div><b className="num">{hrs}</b><span>Hrs, last 7 d</span></div><div><b className="num">{jobs.filter((j) => j.status === "closed" && j.leadId === p.id).length}</b><span>Jobs led, closed</span></div></div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
