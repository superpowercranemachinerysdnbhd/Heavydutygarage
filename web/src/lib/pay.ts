/** Pay rules for labour cost: monthly salary → hourly rate, and overtime / Sunday multipliers. Pure module, unit-tested. */

export const RATE_TYPES = ["normal", "ot", "sunday"] as const;
export type RateType = (typeof RATE_TYPES)[number];
export const isRateType = (v: string): v is RateType => (RATE_TYPES as readonly string[]).includes(v);

/** Hourly rate from a monthly salary and the normal hours in a month (e.g. RM 1,900 / 195 h = RM 9.74). */
export function hourlyFromSalary(salary: number, hoursPerMonth: number): number {
  if (!(salary > 0) || !(hoursPerMonth > 0)) return 0;
  return Math.round((salary / hoursPerMonth) * 100) / 100;
}

/** Multiplier for a type of hour: normal 1, overtime (after 5 pm) and Sunday / public holiday from Settings. */
export function rateMultiplier(type: RateType, s: { otMultiplier: number; sundayMultiplier: number }): number {
  return type === "ot" ? s.otMultiplier : type === "sunday" ? s.sundayMultiplier : 1;
}

/** Work on a Sunday is always paid at the Sunday rate; otherwise what was chosen. */
export function rateTypeFor(chosen: string, workDate: string): RateType {
  if (new Date(`${workDate}T00:00:00Z`).getUTCDay() === 0) return "sunday";
  return isRateType(chosen) ? chosen : "normal";
}
