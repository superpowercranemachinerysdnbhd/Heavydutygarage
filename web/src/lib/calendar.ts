/** Calendar date helpers (ISO yyyy-mm-dd strings, Monday-first weeks). Pure module. */
import { addDays } from "./format";

export type PlanKind = "job" | "leave" | "mc" | "off";
export const ABSENCE: PlanKind[] = ["leave", "mc", "off"];
/** Working days shown on the crew plan: Monday to Saturday. */
export const WORK_DAYS = 6;

/** 0 = Monday … 6 = Sunday. */
export function weekday(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}
export const weekStart = (iso: string) => addDays(iso, -weekday(iso));
/** The week to plan: this week, or the coming week on Sunday (the workshop is closed). */
export const planWeekStart = (iso: string) => (weekday(iso) === 6 ? addDays(iso, 1) : weekStart(iso));
export const weekDays = (start: string, n = WORK_DAYS) => Array.from({ length: n }, (_, i) => addDays(start, i));

export const isMonth = (s: unknown): s is string => typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
export const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/** Month as "yyyy-mm" moved by n months. */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** Days shown for a month: whole weeks, Monday before the 1st to Sunday after the last day. */
export function monthGrid(month: string): string[] {
  const first = `${month}-01`;
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  const start = weekStart(first), end = addDays(weekStart(last), 6);
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}
