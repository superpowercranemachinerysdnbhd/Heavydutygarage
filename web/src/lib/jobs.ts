/** Job categories, statuses and the rules for moving a job between statuses. Pure functions only.
 *  Display text lives in src/i18n; this file holds codes, colours and rules. */
import { can, type Role } from "./permissions";
import type { MessageKey, Vars } from "@/i18n";

export type Category = "EMG" | "DIAG" | "PM" | "MINOR" | "MAJOR" | "HYD" | "FAB" | "PAINT" | "WARR";
export type Status = "received" | "diagnosing" | "awaiting_approval" | "awaiting_parts" | "in_progress" | "quality_check" | "ready_for_pickup" | "closed";
export type Priority = "critical" | "high" | "normal" | "low";

export const CATEGORIES: Record<Category, { color: string; defaultPriority: Priority }> = {
  EMG: { color: "var(--c-emg)", defaultPriority: "critical" },
  DIAG: { color: "var(--c-diag)", defaultPriority: "high" },
  PM: { color: "var(--c-pm)", defaultPriority: "normal" },
  MINOR: { color: "var(--c-minor)", defaultPriority: "normal" },
  MAJOR: { color: "var(--c-major)", defaultPriority: "normal" },
  HYD: { color: "var(--c-hyd)", defaultPriority: "high" },
  FAB: { color: "var(--c-fab)", defaultPriority: "normal" },
  PAINT: { color: "var(--c-paint)", defaultPriority: "low" },
  WARR: { color: "var(--c-warr)", defaultPriority: "high" },
};
export const CATEGORY_KEYS = Object.keys(CATEGORIES) as Category[];

export const STATUSES: Status[] = ["received", "diagnosing", "awaiting_approval", "awaiting_parts", "in_progress", "quality_check", "ready_for_pickup", "closed"];
export const PRIORITIES: Priority[] = ["critical", "high", "normal", "low"];
/** CSS class per priority (styling only). */
export const PRIORITY_CLASS: Record<Priority, string> = { critical: "Critical", high: "High", normal: "Normal", low: "Low" };

/** Statuses crew members (not boss/supervisor) may move their own job between. */
export const CREW_STATUSES: Status[] = ["diagnosing", "in_progress", "quality_check"];

export const BAYS = ["Bay 1", "Bay 2", "Bay 3", "Bay 4", "Bay 5", "Fabrication bay", "Paint bay", "Long-stay yard A", "Long-stay yard B"];

const QC_BASE = ["testRun", "leakCheck", "allTasks", "afterPhotos", "cleanUp"] as const;
export type QcKey = Category | (typeof QC_BASE)[number];
/** QC checklist item keys for a category: one category check plus the standard checks. */
export function qcTemplate(cat: Category): QcKey[] {
  return [cat, ...QC_BASE];
}
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
  const releasing = to === "ready_for_pickup" || to === "closed";
  if (releasing && tasksOpen > 0) return { ok: false, reason: "tr.tasksOpen", vars: { n: tasksOpen } };
  if (releasing && (qcTotal === 0 || qcPassed < qcTotal)) return { ok: false, reason: "tr.qc" };
  if (to === "closed" && !signedOff) return { ok: false, reason: "tr.signoff" };
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
