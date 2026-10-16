import Link from "next/link";
import { CATEGORIES, PRIORITY_LABEL, STATUS_LABEL, ageLevel, type Category, type Priority, type Status } from "@/lib/jobs";
import { dateOf, daysBetween, fmtDate, initials, today } from "@/lib/format";
import type { JobRow } from "@/lib/queries";

export function CatChip({ cat }: { cat: Category }) {
  return <span className="chip" style={{ ["--cat" as string]: CATEGORIES[cat].color }}><span className="dot" />{CATEGORIES[cat].name}</span>;
}
export function Pri({ p }: { p: Priority }) {
  return <span className={`pri ${PRIORITY_LABEL[p]}`}>{PRIORITY_LABEL[p]}</span>;
}
export function Avatar({ name, size }: { name: string; size?: "lg" }) {
  return <span className={`avatar ${size ?? ""}`} title={name}>{initials(name)}</span>;
}
export function Notice({ error, ok }: { error?: string; ok?: string }) {
  if (error) return <div className="notice err" role="alert">{error}</div>;
  if (ok) return <div className="notice ok" role="status">{ok}</div>;
  return null;
}

export function daysInStatus(since: Date): number {
  return Math.max(0, daysBetween(dateOf(since), today()));
}
export function dueInfo(j: { status: Status; dueDate: string; closedAt: string | null }): { cls: string; text: string } {
  if (j.status === "closed") return { cls: "", text: "Closed " + fmtDate(j.closedAt ?? j.dueDate) };
  if (j.status === "ready_for_pickup") return { cls: "", text: "Ready" };
  const n = daysBetween(today(), j.dueDate);
  if (n < 0) return { cls: "over", text: `${-n}d overdue` };
  if (n === 0) return { cls: "soon", text: "Due today" };
  if (n === 1) return { cls: "soon", text: "Due tomorrow" };
  return { cls: "", text: "Due " + fmtDate(j.dueDate) };
}
export function AgeText({ status, since }: { status: Status; since: Date }) {
  const d = daysInStatus(since);
  return <span className={`age ${ageLevel(status, d)}`}>{d === 0 ? `${STATUS_LABEL[status]} since today` : `${d} d in ${STATUS_LABEL[status]}`}</span>;
}

export function JobCard({ j, names }: { j: JobRow; names: Map<number, string> }) {
  const due = dueInfo(j);
  const people = [j.leadId, ...j.teamIds.filter((t) => t !== j.leadId)].filter((x): x is number => !!x);
  return (
    <Link href={`/jobs/${j.id}`} className="card" style={{ ["--cat" as string]: CATEGORIES[j.category].color }}>
      <div className="card-top"><span className="mono">{j.jobNo}</span><Pri p={j.priority} /></div>
      <div className="mach">{j.make} {j.model}</div>
      <div className="cust">{j.customerName} · {j.siteType === "field" ? "Field: " : ""}{j.siteLocation}</div>
      <CatChip cat={j.category} />
      <AgeText status={j.status} since={j.statusSince} />
      <div className="card-foot">
        <span className={`due ${due.cls}`}>{due.text}</span>
        <span className="avatars">{j.leadId ? people.map((p) => <Avatar key={p} name={names.get(p) ?? "?"} />) : <span className="due over">Unassigned</span>}</span>
      </div>
    </Link>
  );
}
