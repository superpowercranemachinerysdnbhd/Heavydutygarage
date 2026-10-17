/** Date rules for machine service schedules. Pure functions only. */

/** Days before the due date when a service shows as "due soon". */
export const SOON_DAYS = 14;

/** Add whole months to an ISO date, keeping month ends sensible (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/** Next due date: an explicit date wins; otherwise last done + interval; otherwise unknown. */
export function nextDueFrom(lastDone: string | null, months: number | null, explicit?: string | null): string | null {
  if (explicit) return explicit;
  return lastDone && months ? addMonths(lastDone, months) : null;
}

export type ServiceState = "overdue" | "soon" | "ok" | "none";
export function serviceState(nextDue: string | null, today: string): ServiceState {
  if (!nextDue) return "none";
  if (nextDue < today) return "overdue";
  const soon = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10) + SOON_DAYS)).toISOString().slice(0, 10);
  return nextDue <= soon ? "soon" : "ok";
}
