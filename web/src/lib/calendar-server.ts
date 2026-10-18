import "server-only";
import { and, asc, between, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CurrentUser } from "./auth";
import { can } from "./permissions";
import { listJobs } from "./queries";
import { today } from "./format";
import type { PlanKind } from "./calendar";

export type CalEvent = {
  day: string; type: "job" | "overdue" | "service" | "followup" | "po" | "absence";
  title: string; sub: string; href: string; color: string;
  /** job: category code; service: item code; absence: plan kind. */
  code: string;
};

const plateOf = (r: { plateNo: string | null; serialNo: string | null; make: string; model: string }) => r.plateNo || r.serialNo || `${r.make} ${r.model}`;

/** Everything dated between from and to that the user may see. Crew see their own jobs and leave. */
export async function eventsBetween(user: CurrentUser, from: string, to: string): Promise<CalEvent[]> {
  const all = can(user.role, "job.viewAll");
  const d = today();
  const out: CalEvent[] = [];
  const open = await listJobs(user, { open: true });
  for (const j of open) {
    if (j.dueDate && j.dueDate >= from && j.dueDate <= to)
      out.push({ day: j.dueDate, type: "job", code: j.category, title: plateOf(j), sub: `${j.make} ${j.model}`, href: `/jobs/${j.id}`, color: "" });
    // Overdue jobs stay on today until they are moved or completed.
    if (j.dueDate && j.dueDate < d && d >= from && d <= to)
      out.push({ day: d, type: "overdue", code: j.category, title: plateOf(j), sub: j.dueDate, href: `/jobs/${j.id}`, color: "var(--crit)" });
  }
  const U = schema.machineUnits, M = schema.machineModels, S = schema.machineServices, J = schema.jobs, P = schema.crewPlan;
  if (all) {
    const [svc, fu] = await Promise.all([
      db.select({ s: S, plateNo: U.plateNo, serialNo: U.serialNo, make: M.make, model: M.model }).from(S).innerJoin(U, eq(S.unitId, U.id)).innerJoin(M, eq(U.modelId, M.id))
        .where(and(isNotNull(S.nextDue), between(S.nextDue, from, to))),
      db.select({ id: J.id, jobNo: J.jobNo, note: J.followUp, date: J.followUpDate, plateNo: U.plateNo, serialNo: U.serialNo, make: M.make, model: M.model }).from(J)
        .innerJoin(U, eq(J.unitId, U.id)).innerJoin(M, eq(U.modelId, M.id)).where(and(isNotNull(J.followUp), between(J.followUpDate, from, to))),
    ]);
    for (const r of svc) out.push({ day: r.s.nextDue!, type: "service", code: r.s.item, title: plateOf(r), sub: "", href: `/machinery/${r.s.unitId}#services`, color: "var(--c-pm)" });
    for (const f of fu) out.push({ day: f.date!, type: "followup", code: "", title: plateOf(f), sub: (f.note ?? "").slice(0, 80), href: `/jobs/${f.id}#writeup`, color: "var(--info)" });
  }
  if (can(user.role, "po.create")) {
    const PO = schema.purchaseOrders;
    const pos = await db.select({ id: PO.id, poNo: PO.poNo, eta: PO.eta, supplier: schema.suppliers.name }).from(PO).innerJoin(schema.suppliers, eq(PO.supplierId, schema.suppliers.id))
      .where(and(inArray(PO.status, ["ordered", "partially_received"]), isNotNull(PO.eta), between(PO.eta, from, to)));
    for (const p of pos) out.push({ day: p.eta!, type: "po", code: "", title: p.poNo, sub: p.supplier, href: `/purchasing/${p.id}`, color: "var(--c-minor)" });
  }
  const away = await db.select({ day: P.day, kind: P.kind, staffId: P.staffId, name: schema.staff.name }).from(P).innerJoin(schema.staff, eq(P.staffId, schema.staff.id))
    .where(and(ne(P.kind, "job"), between(P.day, from, to), all ? undefined : eq(P.staffId, user.id)));
  for (const a of away) out.push({ day: a.day, type: "absence", code: a.kind, title: a.name, sub: "", href: all ? `/calendar?view=week&w=${a.day}` : "/calendar", color: "var(--muted)" });
  const order = { overdue: 0, job: 1, service: 2, po: 3, followup: 4, absence: 5 };
  return out.sort((a, b) => a.day.localeCompare(b.day) || order[a.type] - order[b.type] || a.title.localeCompare(b.title));
}

export async function holidaysBetween(from: string, to: string): Promise<Map<string, string>> {
  const rows = await db.select().from(schema.holidays).where(between(schema.holidays.day, from, to)).orderBy(asc(schema.holidays.day));
  return new Map(rows.map((h) => [h.day, h.name]));
}

export type PlanEntry = { staffId: number; day: string; kind: PlanKind; jobId: number | null; note: string | null };
export async function planBetween(from: string, to: string, staffId?: number): Promise<PlanEntry[]> {
  const P = schema.crewPlan;
  return db.select({ staffId: P.staffId, day: P.day, kind: P.kind, jobId: P.jobId, note: P.note }).from(P)
    .where(and(between(P.day, from, to), staffId ? eq(P.staffId, staffId) : undefined));
}
