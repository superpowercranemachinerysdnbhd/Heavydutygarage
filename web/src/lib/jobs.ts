/** Job categories, statuses and the rules for moving a job between statuses. Pure functions only. */
import { can, type Role } from "./permissions";

export type Category = "EMG" | "DIAG" | "PM" | "MINOR" | "MAJOR" | "HYD" | "FAB" | "PAINT" | "WARR";
export type Status = "received" | "diagnosing" | "awaiting_approval" | "awaiting_parts" | "in_progress" | "quality_check" | "ready_for_pickup" | "closed";
export type Priority = "critical" | "high" | "normal" | "low";

export const CATEGORIES: Record<Category, { name: string; color: string; defaultPriority: Priority }> = {
  EMG: { name: "Emergency Breakdown", color: "var(--c-emg)", defaultPriority: "critical" },
  DIAG: { name: "Troubleshooting & Diagnostics", color: "var(--c-diag)", defaultPriority: "high" },
  PM: { name: "Preventive Maintenance", color: "var(--c-pm)", defaultPriority: "normal" },
  MINOR: { name: "Minor Repair", color: "var(--c-minor)", defaultPriority: "normal" },
  MAJOR: { name: "Major Repair / Overhaul", color: "var(--c-major)", defaultPriority: "normal" },
  HYD: { name: "Hydraulic Service", color: "var(--c-hyd)", defaultPriority: "high" },
  FAB: { name: "Fabrication & Welding", color: "var(--c-fab)", defaultPriority: "normal" },
  PAINT: { name: "Painting & Refurbishment", color: "var(--c-paint)", defaultPriority: "low" },
  WARR: { name: "Warranty / Comeback", color: "var(--c-warr)", defaultPriority: "high" },
};
export const CATEGORY_KEYS = Object.keys(CATEGORIES) as Category[];

export const STATUSES: Status[] = ["received", "diagnosing", "awaiting_approval", "awaiting_parts", "in_progress", "quality_check", "ready_for_pickup", "closed"];
export const STATUS_LABEL: Record<Status, string> = {
  received: "Received",
  diagnosing: "Diagnosing",
  awaiting_approval: "Awaiting Approval",
  awaiting_parts: "Awaiting Parts",
  in_progress: "In Progress",
  quality_check: "Quality Check",
  ready_for_pickup: "Ready for Pickup",
  closed: "Closed",
};
export const PRIORITIES: Priority[] = ["critical", "high", "normal", "low"];
export const PRIORITY_LABEL: Record<Priority, string> = { critical: "Critical", high: "High", normal: "Normal", low: "Low" };

/** Statuses crew members (not boss/supervisor) may move their own job between. */
export const CREW_STATUSES: Status[] = ["diagnosing", "in_progress", "quality_check"];

export const BAYS = ["Bay 1", "Bay 2", "Bay 3", "Bay 4", "Bay 5", "Fabrication bay", "Paint bay", "Long-stay yard A", "Long-stay yard B"];

const QC_BASE = ["Test run under load", "Leak check after 30 min running", "All tasks complete", "After photos taken", "Tools and rags removed, machine cleaned"];
const QC_EXTRA: Record<Category, string> = {
  EMG: "Pressure / temperature readings recorded",
  HYD: "Pressure readings recorded against spec",
  DIAG: "Fault codes cleared and fault not returning",
  PM: "Service sticker fitted, next service hours noted",
  FAB: "Welds inspected, no cracks or undercut",
  PAINT: "Finish inspected, decals and load charts fitted",
  MAJOR: "Run-in completed, oil pressure recorded",
  MINOR: "Function test of repaired item",
  WARR: "Original fault confirmed fixed",
};
export function qcTemplate(cat: Category): string[] {
  return [QC_EXTRA[cat], ...QC_BASE];
}

export type TransitionCheck = { ok: true } | { ok: false; reason: string };

/** Decide whether `role` may move a job from `from` to `to`, given the job's QC and sign-off state. */
export function checkTransition(args: {
  role: Role; from: Status; to: Status; isOnJob: boolean; qcTotal: number; qcPassed: number; signedOff: boolean; tasksOpen?: number;
}): TransitionCheck {
  const { role, from, to, isOnJob, qcTotal, qcPassed, signedOff, tasksOpen = 0 } = args;
  if (from === to) return { ok: false, reason: "The job is already in that status." };
  if (from === "closed") return { ok: false, reason: "Closed jobs cannot be reopened. Create a comeback job instead." };
  if (!can(role, "job.anyStatus")) {
    if (!isOnJob) return { ok: false, reason: "You can only update jobs you are working on." };
    if (!CREW_STATUSES.includes(to)) return { ok: false, reason: `Only the supervisor can move a job to ${STATUS_LABEL[to]}.` };
  }
  if ((to === "ready_for_pickup" || to === "closed") && tasksOpen > 0) {
    return { ok: false, reason: `${tasksOpen} task${tasksOpen > 1 ? "s are" : " is"} not done yet. Finish or remove ${tasksOpen > 1 ? "them" : "it"} before releasing the machine.` };
  }
  if ((to === "ready_for_pickup" || to === "closed") && (qcTotal === 0 || qcPassed < qcTotal)) {
    return { ok: false, reason: "Finish the quality check before releasing the machine." };
  }
  if (to === "closed" && !signedOff) return { ok: false, reason: "Record the customer handover and signature before closing." };
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
