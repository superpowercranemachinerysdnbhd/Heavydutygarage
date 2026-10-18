import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can, CREW_ROLES } from "@/lib/permissions";
import { addDays, fmtDate, today } from "@/lib/format";
import { activeStaff, listJobs, type JobRow } from "@/lib/queries";
import { catColor, itemLabel } from "@/lib/lists";
import { ABSENCE, isDay, isMonth, monthGrid, planWeekStart, shiftMonth, weekDays, weekStart, weekday, type PlanKind } from "@/lib/calendar";
import { eventsBetween, holidaysBetween, planBetween, type CalEvent } from "@/lib/calendar-server";
import { getI18n } from "@/i18n/server";
import { INTL_LOCALE, placeLabel, type Locale, type MessageKey, type T } from "@/i18n";
import { roleLabel } from "@/i18n/labels";
import { Notice } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { addHoliday, copyLastWeek, removeHoliday, savePlan } from "./actions";

export async function generateMetadata() {
  return { title: (await getI18n()).t("nav.calendar") };
}

type SP = { view?: string; m?: string; w?: string; show?: string; ok?: string; error?: string };
const TYPES = ["job", "service", "followup", "po", "absence"] as const;
const hidden = (n: string, v: string) => <input type="hidden" name={n} value={v} />;
const plate = (j: JobRow) => j.plateNo || j.serialNo || `${j.make} ${j.model}`;
const dayName = (iso: string, locale: Locale, style: "short" | "long" = "short") =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(INTL_LOCALE[locale], { weekday: style, timeZone: "UTC" });
const absenceLabel = (t: T, k: string) => t(`cal.k.${k}` as MessageKey);

function evText(t: T, e: CalEvent): string {
  switch (e.type) {
    case "job": return `${e.title} · ${itemLabel(t, "job_category", e.code)}`;
    case "overdue": return `${t("cal.overdue")}: ${e.title}`;
    case "service": return `${e.title} · ${itemLabel(t, "service_item", e.code)}`;
    case "followup": return `${t("cal.followUp")}: ${e.title}`;
    case "po": return `${e.title} · ${e.sub}`;
    case "absence": return `${e.title} · ${absenceLabel(t, e.code)}`;
  }
}
const evColor = (e: CalEvent) => (e.type === "job" ? catColor(e.code) : e.color);
const evType = (e: CalEvent) => (e.type === "overdue" ? "job" : e.type);

