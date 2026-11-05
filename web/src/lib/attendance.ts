/** Attendance statuses and the monthly tally. Pure module. */
import { splitHours } from "./pay";
export const ATT_STATUSES = ["present", "late", "half", "leave", "mc", "absent", "off"] as const;
export type AttStatus = (typeof ATT_STATUSES)[number];
export const isAttStatus = (x: unknown): x is AttStatus => typeof x === "string" && (ATT_STATUSES as readonly string[]).includes(x);
/** Short code for the month grid. */
export const ATT_CODE: Record<AttStatus, string> = { present: "P", late: "L", half: "½", leave: "LV", mc: "MC", absent: "A", off: "—" };

/** Days worked for a person in a month: present and late count 1, half day 0.5. */
export function tally(rows: { status: AttStatus }[]) {
  const n = Object.fromEntries(ATT_STATUSES.map((s) => [s, 0])) as Record<AttStatus, number>;
  for (const r of rows) n[r.status]++;
  return { ...n, worked: n.present + n.late + n.half * 0.5 };
}

/** Hours at work from clock in / out, less the company breaks, split at the end of the normal day (after it = overtime).
 *  null when either time is missing or they make no sense. */
export function attHours(timeIn: string | null, timeOut: string | null, opts: { breaks: [number, number][]; otStart: string }): { normal: number; ot: number; total: number } | null {
  if (!timeIn || !timeOut) return null;
  const s = splitHours(timeIn, timeOut, opts.otStart, opts.breaks);
  return s ? { ...s, total: Math.round((s.normal + s.ot) * 100) / 100 } : null;
}

/** Hours for a person over many days: total, overtime, and how many days had both times. */
export function sumHours(rows: { timeIn: string | null; timeOut: string | null }[], opts: { breaks: [number, number][]; otStart: string }) {
  return rows.reduce((a, r) => { const h = attHours(r.timeIn, r.timeOut, opts); return h ? { total: a.total + h.total, ot: a.ot + h.ot, days: a.days + 1 } : a; }, { total: 0, ot: 0, days: 0 });
}

/** Hours a person was at work on a day, for comparing with time logged on work orders: from clock in / out; a Present or
 *  Late day without times counts as the normal working day, a half day as half of it; other statuses 0. */
export function hoursAtWork(r: { status: AttStatus; timeIn: string | null; timeOut: string | null } | undefined,
  opts: { breaks: [number, number][]; otStart: string; workStart: string; workEnd: string }): number {
  if (!r || !["present", "late", "half"].includes(r.status)) return 0;
  const h = attHours(r.timeIn, r.timeOut, opts) ?? attHours(opts.workStart, opts.workEnd, opts);
  if (!h) return 0;
  return r.status === "half" && !(r.timeIn && r.timeOut) ? Math.round((h.total / 2) * 100) / 100 : h.total;
}

export type UtilFlag = "none" | "low" | "ok" | "over" | "";
/** How much of the time at work was logged on work orders: none (at work, nothing logged), low (under `lowPct`%),
 *  ok, over (more logged than at work: check the times). "" when not at work and nothing logged. */
export function utilisation(atWork: number, logged: number, lowPct = 50): { pct: number | null; idle: number; flag: UtilFlag } {
  if (atWork <= 0) return { pct: null, idle: 0, flag: logged > 0 ? "over" : "" };
  const pct = Math.round((logged / atWork) * 100), idle = Math.max(0, Math.round((atWork - logged) * 100) / 100);
  return { pct, idle, flag: logged <= 0 ? "none" : logged > atWork + 0.25 ? "over" : pct < lowPct ? "low" : "ok" };
}

/** What a day at work costs: normal hours at the hourly rate, hours after the end of the normal day at the overtime rate,
 *  a Sunday all at the Sunday rate (unless the person is not paid overtime). Uses `hoursAtWork` for days without times. */
export function costAtWork(r: { status: AttStatus; timeIn: string | null; timeOut: string | null } | undefined, day: string, rate: number,
  opts: { breaks: [number, number][]; otStart: string; workStart: string; workEnd: string; otMultiplier: number; sundayMultiplier: number; noOvertime?: boolean }): number {
  const total = hoursAtWork(r, opts);
  if (!total || !rate) return 0;
  if (new Date(`${day}T00:00:00Z`).getUTCDay() === 0) return round2(total * rate * opts.sundayMultiplier);
  const h = r?.timeIn && r.timeOut ? attHours(r.timeIn, r.timeOut, opts) : null;
  const ot = h?.ot ?? 0;
  return round2((total - ot) * rate + ot * rate * (opts.noOvertime ? 1 : opts.otMultiplier));
}
const round2 = (n: number) => Math.round(n * 100) / 100;
