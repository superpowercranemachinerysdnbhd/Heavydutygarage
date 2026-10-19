import Link from "next/link";
import { asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { addDays, daysBetween, fmtDate, today } from "@/lib/format";
import { getI18n } from "@/i18n/server";
import { roleLabel } from "@/i18n/labels";
import { Avatar } from "@/components/ui";

export async function generateMetadata() {
  return { title: (await getI18n()).t("team.title") };
}

export default async function TeamPage() {
  const user = await requireUser();
  const { t, locale } = await getI18n();
  const all = can(user.role, "staff.view");
  const people = await db.select().from(schema.staff).where(all ? undefined : eq(schema.staff.id, user.id)).orderBy(asc(schema.staff.name));
  const ids = people.map((p) => p.id);
  const d = today(), weekAgo = addDays(d, -6);
  const [certs, labour, jobs, team] = ids.length ? await Promise.all([
    db.select().from(schema.certifications).where(inArray(schema.certifications.staffId, ids)),
    db.select({ staffId: schema.labourEntries.staffId, hours: schema.labourEntries.hours, d: schema.labourEntries.workDate }).from(schema.labourEntries).where(inArray(schema.labourEntries.staffId, ids)),
    db.select({ id: schema.jobs.id, leadId: schema.jobs.leadId, status: schema.jobs.status }).from(schema.jobs),
    db.select().from(schema.jobTeam),
  ]) : [[], [], [], []];
  const openFor = (id: number) => jobs.filter((j) => j.status !== "closed" && (j.leadId === id || team.some((m) => m.jobId === j.id && m.staffId === id))).length;
  const bosses = people.filter((p) => p.role === "boss"), byManager = (id: number) => people.filter((p) => p.reportsTo === id && p.active);

  return (
    <div className="page">
      <div className="view-head"><h2>{t("team.title")}</h2><Link className="btn" href="/team/attendance">{can(user.role, "job.assign") ? t("att.title") : t("att.mine")}</Link>{can(user.role, "staff.manage") && <Link className="btn primary" href="/team/new">{t("team.add")}</Link>}</div>
      {all && (
        <div className="panel"><div className="panel-head"><h3>{t("team.chain")}</h3></div><div className="org">
          {bosses.map((b) => (
            <div key={b.id} style={{ flexDirection: "column", alignItems: "flex-start" }}>
              <div><Avatar name={b.name} /> <b>{b.name}</b> <span className="muted">{roleLabel(t, "boss")}</span></div>
              {byManager(b.id).map((s) => (
                <div key={s.id} style={{ paddingLeft: 24, flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
                  <div><Avatar name={s.name} /> <b>{s.name}</b> <span className="muted">{roleLabel(t, s.role)}</span></div>
                  <div style={{ paddingLeft: 24, display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
                    {byManager(s.id).map((c) => <span key={c.id} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Avatar name={c.name} /> {c.name} <span className="muted">{roleLabel(t, c.role)}{byManager(c.id).length ? ` · ${t("team.leads", { names: byManager(c.id).map((x) => x.name.split(" ")[0]).join(", ") })}` : ""}</span></span>)}
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
              <div className="member-top"><Avatar name={p.name} size="lg" /><div><b>{p.name}</b><span className="muted">{roleLabel(t, p.role)}</span></div>{!p.active && <span className="state leave" style={{ marginLeft: "auto" }}>{t("team.inactive")}</span>}</div>
              {p.skills.length > 0 && <div className="tags">{p.skills.map((s) => <span key={s} className="tag">{s}</span>)}</div>}
              {pc.length > 0 && <div className="tags">{pc.map((c) => { const left = c.expiry ? daysBetween(d, c.expiry) : 999; return <span key={c.id} className={`tag ${left < 0 ? "expd" : left < 45 ? "exp" : ""}`}>{c.name}{c.expiry ? ` · ${left < 0 ? t("team.expired") : t("team.exp", { date: fmtDate(c.expiry, false, locale) })}` : ""}</span>; })}</div>}
              <div className="mstats"><div><b className="num">{openFor(p.id)}</b><span>{t("team.openJobs")}</span></div><div><b className="num">{hrs}</b><span>{t("team.hrs7")}</span></div><div><b className="num">{jobs.filter((j) => j.status === "closed" && j.leadId === p.id).length}</b><span>{t("team.closedLed")}</span></div></div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
