import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { addDays, fmtDate, today } from "@/lib/format";
import { isDay, isMonth, monthGrid, shiftMonth, weekday } from "@/lib/calendar";
import { ATT_CODE, ATT_STATUSES, tally, type AttStatus } from "@/lib/attendance";
import { attendanceBetween, sheetStaff } from "@/lib/attendance-server";
import { holidaysBetween, planBetween } from "@/lib/calendar-server";
import { getI18n } from "@/i18n/server";
import { INTL_LOCALE, type Locale, type MessageKey, type T } from "@/i18n";
import { roleLabel } from "@/i18n/labels";
import { Notice } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { markAllPresent, saveAttendance } from "./actions";

export async function generateMetadata() {
  return { title: (await getI18n()).t("att.title") };
}

type SP = { d?: string; m?: string; view?: string; ok?: string; error?: string };
const label = (t: T, s: AttStatus) => t(`att.s.${s}` as MessageKey);
const hidden = (n: string, v: string) => <input type="hidden" name={n} value={v} />;
const longDay = (iso: string, locale: Locale) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(INTL_LOCALE[locale], { weekday: "long", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async function AttendancePage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const { t, locale } = await getI18n();
  const sp = await searchParams;
  const planner = can(user.role, "job.assign");
  const view = planner && sp.view !== "month" && !sp.m ? "day" : "month";
  return (
    <div className="page" style={{ maxWidth: 1240 }}>
      <div className="view-head">
        <h2>{t("att.title")}</h2>
        {planner && (
          <nav className="cal-tabs" aria-label={t("att.title")}>
            <Link href="/team/attendance" className={view === "day" ? "on" : ""}>{t("att.daily")}</Link>
            <Link href="/team/attendance?view=month" className={view === "month" ? "on" : ""}>{t("att.monthly")}</Link>
          </nav>
        )}
      </div>
      <Notice ok={sp.ok} error={sp.error} />
      {view === "day" ? await DaySheet() : await MonthSummary()}
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
      <form action={saveAttendance} className="stack" style={{ gap: 10 }}>
        {hidden("day", day)}
        <div className="panel att-sheet">
          {people.map((p) => {
            const r = rows.find((x) => x.staffId === p.id);
            const planned = plan.find((x) => x.staffId === p.id && x.kind !== "job")?.kind as AttStatus | undefined;
            const cur = r?.status ?? planned ?? "";
            return (
              <div key={p.id} className={`att-row ${r ? "" : "unmarked"}`}>
                <div className="att-who"><b>{p.name}</b><small className="muted">{roleLabel(t, p.role)}{!r && planned ? ` · ${t("att.fromPlan")}` : !r ? ` · ${t("att.notMarked")}` : ""}</small></div>
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
            <th className="r">{t("att.worked")}</th><th className="r">{t("att.s.late")}</th><th className="r">{t("att.s.mc")}</th><th className="r">{t("att.s.leave")}</th><th className="r">{t("att.s.absent")}</th>
            {days.map((x) => <th key={x} className={`dcol ${weekday(x) === 6 ? "sun" : ""} ${x === d0 ? "today" : ""}`}>{planner ? <Link href={`/team/attendance?d=${x}`} className="plain">{Number(x.slice(8))}</Link> : Number(x.slice(8))}</th>)}
          </tr></thead>
          <tbody>
            {people.map((p) => {
              const mine = rows.filter((r) => r.staffId === p.id), n = tally(mine);
              return (
                <tr key={p.id}>
                  <th scope="row"><b>{p.name}</b><small className="muted">{roleLabel(t, p.role)}</small></th>
                  <td className="r num"><b>{n.worked}</b></td><td className="r num">{n.late || ""}</td><td className="r num">{n.mc || ""}</td><td className="r num">{n.leave || ""}</td><td className={`r num ${n.absent ? "due over" : ""}`}>{n.absent || ""}</td>
                  {days.map((x) => { const r = mine.find((y) => y.day === x); return <td key={x} className={`dcol ${r ? `s-${r.status}` : ""} ${weekday(x) === 6 ? "sun" : ""}`} title={r ? `${fmtDate(x, false, locale)} · ${label(t, r.status)}${r.timeIn ? ` · ${r.timeIn}` : ""}${r.timeOut ? `–${r.timeOut}` : ""}${r.note ? ` · ${r.note}` : ""}` : undefined}>{r ? ATT_CODE[r.status] : ""}</td>; })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint" style={{ margin: 0 }}>{ATT_STATUSES.map((s) => `${ATT_CODE[s]} = ${label(t, s)}`).join(" · ")}. {t("att.workedHelp")}</p>
    </>);
  }
}
