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
