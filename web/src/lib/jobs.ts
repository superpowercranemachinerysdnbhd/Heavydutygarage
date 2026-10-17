/** Job categories, statuses and the rules for moving a job between statuses. Pure functions only.
 *  Display text lives in src/i18n; this file holds codes, colours and rules. */
import { can, type Role } from "./permissions";
import type { MessageKey, Vars } from "@/i18n";

/** Job category code: built-in (EMG, DIAG, PM, …) or added in Settings. Names and colours: lib/lists. */
export type Category = string;
/** Job stages: Received → In Progress → Pending Parts → Completed ("closed"). The database enum still holds retired values. */
export type Status = "received" | "in_progress" | "awaiting_parts" | "closed";
export type Priority = "critical" | "high" | "normal" | "low";

export const STATUSES: Status[] = ["received", "in_progress", "awaiting_parts", "closed"];
export const PRIORITIES: Priority[] = ["critical", "high", "normal", "low"];
/** CSS class per priority (styling only). */
export const PRIORITY_CLASS: Record<Priority, string> = { critical: "Critical", high: "High", normal: "Normal", low: "Low" };

/** Jobs still being worked on (a mechanic's jobs "on hand"): not yet Ready or Closed. */
export const ON_HAND: Status[] = ["received", "in_progress", "awaiting_parts"];

/** Statuses crew members (not boss/supervisor) may move their own job between. */
export const CREW_STATUSES: Status[] = ["in_progress", "awaiting_parts"];

export const qcMessageKey = (k: string) => `qc.${k}` as MessageKey;

export type TransitionCheck = { ok: true } | { ok: false; reason: MessageKey; vars?: Vars };

/** Decide whether `role` may move a job from `from` to `to`, given the job's tasks, QC and sign-off state. */
export function checkTransition(args: {
  role: Role; from: Status; to: Status; isOnJob: boolean; qcTotal: number; qcPassed: number; signedOff: boolean; tasksOpen?: number;
}): TransitionCheck {
  const { role, from, to, isOnJob, qcTotal, qcPassed, signedOff, tasksOpen = 0 } = args;
  if (from === to) return { ok: false, reason: "tr.same" };
  if (from === "closed") return { ok: false, reason: "tr.closed" };
  if (!can(role, "job.anyStatus")) {
    if (!isOnJob) return { ok: false, reason: "tr.notOnJob" };
    if (!CREW_STATUSES.includes(to)) return { ok: false, reason: "tr.supOnly", vars: { status: to } };
  }
  // Completing: every task done and every quality check (if the job has any) ticked. Customer sign-off can follow later.
  if (to === "closed" && tasksOpen > 0) return { ok: false, reason: "tr.tasksOpen", vars: { n: tasksOpen } };
  if (to === "closed" && qcPassed < qcTotal) return { ok: false, reason: "tr.qc" };
  void signedOff;
  return { ok: true };
}

/** Days a job has been in its current status, and how worrying that is. */
export function ageLevel(status: Status, days: number): "" | "warn" | "crit" {
  if (status === "closed") return "";
  const [lo, hi] = status === "in_progress" ? [7, 14] : status === "received" ? [1, 2] : [3, 7];
  return days >= hi ? "crit" : days >= lo ? "warn" : "";
}

/** Next job number for the year, e.g. J-2026-0042. */
export function nextJobNo(year: number, existing: string[]): string {
  const prefix = `J-${year}-`;
  const max = existing.filter((n) => n.startsWith(prefix)).reduce((m, n) => Math.max(m, Number(n.slice(prefix.length)) || 0), 0);
  return prefix + String(max + 1).padStart(4, "0");
}
