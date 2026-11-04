import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { addDays, fmtDate, today } from "@/lib/format";
import { isDay, isMonth, monthGrid, shiftMonth, weekday } from "@/lib/calendar";
import { ATT_CODE, ATT_STATUSES, attHours, hoursAtWork, sumHours, tally, utilisation, type AttStatus } from "@/lib/attendance";
import { jobTitle } from "@/lib/jobs";
import { parseBreaks } from "@/lib/pay";
import { attendanceBetween, labourBetween, sheetStaff } from "@/lib/attendance-server";
import { holidaysBetween, planBetween } from "@/lib/calendar-server";
import { getI18n } from "@/i18n/server";
import { INTL_LOCALE, type Locale, type MessageKey, type T } from "@/i18n";
import { roleLabel } from "@/i18n/labels";
import { Notice } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import AttendanceTimes from "@/components/AttendanceTimes";
import { settings } from "@/lib/lists";
import { markAllPresent, saveAttendance } from "./actions";

export async function generateMetadata() {
  return { title: (await getI18n()).t("att.title") };
}

type SP = { d?: string; m?: string; view?: string; p?: string; ok?: string; error?: string };
const label = (t: T, s: AttStatus) => t(`att.s.${s}` as MessageKey);
const hidden = (n: string, v: string) => <input type="hidden" name={n} value={v} />;
const longDay = (iso: string, locale: Locale) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(INTL_LOCALE[locale], { weekday: "long", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async function AttendancePage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const { t, locale } = await getI18n();
  const sp = await searchParams;
  const planner = can(user.role, "job.assign");
  const view = planner && sp.view === "util" ? (sp.p ? "utilPerson" : "util") : sp.p ? "person" : planner && sp.view !== "month" && !sp.m ? "day" : "month";
  // Hours at work: clock in to out, less the company breaks; after the end of the normal day counts as overtime.
  const hOpts = { breaks: parseBreaks(settings().breaks), otStart: settings().otStart };
  const uOpts = { ...hOpts, workStart: settings().workStart, workEnd: settings().workEnd };
  const hrs = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));
  return (
    <div className="page" style={{ maxWidth: 1240 }}>
      <div className="view-head">
        <h2>{t("att.title")}</h2>
        {planner && (
          <nav className="cal-tabs" aria-label={t("att.title")}>
            <Link href="/team/attendance" className={view === "day" ? "on" : ""}>{t("att.daily")}</Link>
            <Link href="/team/attendance?view=month" className={view === "month" ? "on" : ""}>{t("att.monthly")}</Link>
            <Link href="/team/attendance?view=util" className={view.startsWith("util") ? "on" : ""}>{t("util.tab")}</Link>
          </nav>
        )}
      </div>
      <Notice ok={sp.ok} error={sp.error} />
      {view === "day" ? await DaySheet() : view === "person" ? await PersonMonth() : view === "util" ? await UtilMonth() : view === "utilPerson" ? await UtilPerson() : await MonthSummary()}
    </div>
  );

  async function DaySheet() {
    const d0 = today();
    const day = isDay(sp.d) && sp.d <= d0 ? sp.d : d0;
    const [people, rows, plan, hol] = await Promise.all([sheetStaff(), attendanceBetween(day, day), planBetween(day, day), holidaysBetween(day, day)]);
    const unmarked = people.filter((p) => !rows.some((r) => r.staffId === p.id)).length;
    return (<>
      <div className="cal-bar">
        <Link className="btn small" href={`/team/attendance?d=${addDays(day, -1)}`} aria-label={t("att.prevDay")}>‹</Link>
        <h3 className="cal-title">{longDay(day, locale)}</h3>
        {day < d0 && <Link className="btn small" href={`/team/attendance?d=${addDays(day, 1)}`} aria-label={t("att.nextDay")}>›</Link>}
        {day !== d0 && <Link className="btn small" href="/team/attendance">{t("cal.today")}</Link>}
        {unmarked > 0 && people.length > 0 && (
          <form action={markAllPresent} style={{ marginLeft: "auto" }}>{hidden("day", day)}<SubmitButton className="btn small">{t("att.markAll", { n: unmarked })}</SubmitButton></form>
        )}
      </div>
      {(weekday(day) === 6 || hol.has(day)) && <p className="hint" style={{ margin: 0 }}>{hol.get(day) ?? t("att.sunday")}</p>}
      <p className="muted" style={{ margin: 0 }}>{t("att.summaryLine", { marked: people.length - unmarked, n: people.length })}</p>
      {/* key: a fresh form for each day, so one day's times and notes never carry over to the next */}
      <form key={day} action={saveAttendance} className="stack" style={{ gap: 10 }} id="att-sheet">
        <AttendanceTimes formId="att-sheet" start={settings().workStart} end={settings().workEnd} />
        {hidden("day", day)}
        <div className="panel att-sheet">
          {people.map((p) => {
            const r = rows.find((x) => x.staffId === p.id);
            const planned = plan.find((x) => x.staffId === p.id && x.kind !== "job")?.kind as AttStatus | undefined;
            const cur = r?.status ?? planned ?? "";
            return (
              <div key={p.id} className={`att-row ${r ? "" : "unmarked"}`}>
                <div className="att-who"><b>{p.name}</b><small className="muted">{roleLabel(t, p.role)}{!r && planned ? ` · ${t("att.fromPlan")}` : !r ? ` · ${t("att.notMarked")}` : ""}</small>
                  {(() => { const h = r ? attHours(r.timeIn, r.timeOut, hOpts) : null; return h ? <small className="att-hrs">{t("att.hoursLine", { h: hrs(h.total) })}{h.ot ? ` · ${t("att.otLine", { h: hrs(h.ot) })}` : ""}</small> : null; })()}</div>
                <div className="att-pick" role="radiogroup" aria-label={p.name}>
                  {ATT_STATUSES.map((s) => (
                    <label key={s} className={`att-opt s-${s}`}><input type="radio" name={`s_${p.id}`} value={s} defaultChecked={cur === s} /><span>{label(t, s)}</span></label>
                  ))}
                  <input type="hidden" name={`s_${p.id}`} value="" />
                </div>
                <div className="att-extra">
                  <input type="time" name={`in_${p.id}`} defaultValue={r?.timeIn ?? ""} aria-label={`${p.name} ${t("att.in")}`} title={t("att.in")} />
                  <input type="time" name={`out_${p.id}`} defaultValue={r?.timeOut ?? ""} aria-label={`${p.name} ${t("att.out")}`} title={t("att.out")} />
                  <input name={`n_${p.id}`} defaultValue={r?.note ?? ""} placeholder={t("att.note")} aria-label={`${p.name} ${t("att.note")}`} />
                </div>
              </div>
            );
          })}
          {people.length === 0 && <div className="empty">{t("dash.addCrew")}</div>}
        </div>
        {people.length > 0 && <div><SubmitButton className="btn primary">{t("att.save")}</SubmitButton></div>}
      </form>
    </>);
  }

  async function MonthSummary() {
    const d0 = today();
    const m = isMonth(sp.m) ? sp.m : d0.slice(0, 7);
    const days = monthGrid(m).filter((x) => x.startsWith(m));
    const people = planner ? await sheetStaff() : [{ id: user.id, name: user.name, role: user.role }];
    const rows = await attendanceBetween(days[0], days.at(-1)!, planner ? undefined : user.id);
    const title = new Date(`${m}-01T00:00:00Z`).toLocaleDateString(INTL_LOCALE[locale], { month: "long", year: "numeric", timeZone: "UTC" });
    return (<>
      <div className="cal-bar">
        <Link className="btn small" href={`/team/attendance?m=${shiftMonth(m, -1)}`} aria-label={t("cal.prev")}>‹</Link>
        <h3 className="cal-title">{title}</h3>
        <Link className="btn small" href={`/team/attendance?m=${shiftMonth(m, 1)}`} aria-label={t("cal.next")}>›</Link>
        {planner && <a className="btn small" style={{ marginLeft: "auto" }} href={`/api/attendance?m=${m}`} download>{t("att.download")}</a>}
      </div>
      <div className="tbl-wrap">
        <table className="att-month">
          <thead><tr>
            <th>{t("col.person")}</th>
            <th className="r">{t("att.worked")}</th><th className="r">{t("att.hoursCol")}</th><th className="r">{t("att.otCol")}</th><th className="r">{t("att.s.late")}</th><th className="r">{t("att.s.mc")}</th><th className="r">{t("att.s.leave")}</th><th className="r">{t("att.s.absent")}</th>
            {days.map((x) => <th key={x} className={`dcol ${weekday(x) === 6 ? "sun" : ""} ${x === d0 ? "today" : ""}`}>{planner ? <Link href={`/team/attendance?d=${x}`} className="plain">{Number(x.slice(8))}</Link> : Number(x.slice(8))}</th>)}
          </tr></thead>
          <tbody>
            {people.map((p) => {
              const mine = rows.filter((r) => r.staffId === p.id), n = tally(mine), h = sumHours(mine, hOpts);
              return (
                <tr key={p.id}>
                  <th scope="row"><Link href={`/team/attendance?p=${p.id}&m=${m}`} className="plain"><b>{p.name}</b></Link><small className="muted">{roleLabel(t, p.role)}</small></th>
                  <td className="r num"><b>{n.worked}</b></td><td className="r num">{h.total ? hrs(h.total) : ""}</td><td className="r num">{h.ot ? hrs(h.ot) : ""}</td><td className="r num">{n.late || ""}</td><td className="r num">{n.mc || ""}</td><td className="r num">{n.leave || ""}</td><td className={`r num ${n.absent ? "due over" : ""}`}>{n.absent || ""}</td>
                  {days.map((x) => { const r = mine.find((y) => y.day === x); return <td key={x} className={`dcol ${r ? `s-${r.status}` : ""} ${weekday(x) === 6 ? "sun" : ""}`} title={r ? `${fmtDate(x, false, locale)} · ${label(t, r.status)}${r.timeIn ? ` · ${r.timeIn}` : ""}${r.timeOut ? `–${r.timeOut}` : ""}${attHours(r.timeIn, r.timeOut, hOpts) ? ` (${hrs(attHours(r.timeIn, r.timeOut, hOpts)!.total)} h)` : ""}${r.note ? ` · ${r.note}` : ""}` : undefined}>{r ? ATT_CODE[r.status] : ""}</td>; })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint" style={{ margin: 0 }}>{ATT_STATUSES.map((s) => `${ATT_CODE[s]} = ${label(t, s)}`).join(" · ")}. {t("att.workedHelp")} {t("att.hoursHelp")}</p>
    </>);
  }

  /** One person's month, day by day: status, clock in / out, hours, overtime and note, with totals. */
  async function PersonMonth() {
    const d0 = today();
    const m = isMonth(sp.m) ? sp.m : d0.slice(0, 7);
    const pid = planner ? Number(sp.p) : user.id;
    const person = (await sheetStaff()).find((x) => x.id === pid) ?? (pid === user.id ? { id: user.id, name: user.name, role: user.role } : null);
    if (!person) return <div className="notice err">{t("att.noPerson")}</div>;
    const monthDays = monthGrid(m).filter((x) => x.startsWith(m)), days = monthDays.filter((x) => x <= d0);
    const rows = await attendanceBetween(monthDays[0], monthDays.at(-1)!, person.id);
    const n = tally(rows), h = sumHours(rows, hOpts);
    const title = new Date(`${m}-01T00:00:00Z`).toLocaleDateString(INTL_LOCALE[locale], { month: "long", year: "numeric", timeZone: "UTC" });
    const base = `/team/attendance?p=${person.id}&m=`;
    return (<>
      <div className="cal-bar">
        <Link className="btn small" href={base + shiftMonth(m, -1)} aria-label={t("cal.prev")}>‹</Link>
        <h3 className="cal-title">{person.name} · {title}</h3>
        <Link className="btn small" href={base + shiftMonth(m, 1)} aria-label={t("cal.next")}>›</Link>
        <Link className="btn small" style={{ marginLeft: "auto" }} href={`/team/attendance?m=${m}`}>{t("att.backToMonth")}</Link>
      </div>
      <nav className="sum" aria-label={person.name}>
        <div><b>{n.worked}</b><span>{t("att.worked")}</span></div>
        <div><b>{hrs(h.total)}</b><span>{t("att.hoursCol")}</span></div>
        <div><b>{hrs(h.ot)}</b><span>{t("att.otCol")}</span></div>
        <div><b>{n.late}</b><span>{t("att.s.late")}</span></div>
        <div><b>{n.mc + n.leave}</b><span>{t("att.s.mc")} / {t("att.s.leave")}</span></div>
        <div><b className={n.absent ? "due over" : ""}>{n.absent}</b><span>{t("att.s.absent")}</span></div>
      </nav>
      <div className="tbl-wrap"><table>
        <thead><tr><th>{t("col.date")}</th><th>{t("col.status")}</th><th>{t("att.in")}</th><th>{t("att.out")}</th><th className="r">{t("att.hoursCol")}</th><th className="r">{t("att.otCol")}</th><th>{t("att.note")}</th></tr></thead>
        <tbody>{[...days].reverse().map((x) => {
          const r = rows.find((y) => y.day === x), hh = r ? attHours(r.timeIn, r.timeOut, hOpts) : null;
          return (
            <tr key={x} className={weekday(x) === 6 ? "muted" : ""}>
              <td className="num">{planner ? <Link href={`/team/attendance?d=${x}`}>{fmtDate(x, false, locale)}</Link> : fmtDate(x, false, locale)}</td>
              <td>{r ? <span className={`att-tag s-${r.status}`}>{label(t, r.status)}</span> : <span className="muted">—</span>}</td>
              <td className="num">{r?.timeIn ?? ""}</td><td className="num">{r?.timeOut ?? ""}</td>
              <td className="r num">{hh ? hrs(hh.total) : ""}</td><td className="r num">{hh?.ot ? hrs(hh.ot) : ""}</td>
              <td>{r?.note ?? ""}</td>
            </tr>);
        })}</tbody>
        <tfoot><tr><td colSpan={4}><b>{t("att.total")}</b></td><td className="r num"><b>{hrs(h.total)}</b></td><td className="r num"><b>{hrs(h.ot)}</b></td><td /></tr></tfoot>
      </table></div>
      <p className="hint" style={{ margin: 0 }}>{t("att.hoursHelp")}</p>
    </>);
  }

  /** Utilisation: hours at work (attendance) against hours logged on work orders, per person for a month. */
  async function UtilMonth() {
    const d0 = today();
    const m = isMonth(sp.m) ? sp.m : d0.slice(0, 7);
    const days = monthGrid(m).filter((x) => x.startsWith(m) && x <= d0);
    const all = monthGrid(m).filter((x) => x.startsWith(m));
    const [people, att, lab] = await Promise.all([sheetStaff(), attendanceBetween(all[0], all.at(-1)!), labourBetween(all[0], all.at(-1)!)]);
    const title = new Date(`${m}-01T00:00:00Z`).toLocaleDateString(INTL_LOCALE[locale], { month: "long", year: "numeric", timeZone: "UTC" });
    const per = people.map((p) => {
      const cells = days.map((x) => {
        const at = hoursAtWork(att.find((r) => r.staffId === p.id && r.day === x), uOpts);
        const logged = lab.filter((l) => l.staffId === p.id && l.day === x).reduce((a, l) => a + Number(l.hours), 0);
        return { day: x, at, logged, ...utilisation(at, logged) };
      });
      const at = cells.reduce((a, c) => a + c.at, 0), logged = cells.reduce((a, c) => a + c.logged, 0);
      return { p, cells, at, logged, ...utilisation(at, logged), noneDays: cells.filter((c) => c.flag === "none").length, lowDays: cells.filter((c) => c.flag === "low").length };
    });
    const team = utilisation(per.reduce((a, x) => a + x.at, 0), per.reduce((a, x) => a + x.logged, 0));
    return (<>
      <div className="cal-bar">
        <Link className="btn small" href={`/team/attendance?view=util&m=${shiftMonth(m, -1)}`} aria-label={t("cal.prev")}>‹</Link>
        <h3 className="cal-title">{title}</h3>
        <Link className="btn small" href={`/team/attendance?view=util&m=${shiftMonth(m, 1)}`} aria-label={t("cal.next")}>›</Link>
      </div>
      <p className="muted" style={{ margin: 0 }}>{t("util.intro")}</p>
      <nav className="sum" aria-label={t("util.tab")}>
        <div><b>{hrs(per.reduce((a, x) => a + x.at, 0))}</b><span>{t("util.atWork")}</span></div>
        <div><b>{hrs(per.reduce((a, x) => a + x.logged, 0))}</b><span>{t("util.logged")}</span></div>
        <div><b className={team.pct !== null && team.pct < 50 ? "due over" : ""}>{team.pct ?? "—"}%</b><span>{t("util.pct")}</span></div>
        <div><b className="due over">{per.reduce((a, x) => a + x.noneDays, 0)}</b><span>{t("util.noneDays")}</span></div>
      </nav>
      <div className="tbl-wrap">
        <table className="att-month util">
          <thead><tr>
            <th>{t("col.person")}</th><th className="r" title={t("util.atWork")}>{t("util.hAt")}</th><th className="r" title={t("util.logged")}>{t("util.hLogged")}</th><th className="r" title={t("util.idle")}>{t("util.hIdle")}</th><th className="r">%</th><th className="r" title={t("util.noneDaysShort")}>{t("util.hNone")}</th>
            {days.map((x) => <th key={x} className={`dcol ${weekday(x) === 6 ? "sun" : ""}`}>{Number(x.slice(8))}</th>)}
          </tr></thead>
          <tbody>{per.map((x) => (
            <tr key={x.p.id}>
              <th scope="row"><Link href={`/team/attendance?view=util&p=${x.p.id}&m=${m}`} className="plain"><b>{x.p.name}</b></Link><small className="muted">{roleLabel(t, x.p.role)}</small></th>
              <td className="r num">{hrs(x.at)}</td><td className="r num">{hrs(x.logged)}</td><td className="r num">{x.idle ? hrs(x.idle) : ""}</td>
              <td className={`r num ${x.flag === "none" || x.flag === "low" ? "due over" : ""}`}><b>{x.pct === null ? "—" : `${x.pct}%`}</b></td>
              <td className={`r num ${x.noneDays ? "due over" : ""}`}>{x.noneDays || ""}</td>
              {x.cells.map((c) => <td key={c.day} className={`dcol u-${c.flag || "off"} ${weekday(c.day) === 6 ? "sun" : ""}`} title={`${fmtDate(c.day, false, locale)} · ${t("util.cellTitle", { at: hrs(c.at), logged: hrs(c.logged) })}`}>{c.at || c.logged ? hrs(c.logged) : ""}</td>)}
            </tr>))}</tbody>
        </table>
      </div>
      <p className="hint" style={{ margin: 0 }}><span className="u-key u-none">0</span> {t("util.keyNone")} · <span className="u-key u-low">2</span> {t("util.keyLow")} · <span className="u-key u-ok">7</span> {t("util.keyOk")} · <span className="u-key u-over">9</span> {t("util.keyOver")}. {t("util.cellHelp")}</p>
    </>);
  }

  /** One person's utilisation for a month, day by day, with the work orders they logged time on. */
  async function UtilPerson() {
    const d0 = today();
    const m = isMonth(sp.m) ? sp.m : d0.slice(0, 7);
    const pid = Number(sp.p);
    const person = (await sheetStaff()).find((x) => x.id === pid);
    if (!person) return <div className="notice err">{t("att.noPerson")}</div>;
    const all = monthGrid(m).filter((x) => x.startsWith(m)), days = all.filter((x) => x <= d0);
    const [att, lab] = await Promise.all([attendanceBetween(all[0], all.at(-1)!, pid), labourBetween(all[0], all.at(-1)!, pid)]);
    const title = new Date(`${m}-01T00:00:00Z`).toLocaleDateString(INTL_LOCALE[locale], { month: "long", year: "numeric", timeZone: "UTC" });
    const rowsU = days.map((x) => {
      const r = att.find((a) => a.day === x), entries = lab.filter((l) => l.day === x);
      const at = hoursAtWork(r, uOpts), logged = entries.reduce((a, l) => a + Number(l.hours), 0);
      return { day: x, r, entries, at, logged, ...utilisation(at, logged) };
    });
    const at = rowsU.reduce((a, x) => a + x.at, 0), logged = rowsU.reduce((a, x) => a + x.logged, 0), u = utilisation(at, logged);
    const base = `/team/attendance?view=util&p=${pid}&m=`;
    return (<>
      <div className="cal-bar">
        <Link className="btn small" href={base + shiftMonth(m, -1)} aria-label={t("cal.prev")}>‹</Link>
        <h3 className="cal-title">{person.name} · {title}</h3>
        <Link className="btn small" href={base + shiftMonth(m, 1)} aria-label={t("cal.next")}>›</Link>
        <Link className="btn small" style={{ marginLeft: "auto" }} href={`/team/attendance?view=util&m=${m}`}>{t("att.backToMonth")}</Link>
      </div>
      <nav className="sum" aria-label={person.name}>
        <div><b>{hrs(at)}</b><span>{t("util.atWork")}</span></div>
        <div><b>{hrs(logged)}</b><span>{t("util.logged")}</span></div>
        <div><b>{hrs(u.idle)}</b><span>{t("util.idle")}</span></div>
        <div><b className={u.flag === "low" || u.flag === "none" ? "due over" : ""}>{u.pct ?? "—"}%</b><span>{t("util.pct")}</span></div>
        <div><b className="due over">{rowsU.filter((x) => x.flag === "none").length}</b><span>{t("util.noneDays")}</span></div>
      </nav>
      <div className="tbl-wrap"><table className="util-days">
        <thead><tr><th>{t("col.date")}</th><th>{t("col.status")}</th><th>{t("util.clock")}</th><th className="r">{t("util.atWork")}</th><th className="r">{t("util.logged")}</th><th>{t("util.workOrders")}</th><th className="r">{t("util.idle")}</th><th /></tr></thead>
        <tbody>{[...rowsU].reverse().map((x) => (
          <tr key={x.day} className={x.flag === "none" ? "u-row-none" : weekday(x.day) === 6 && !x.at ? "muted" : ""}>
            <td className="num"><Link href={`/team/attendance?d=${x.day}`}>{fmtDate(x.day, false, locale)}</Link></td>
            <td>{x.r ? label(t, x.r.status) : "—"}</td>
            <td className="num">{x.r?.timeIn ? `${x.r.timeIn}–${x.r.timeOut ?? ""}` : ""}</td>
            <td className="r num">{x.at ? hrs(x.at) : ""}</td><td className="r num">{x.logged ? hrs(x.logged) : ""}</td>
            <td>{x.entries.map((l, i) => <div key={i}><Link href={`/jobs/${l.jobId}`} className="mono">{l.jobNo}</Link> <small className="muted">{l.timeFrom ? `${l.timeFrom}–${l.timeTo} · ` : ""}{hrs(Number(l.hours))} h · {jobTitle(l)}</small></div>)}</td>
            <td className="r num">{x.idle ? hrs(x.idle) : ""}</td>
            <td>{x.flag && x.flag !== "ok" ? <span className={`pill ${x.flag === "over" ? "info" : "crit"}`}>{t(`util.flag.${x.flag}`)}</span> : null}</td>
          </tr>))}</tbody>
        <tfoot><tr><td colSpan={3}><b>{t("att.total")}</b></td><td className="r num"><b>{hrs(at)}</b></td><td className="r num"><b>{hrs(logged)}</b></td><td /><td className="r num"><b>{hrs(u.idle)}</b></td><td /></tr></tfoot>
      </table></div>
      <p className="hint" style={{ margin: 0 }}>{t("util.intro")}</p>
    </>);
  }
}
