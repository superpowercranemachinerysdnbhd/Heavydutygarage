import "server-only";
import { and, asc, eq, isNotNull, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { addDays, today } from "./format";
import { listItems } from "./lists";
import { SOON_DAYS, nextDueFrom, serviceState } from "./service-rules";

const S = schema.machineServices;

/** A machine's service schedule, in the Settings order of service items. */
export async function servicesFor(unitId: number) {
  const rows = await db.select().from(S).where(eq(S.unitId, unitId));
  const order = new Map(listItems("service_item", { all: true }).map((i, n) => [i.code, n]));
  const d = today();
  return rows.map((r) => ({ ...r, state: serviceState(r.nextDue, d) }))
    .sort((a, b) => (order.get(a.item) ?? 999) - (order.get(b.item) ?? 999) || a.item.localeCompare(b.item));
}
export type ServiceRow = Awaited<ReturnType<typeof servicesFor>>[number];

/** Services overdue or due within `days` (default SOON_DAYS), across all machines (dashboard). */
export async function dueServices(limit = 12, days = SOON_DAYS) {
  const rows = await db.select({ s: S, plateNo: schema.machineUnits.plateNo, serialNo: schema.machineUnits.serialNo, make: schema.machineModels.make, model: schema.machineModels.model })
    .from(S).innerJoin(schema.machineUnits, eq(S.unitId, schema.machineUnits.id)).innerJoin(schema.machineModels, eq(schema.machineUnits.modelId, schema.machineModels.id))
    .where(and(isNotNull(S.nextDue), lte(S.nextDue, addDays(today(), days)))).orderBy(asc(S.nextDue)).limit(limit);
  return rows;
}

/** Earliest upcoming service per machine (machinery list). */
export async function nextServiceByUnit(): Promise<Map<number, { item: string; nextDue: string }>> {
  const rows = await db.execute<{ unit_id: number; item: string; next_due: string }>(sql`
    select distinct on (unit_id) unit_id, item, next_due::text as next_due from machine_services
    where next_due is not null order by unit_id, next_due`);
  return new Map(rows.rows.map((r) => [Number(r.unit_id), { item: r.item, nextDue: r.next_due }]));
}

/** Record a service as done on a date (creates the schedule row if the machine did not have it). */
export async function markServiceDone(unitId: number, item: string, date: string, userId: number, jobId: number | null) {
  const [row] = await db.select().from(S).where(and(eq(S.unitId, unitId), eq(S.item, item)));
  const months = row?.intervalMonths ?? listItems("service_item", { all: true }).find((i) => i.code === item)?.num ?? null;
  const values = { lastDone: date, nextDue: nextDueFrom(date, months), intervalMonths: months, lastJobId: jobId, updatedBy: userId, updatedAt: new Date() };
  await db.insert(S).values({ unitId, item, ...values }).onConflictDoUpdate({ target: [S.unitId, S.item], set: values });
}