export default async function CalendarPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const { t, locale } = await getI18n();
  const sp = await searchParams;
  const planner = can(user.role, "job.assign");
  const view = sp.view === "week" || (!sp.view && !planner && !sp.m) ? "week" : "month";
  const tabs = (
    <nav className="cal-tabs" aria-label={t("nav.calendar")}>
      <Link href="/calendar?view=month" className={view === "month" ? "on" : ""}>{t("cal.month")}</Link>
      <Link href="/calendar?view=week" className={view === "week" ? "on" : ""}>{planner ? t("cal.crewPlan") : t("cal.myWeek")}</Link>
    </nav>
  );
  return (
    <div className="page" style={{ maxWidth: 1240 }}>
      <div className="view-head"><h2>{t("nav.calendar")}</h2>{tabs}</div>
      <Notice ok={sp.ok} error={sp.error} />
      {view === "month" ? await MonthView({ sp, t, locale, planner }) : planner ? await CrewWeek({ sp, t, locale }) : await MyWeek({ t, locale, userId: user.id })}
    </div>
  );

  async function MonthView({ sp, t, locale, planner }: { sp: SP; t: T; locale: Locale; planner: boolean }) {
    const d = today();
    const m = isMonth(sp.m) ? sp.m : d.slice(0, 7);
    const grid = monthGrid(m);
    const [events, hol] = await Promise.all([eventsBetween(user, grid[0], grid.at(-1)!), holidaysBetween(grid[0], grid.at(-1)!)]);
    const available = TYPES.filter((ty) => events.some((e) => evType(e) === ty) || ty === "job");
    const shown = new Set(sp.show ? sp.show.split(",").filter((x) => (TYPES as readonly string[]).includes(x)) : TYPES);
    const visible = events.filter((e) => shown.has(evType(e) as (typeof TYPES)[number]));
    const byDay = new Map<string, CalEvent[]>();
    for (const e of visible) byDay.set(e.day, [...(byDay.get(e.day) ?? []), e]);
    const toggle = (ty: string) => {
      const next = new Set(shown); if (next.has(ty as (typeof TYPES)[number])) next.delete(ty as (typeof TYPES)[number]); else next.add(ty as (typeof TYPES)[number]);
      return `/calendar?m=${m}${next.size === TYPES.length ? "" : `&show=${[...next].join(",") || "none"}`}`;
    };
    const keep = sp.show ? `&show=${sp.show}` : "";
    const title = new Date(`${m}-01T00:00:00Z`).toLocaleDateString(INTL_LOCALE[locale], { month: "long", year: "numeric", timeZone: "UTC" });
    const year = m.slice(0, 4);
    const yearHol = planner ? await holidaysBetween(`${year}-01-01`, `${year}-12-31`) : new Map<string, string>();
    const agendaDays = grid.filter((x) => x.startsWith(m) && (byDay.has(x) || hol.has(x)));
    return (<>
      <div className="cal-bar">
        <Link className="btn small" href={`/calendar?m=${shiftMonth(m, -1)}${keep}`} aria-label={t("cal.prev")}>‹</Link>
        <h3 className="cal-title">{title}</h3>
        <Link className="btn small" href={`/calendar?m=${shiftMonth(m, 1)}${keep}`} aria-label={t("cal.next")}>›</Link>
        {m !== d.slice(0, 7) && <Link className="btn small" href={`/calendar?m=${d.slice(0, 7)}${keep}`}>{t("cal.today")}</Link>}
        <div className="chipbar cal-filter" style={{ marginLeft: "auto" }}>
          {available.map((ty) => (
            <Link key={ty} href={toggle(ty)} className={`chip plain filt ${shown.has(ty) ? "on" : ""}`} aria-pressed={shown.has(ty)}>{t(`cal.t.${ty}` as MessageKey)}</Link>
          ))}
        </div>
      </div>

      <div className="cal month-grid">
        {grid.slice(0, 7).map((x) => <div key={x} className="dow">{dayName(x, locale)}</div>)}
        {grid.map((x) => {
          const list = byDay.get(x) ?? [];
          const cls = [x.startsWith(m) ? "" : "out", x === d ? "today" : "", weekday(x) === 6 ? "sun" : "", hol.has(x) ? "hol" : ""].join(" ");
          return (
            <div key={x} className={`day ${cls}`}>
              <span className="dnum">{Number(x.slice(8))}{hol.has(x) && <small className="hol-name"> {hol.get(x)}</small>}</span>
              {list.slice(0, 4).map((e, i) => (
                <Link key={i} href={e.href} className={`ev plain ${e.type === "service" ? "pm" : ""} ${e.type === "overdue" ? "over" : ""} ${e.type === "absence" ? "away" : ""}`} style={{ ["--cat" as string]: evColor(e) }} title={evText(t, e)}>{evText(t, e)}</Link>
              ))}
              {list.length > 4 && <small className="muted more">{t("dash.more", { n: list.length - 4 })}</small>}
            </div>
          );
        })}
      </div>

      <div className="agenda panel">
        {agendaDays.map((x) => (
          <div key={x} className={`ag-day ${x === d ? "today" : ""}`}>
            <div className="ag-date"><b>{Number(x.slice(8))}</b><small>{dayName(x, locale)}</small></div>
            <div className="ag-list">
              {hol.has(x) && <span className="ag-hol">{hol.get(x)}</span>}
              {(byDay.get(x) ?? []).map((e, i) => (
                <Link key={i} href={e.href} className={`ev plain ${e.type === "service" ? "pm" : ""} ${e.type === "overdue" ? "over" : ""} ${e.type === "absence" ? "away" : ""}`} style={{ ["--cat" as string]: evColor(e) }}>{evText(t, e)}</Link>
              ))}
            </div>
          </div>
        ))}
        {agendaDays.length === 0 && <div className="empty">{t("cal.nothingMonth")}</div>}
      </div>

      <div className="legend">
        <span style={{ ["--cat" as string]: "var(--c-emg)" }}><i />{t("cal.lg.job")}</span>
        <span><i style={{ background: "transparent", border: "1px dashed var(--c-pm)" }} />{t("cal.t.service")}</span>
        {planner && <span style={{ ["--cat" as string]: "var(--c-minor)" }}><i />{t("cal.t.po")}</span>}
        <span style={{ ["--cat" as string]: "var(--muted)" }}><i />{t("cal.t.absence")}</span>
        <span><i style={{ background: "var(--hol)", border: "1px solid var(--c-paint)" }} />{t("cal.holiday")}</span>
      </div>

      {planner && (
        <details className="panel" id="holidays">
          <summary className="panel-head"><h3>{t("cal.holidays", { year })}</h3><span className="count">{yearHol.size}</span></summary>
          <div className="panel-body">
            {[...yearHol].map(([day, name]) => (
              <div key={day} className="hol-row">
                <span className="num">{fmtDate(day, true, locale)}</span><span>{name}</span>
                <form action={removeHoliday}>{hidden("day", day)}<button className="linkbtn muted" aria-label={`${t("common.remove")}: ${name}`}>✕</button></form>
              </div>
            ))}
            <form action={addHoliday} className="filters" style={{ padding: "8px 14px 14px" }}>
              {hidden("m", m)}
              <input type="date" name="day" required aria-label={t("col.date")} />
              <input name="name" required placeholder={t("cal.holidayName")} aria-label={t("cal.holidayName")} style={{ flex: "1 1 180px" }} />
              <SubmitButton className="btn small primary">{t("common.add")}</SubmitButton>
            </form>
          </div>
        </details>
      )}
    </>);
  }

  async function CrewWeek({ sp, t, locale }: { sp: SP; t: T; locale: Locale }) {
    const d = today();
    const start = isDay(sp.w) ? weekStart(sp.w) : planWeekStart(d), days = weekDays(start);
    const [staff, plan, hol, open] = await Promise.all([activeStaff(), planBetween(days[0], days.at(-1)!), holidaysBetween(days[0], days.at(-1)!), listJobs(user, { open: true })]);
    const crew = staff.filter((s) => CREW_ROLES.includes(s.role));
    const jobs = [...open].sort((a, b) => plate(a).localeCompare(plate(b)));
    const at = (sid: number, day: string) => plan.find((p) => p.staffId === sid && p.day === day);
    const jobById = new Map(open.map((j) => [j.id, j]));
    const span = `${fmtDate(days[0], false, locale)} – ${fmtDate(days.at(-1), true, locale)}`;
    return (<>
      <div className="cal-bar">
        <Link className="btn small" href={`/calendar?view=week&w=${addDays(start, -7)}`} aria-label={t("cal.prevWeek")}>‹</Link>
        <h3 className="cal-title">{span}</h3>
        <Link className="btn small" href={`/calendar?view=week&w=${addDays(start, 7)}`} aria-label={t("cal.nextWeek")}>›</Link>
        {start !== planWeekStart(d) && <Link className="btn small" href="/calendar?view=week">{t("cal.thisWeek")}</Link>}
        <form action={copyLastWeek} style={{ marginLeft: "auto" }}>{hidden("week", start)}<SubmitButton className="btn small">{t("cal.copyLast")}</SubmitButton></form>
      </div>
      <p className="hint" style={{ margin: 0 }}>{t("cal.planHelp")}</p>
      <form action={savePlan} className="stack" style={{ gap: 10 }}>
        {hidden("week", start)}
        <div className="tbl-wrap plan-wrap">
          <table className="plan">
            <thead><tr><th>{t("col.person")}</th>{days.map((x) => {
              const on = plan.filter((p) => p.day === x && p.kind === "job").length, away = plan.filter((p) => p.day === x && p.kind !== "job").length;
              return (
                <th key={x} className={`${x === d ? "today" : ""} ${hol.has(x) ? "hol" : ""}`}>
                  <span>{dayName(x, locale)} {fmtDate(x, false, locale)}</span>
                  {hol.has(x) ? <small className="hol-name">{hol.get(x)}</small> : <small className="muted">{t("cal.colCount", { on, away })}</small>}
                </th>
              );
            })}</tr></thead>
            <tbody>
              {crew.map((s) => (
                <tr key={s.id}>
                  <th scope="row"><b>{s.name}</b><small className="muted">{roleLabel(t, s.role)}</small></th>
                  {days.map((x) => {
                    const p = at(s.id, x);
                    const val = p ? (p.kind === "job" ? String(p.jobId ?? "") : p.kind) : "";
                    const j = p?.jobId ? jobById.get(p.jobId) : undefined;
                    return (
                      <td key={x} className={`plan-cell k-${p?.kind ?? "none"} ${x === d ? "today" : ""} ${hol.has(x) ? "hol" : ""}`} style={j ? { ["--cat" as string]: catColor(j.category) } : undefined}>
                        <select className="field" name={`c_${s.id}_${x}`} defaultValue={val} aria-label={`${s.name} ${fmtDate(x, false, locale)}`}>
                          <option value="">{t("cal.notPlanned")}</option>
                          <optgroup label={t("cal.away")}>{ABSENCE.map((k) => <option key={k} value={k}>{absenceLabel(t, k)}</option>)}</optgroup>
                          <optgroup label={t("nav.jobs")}>{jobs.map((jj) => <option key={jj.id} value={jj.id}>{plate(jj)} · {itemLabel(t, "job_category", jj.category)}</option>)}</optgroup>
                          {p?.kind === "job" && !j && <option value={val}>{t("cal.closedJob")}</option>}
                        </select>
                        {j && <small className="plan-where">{j.siteType === "field" ? t("dash.field", { place: j.siteLocation.split(",")[0] }) : j.siteLocation ? placeLabel(t, j.siteLocation) : t("loc.tbd")}</small>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {crew.length === 0 ? <div className="panel empty">{t("dash.addCrew")}</div> : <div><SubmitButton className="btn primary">{t("cal.savePlan")}</SubmitButton></div>}
      </form>
    </>);
  }

  async function MyWeek({ t, locale, userId }: { t: T; locale: Locale; userId: number }) {
    const d = today();
    const start = planWeekStart(d), days = [...weekDays(start), ...weekDays(addDays(start, 7))];
    const [plan, hol, open] = await Promise.all([planBetween(days[0], days.at(-1)!, userId), holidaysBetween(days[0], days.at(-1)!), listJobs(user, { open: true })]);
    const jobById = new Map(open.map((j) => [j.id, j]));
    return (
      <div className="panel">
        <div className="panel-body">
          {days.map((x, i) => {
            const p = plan.find((q) => q.day === x);
            const j = p?.jobId ? jobById.get(p.jobId) : undefined;
            return (<div key={x}>
              {i === 6 && <div className="svc-group">{t("cal.nextWeekLabel")}</div>}
              {i === 0 && <div className="svc-group">{t("cal.thisWeek")}</div>}
              <div className={`ag-day ${x === d ? "today" : ""} ${x < d ? "past" : ""}`}>
                <div className="ag-date"><b>{Number(x.slice(8))}</b><small>{dayName(x, locale)}</small></div>
                <div className="ag-list">
                  {hol.has(x) && <span className="ag-hol">{hol.get(x)}</span>}
                  {j ? <Link href={`/jobs/${j.id}`} className="ev plain" style={{ ["--cat" as string]: catColor(j.category) }}>{plate(j)} · {j.make} {j.model} · {j.siteType === "field" ? t("dash.field", { place: j.siteLocation.split(",")[0] }) : j.siteLocation ? placeLabel(t, j.siteLocation) : t("loc.tbd")}</Link>
                    : p && p.kind !== "job" ? <span className="ev away" style={{ ["--cat" as string]: "var(--muted)" }}>{absenceLabel(t, p.kind as PlanKind)}</span>
                    : !hol.has(x) && <span className="muted" style={{ fontSize: ".82rem" }}>{t("cal.notPlannedYet")}</span>}
                </div>
              </div>
            </div>);
          })}
        </div>
      </div>
    );
  }
}
