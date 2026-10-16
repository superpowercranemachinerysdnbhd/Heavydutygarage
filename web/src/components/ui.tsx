import Link from "next/link";
import { CATEGORIES, PRIORITY_CLASS, ageLevel, type Category, type Priority, type Status } from "@/lib/jobs";
import { dateOf, daysBetween, fmtDate, initials, today } from "@/lib/format";
import type { JobRow } from "@/lib/queries";
import { placeLabel, type Locale, type T } from "@/i18n";
import { catLabel, priLabel, statusLabel } from "@/i18n/labels";

export function CatChip({ cat, t }: { cat: Category; t: T }) {
  return <span className="chip" style={{ ["--cat" as string]: CATEGORIES[cat].color }}><span className="dot" />{catLabel(t, cat)}</span>;
}
export function Pri({ p, t }: { p: Priority; t: T }) {
  return <span className={`pri ${PRIORITY_CLASS[p]}`}>{priLabel(t, p)}</span>;
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
export function dueInfo(j: { status: Status; dueDate: string; closedAt: string | null }, t: T, locale: Locale): { cls: string; text: string } {
  if (j.status === "closed") return { cls: "", text: t("due.closed", { date: fmtDate(j.closedAt ?? j.dueDate, false, locale) }) };
  if (j.status === "ready_for_pickup") return { cls: "", text: t("due.ready") };
  const n = daysBetween(today(), j.dueDate);
  if (n < 0) return { cls: "over", text: t("due.overdue", { n: -n }) };
  if (n === 0) return { cls: "soon", text: t("due.today") };
  if (n === 1) return { cls: "soon", text: t("due.tomorrow") };
  return { cls: "", text: t("due.on", { date: fmtDate(j.dueDate, false, locale) }) };
}
export function AgeText({ status, since, t }: { status: Status; since: Date; t: T }) {
  const d = daysInStatus(since), s = statusLabel(t, status);
  return <span className={`age ${ageLevel(status, d)}`}>{d === 0 ? t("age.today", { status: s }) : t("age.days", { n: d, status: s })}</span>;
}

export function JobCard({ j, names, t, locale }: { j: JobRow; names: Map<number, string>; t: T; locale: Locale }) {
  const due = dueInfo(j, t, locale);
  const people = [j.leadId, ...j.teamIds.filter((x) => x !== j.leadId)].filter((x): x is number => !!x);
  return (
    <Link href={`/jobs/${j.id}`} className="card" style={{ ["--cat" as string]: CATEGORIES[j.category].color }}>
      <div className="card-top"><span className="mono">{j.jobNo}</span><Pri p={j.priority} t={t} /></div>
      <div className="mach">{j.make} {j.model}</div>
      <div className="cust">{j.customerName} · {j.siteType === "field" ? t("card.field") : ""}{placeLabel(t, j.siteLocation)}</div>
      <CatChip cat={j.category} t={t} />
      <AgeText status={j.status} since={j.statusSince} t={t} />
      <div className="card-foot">
        <span className={`due ${due.cls}`}>{due.text}</span>
        <span className="avatars">{j.leadId ? people.map((p) => <Avatar key={p} name={names.get(p) ?? "?"} />) : <span className="due over">{t("dash.unassigned")}</span>}</span>
      </div>
    </Link>
  );
}
