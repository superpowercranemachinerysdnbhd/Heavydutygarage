import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, inArray, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { daysBetween, fmtDate, rm, today } from "@/lib/format";
import { listJobs } from "@/lib/queries";
import { getI18n } from "@/i18n/server";
import { isLocale } from "@/i18n";
import { langLabel, roleLabel, statusLabel } from "@/i18n/labels";
import { Avatar, CatChip, Notice } from "@/components/ui";
import StaffFields, { PayInputs } from "@/components/StaffFields";
import { HISTORY_START, payHistory } from "@/lib/pay-server";
import { settings } from "@/lib/lists";
import SubmitButton from "@/components/SubmitButton";
import { addCert, changePay, mergeInto, removeCert, removePayChange, resetPassword, setActive, setOvertimeRule, updateStaff } from "../actions";

export async function generateMetadata() {
  return { title: (await getI18n()).t("team.title") };
}

export default async function StaffPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const user = await requireUser();
  const { t, locale } = await getI18n();
  const id = Number((await params).id);
  if (id !== user.id && !can(user.role, "staff.view")) notFound();
  const sp = await searchParams;
  const [p] = Number.isInteger(id) ? await db.select().from(schema.staff).where(eq(schema.staff.id, id)) : [];
  if (!p) notFound();
  const manage = can(user.role, "staff.manage"), editCerts = can(user.role, "staff.view");
  const others = manage ? await db.select({ id: schema.staff.id, name: schema.staff.name }).from(schema.staff).where(ne(schema.staff.id, id)).orderBy(asc(schema.staff.name)) : [];
  const [certs, manager, managers, jobs] = await Promise.all([
    db.select().from(schema.certifications).where(eq(schema.certifications.staffId, id)).orderBy(asc(schema.certifications.expiry)),
    p.reportsTo ? db.select({ name: schema.staff.name }).from(schema.staff).where(eq(schema.staff.id, p.reportsTo)) : Promise.resolve([]),
    manage ? db.select({ id: schema.staff.id, name: schema.staff.name }).from(schema.staff).where(inArray(schema.staff.role, ["boss", "supervisor", "mechanic"])) : Promise.resolve([]),
    listJobs(user),
  ]);
  const theirs = jobs.filter((j) => j.leadId === id || j.teamIds.includes(id));
  const d = today();
  const history = manage ? await payHistory(id) : [];
  const currentRow = [...history].filter((h) => h.effectiveFrom <= d).at(-1);
  return (
    <div className="page">
      <div className="crumbs"><Link href="/team">{t("team.title")}</Link> / {p.name}</div>
      <div className="view-head"><Avatar name={p.name} size="lg" /><h2>{p.name} <span className="muted" style={{ fontSize: "1rem" }}>{roleLabel(t, p.role)}{manager[0] ? ` · ${t("team.reportsTo", { name: manager[0].name })}` : ""}</span></h2>{!p.active && <span className="state leave">{t("team.inactive")}</span>}</div>
      {p.aliases.length > 0 && <p className="muted" style={{ margin: 0 }}>{t("team.aka", { names: p.aliases.join(", ") })}</p>}
      <Notice error={sp.error} ok={sp.ok} />
      <div className="panel"><div className="facts">
        <div><span className="label">{t("team.phone")}</span><b className="mono">{p.phone}</b></div>
        <div><span className="label">{t("team.joined")}</span><b>{fmtDate(p.joined, true, locale)}</b></div>
        <div><span className="label">{t("team.ic")}</span><b>{p.idNumber ?? "—"}</b></div>
        <div><span className="label">{t("team.permit")}</span><b className={p.permitExpiry && daysBetween(d, p.permitExpiry) < 45 ? "stock-low" : ""}>{fmtDate(p.permitExpiry, true, locale)}</b></div>
        <div><span className="label">{t("team.emergency")}</span><b>{p.emergencyContact ?? "—"}</b></div>
        <div><span className="label">{t("s.language")}</span><b>{isLocale(p.locale) ? langLabel(t, p.locale) : p.locale}</b></div>
        {can(user.role, "money.labourCost") && <div><span className="label">{t("team.payRate")}</span><b className="num">{t("team.perHour", { rm: rm(Number(p.payRate)) })}</b>
          <small className="muted">{p.monthlySalary ? `${t("team.salaryLine", { rm: rm(Number(p.monthlySalary)), h: Number(p.monthlyHours) })} · ` : ""}{p.noOvertime ? t("team.noOtLine", { sun: rm(Number(p.payRate) * settings().sundayMultiplier) }) : t("team.otLine", { ot: rm(Number(p.payRate) * settings().otMultiplier), sun: rm(Number(p.payRate) * settings().sundayMultiplier) })}</small></div>}
        <div style={{ gridColumn: "1/-1" }}><span className="label">{t("team.skills")}</span><div className="tags">{p.skills.map((s) => <span key={s} className="tag">{s}</span>)}{p.skills.length === 0 && "—"}</div></div>
      </div></div>

      <div className="two">
        <div className="panel"><div className="panel-head"><h3>{t("team.certs")}</h3></div><div className="in" style={{ padding: 14 }}>
          {certs.map((c) => { const left = c.expiry ? daysBetween(d, c.expiry) : 999; return (
            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <span>{c.name}{c.number ? <small className="muted"> · {c.number}</small> : null}</span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}><span className={`tag ${left < 0 ? "expd" : left < 45 ? "exp" : ""}`}>{c.expiry ? t(left < 0 ? "team.expiredOn" : "team.expiresOn", { date: fmtDate(c.expiry, true, locale) }) : t("team.noExpiry")}</span>
                {editCerts && <form action={removeCert}><input type="hidden" name="staffId" value={id} /><input type="hidden" name="certId" value={c.id} /><button className="linkbtn muted" aria-label={`${t("common.remove")} ${c.name}`}>{t("common.remove")}</button></form>}</span>
            </div>); })}
          {certs.length === 0 && <span className="muted">{t("team.noneRecorded")}</span>}
          {editCerts && <form action={addCert} className="filters" style={{ marginTop: 8 }}>
            <input type="hidden" name="staffId" value={id} />
            <input name="name" placeholder={t("team.certPh")} required style={{ flex: "1 1 160px" }} aria-label={t("team.certs")} />
            <input name="number" placeholder={t("team.number")} style={{ width: 110 }} aria-label={t("team.number")} />
            <input type="date" name="expiry" aria-label={t("team.expiry")} />
            <SubmitButton>{t("common.add")}</SubmitButton>
          </form>}
        </div></div>
        <div className="panel"><div className="panel-head"><h3>{t("team.jobs")}</h3><span className="muted" style={{ fontSize: ".8rem" }}>{t("team.openN", { n: theirs.filter((j) => j.status !== "closed").length })}</span></div>
          <div className="tbl-wrap" style={{ border: 0, borderRadius: 0 }}><table><tbody>
            {theirs.slice(0, 30).map((j) => <tr key={j.id}><td className="mono"><Link href={`/jobs/${j.id}`}>{j.jobNo}</Link></td><td>{j.make} {j.model}</td><td><CatChip cat={j.category} t={t} /></td><td>{statusLabel(t, j.status)}</td></tr>)}
            {theirs.length === 0 && <tr><td className="muted">{t("team.noJobs")}</td></tr>}
          </tbody></table></div></div>
      </div>

      {manage && (
        <section className="panel" id="pay">
          <div className="panel-head"><h3>{t("pay.title")}</h3></div>
          <div className="tbl-wrap" style={{ border: 0, borderRadius: 0 }}><table>
            <thead><tr><th>{t("pay.from")}</th><th className="r">{t("s.salary")}</th><th className="r">{t("pay.hours")}</th><th className="r">{t("pay.normal")}</th><th className="r">{t("pay.ot")}</th><th className="r">{t("pay.sunday")}</th><th /></tr></thead>
            <tbody>{[...history].reverse().map((h, i) => { const r = Number(h.hourlyRate); const current = h.id === currentRow?.id; return (
              <tr key={h.id} className={current ? "row-sel" : ""}>
                <td>{h.effectiveFrom === HISTORY_START ? t("pay.start") : fmtDate(h.effectiveFrom, true, locale)}{current && <> <span className="pill ok">{t("pay.current")}</span></>}{h.effectiveFrom > d && <> <span className="pill info">{t("pay.upcoming")}</span></>}{h.note && <><br /><small className="muted">{h.note}</small></>}</td>
                <td className="r num">{h.monthlySalary ? rm(Number(h.monthlySalary)) : "—"}</td><td className="r num">{h.monthlySalary ? Number(h.monthlyHours) : "—"}</td>
                <td className="r num">{rm(r)}</td><td className="r num">{p.noOvertime ? "—" : rm(r * settings().otMultiplier)}</td><td className="r num">{rm(r * settings().sundayMultiplier)}</td>
                <td className="r">{i < history.length - 1 && <form action={removePayChange}><input type="hidden" name="id" value={id} /><input type="hidden" name="rowId" value={h.id} /><SubmitButton className="linkbtn muted" confirm={t("pay.removeConfirm")}>{t("common.remove")}</SubmitButton></form>}</td>
              </tr>); })}</tbody>
          </table></div>
          <form action={setOvertimeRule} className="filters" style={{ padding: "10px 14px", borderTop: "1px solid var(--line)" }}>
            <input type="hidden" name="id" value={id} />
            <label className="set-check"><input type="checkbox" name="noOvertime" defaultChecked={p.noOvertime} /> <span><b>{t("pay.noOt")}</b><br /><small className="muted">{t("pay.noOtHelp")}</small></span></label>
            <SubmitButton className="btn small">{t("common.save")}</SubmitButton>
          </form>
          <form action={changePay} className="form" style={{ padding: 14, borderTop: "1px solid var(--line)" }}>
            <input type="hidden" name="id" value={id} />
            <label>{t("pay.effectiveFrom")}<input type="date" name="effectiveFrom" required defaultValue={`${d.slice(0, 7)}-01`} /></label>
            <PayInputs t={t} hours={String(Number(p.monthlyHours))} />
            <label className="full">{t("u.notes")}<input name="note" placeholder={t("pay.notePh")} maxLength={200} /></label>
            <p className="full hint" style={{ margin: 0 }}>{t("pay.help")}</p>
            <div className="full"><SubmitButton className="btn primary">{t("pay.save")}</SubmitButton></div>
          </form>
        </section>
      )}

      {manage && (<>
        <details className="panel"><summary className="panel-head" style={{ cursor: "pointer" }}><h3>{t("team.edit")}</h3></summary>
          <form action={updateStaff} className="form" style={{ padding: 14 }}><input type="hidden" name="id" value={id} />
            <StaffFields s={p} t={t} managers={managers.filter((m) => m.id !== id)} /><div className="full"><SubmitButton className="btn primary">{t("common.save")}</SubmitButton></div></form>
        </details>
        <div className="panel"><div className="panel-head"><h3>{t("team.signin")}</h3></div><div className="in" style={{ padding: 14 }}>
          <form action={resetPassword} className="filters"><input type="hidden" name="id" value={id} />
            <input name="password" type="text" minLength={8} required placeholder={t("team.newPwPh")} autoComplete="off" aria-label={t("team.newPwPh")} style={{ flex: "1 1 200px" }} />
            <SubmitButton>{t("team.resetPw")}</SubmitButton></form>
          {id !== user.id && <form action={setActive}><input type="hidden" name="id" value={id} /><input type="hidden" name="active" value={p.active ? "0" : "1"} />
            <SubmitButton className={p.active ? "btn small" : "btn small primary"}>{p.active ? t("team.deactivate") : t("team.reactivate")}</SubmitButton></form>}
        </div></div>
        {id !== user.id && (
          <form action={mergeInto} className="panel danger-zone" id="merge">
            <div className="panel-head"><h3>{t("team.mergeTitle")}</h3></div>
            <div className="stack" style={{ padding: 14, gap: 10 }}>
              <input type="hidden" name="id" value={id} />
              <p className="muted" style={{ margin: 0 }}>{t("team.mergeHelp", { name: p.name })}</p>
              <label className="label">{t("team.mergeInto")}
                <select className="field" name="into" required defaultValue="" style={{ maxWidth: 420, display: "block", marginTop: 4 }}>
                  <option value="" disabled>{t("common.choose")}</option>
                  {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </label>
              <label className="set-check"><input type="checkbox" name="confirm" required /> {t("team.mergeConfirm", { name: p.name })}</label>
              <div><SubmitButton className="btn danger">{t("team.mergeBtn")}</SubmitButton></div>
            </div>
          </form>
        )}
      </>)}
    </div>
  );
}
