/** Pay rules for labour cost: monthly salary → hourly rate, and overtime / Sunday multipliers. Pure module, unit-tested. */

export const RATE_TYPES = ["normal", "ot", "sunday"] as const;
export type RateType = (typeof RATE_TYPES)[number];
export const isRateType = (v: string): v is RateType => (RATE_TYPES as readonly string[]).includes(v);

/** Hourly rate from a monthly salary and the normal hours in a month (e.g. RM 1,900 / 195 h = RM 9.74). */
export function hourlyFromSalary(salary: number, hoursPerMonth: number): number {
  if (!(salary > 0) || !(hoursPerMonth > 0)) return 0;
  return Math.round((salary / hoursPerMonth) * 100) / 100;
}

/** Multiplier for a type of hour: normal 1, overtime (after 5 pm) and Sunday / public holiday from Settings.
 *  Someone not paid overtime (`noOvertime`) gets 1 for overtime hours. */
export function rateMultiplier(type: RateType, s: { otMultiplier: number; sundayMultiplier: number }, noOvertime = false): number {
  return type === "ot" ? (noOvertime ? 1 : s.otMultiplier) : type === "sunday" ? s.sundayMultiplier : 1;
}

/** Work on a Sunday is always paid at the Sunday rate; otherwise what was chosen. */
export function rateTypeFor(chosen: string, workDate: string): RateType {
  if (new Date(`${workDate}T00:00:00Z`).getUTCDay() === 0) return "sunday";
  return isRateType(chosen) ? chosen : "normal";
}

const minutes = (hhmm: string) => { const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; };

/** Hours between two clock times (same day), split at the time overtime starts: 15:00–19:00 with 17:00 → 2 normal + 2 overtime.
 *  null if the times are not valid or the end is not after the start. */
export function splitHours(from: string, to: string, otStart: string): { normal: number; ot: number } | null {
  const a = minutes(from), b = minutes(to), s = minutes(otStart);
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(s) || b <= a || b > 24 * 60) return null;
  const normal = Math.max(0, Math.min(b, s) - a), ot = Math.max(0, b - Math.max(a, s));
  return { normal: Math.round((normal / 60) * 100) / 100, ot: Math.round((ot / 60) * 100) / 100 };
}

/** Hourly rate in force on a day: the latest change on or before it; before the first change, the first rate. */
export function rateOn(history: { effectiveFrom: string; hourlyRate: number }[], day: string, fallback: number): number {
  const sorted = [...history].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const hit = sorted.filter((h) => h.effectiveFrom <= day).at(-1) ?? sorted[0];
  return hit ? hit.hourlyRate : fallback;
}
