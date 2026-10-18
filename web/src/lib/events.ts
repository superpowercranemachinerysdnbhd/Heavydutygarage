import "server-only";
import { and, asc, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { today } from "./format";

const E = schema.calendarEvents, U = schema.machineUnits, M = schema.machineModels;

const cols = {
  id: E.id, day: E.day, endDay: E.endDay, time: E.time, type: E.type, title: E.title, unitId: E.unitId, customerId: E.customerId,
  notes: E.notes, repeatMonths: E.repeatMonths, doneAt: E.doneAt,
  plateNo: sql<string | null>`coalesce(${U.plateNo}, ${U.serialNo})`, make: M.make, model: M.model, customerName: schema.customers.name,
};
const base = () => db.select(cols).from(E).leftJoin(U, eq(E.unitId, U.id)).leftJoin(M, eq(U.modelId, M.id)).leftJoin(schema.customers, eq(E.customerId, schema.customers.id));

/** The title shown: the typed title, with the machine's plate when it is not already in it. */
export function eventTitle(e: { title: string; plateNo: string | null }): string {
  return e.plateNo && !e.title.toUpperCase().includes(e.plateNo.toUpperCase()) ? `${e.title} · ${e.plateNo}` : e.title;
}

export type EventRow = NonNullable<Awaited<ReturnType<typeof eventById>>>;
export async function eventById(id: number) {
  const [e] = await base().where(eq(E.id, id));
  return e ?? null;
}

/** Events touching the range [from, to] (multi-day events included). */
export async function eventsOverlapping(from: string, to: string) {
  return base().where(and(lte(E.day, to), or(gte(E.day, from), gte(E.endDay, from)))).orderBy(asc(E.day), asc(E.time));
}

/** Dashboard: events not done that are late, or start within the next `days` days. */
export async function upcomingEvents(days = 7) {
  const d = today();
  const until = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8) + days)).toISOString().slice(0, 10);
  return base().where(and(isNull(E.doneAt), lte(E.day, until))).orderBy(asc(E.day), asc(E.time)).limit(30);
}

/** A machine's events: those not done, then the last few done. */
export async function eventsForUnit(unitId: number) {
  const [open, done] = await Promise.all([
    base().where(and(eq(E.unitId, unitId), isNull(E.doneAt))).orderBy(asc(E.day)),
    base().where(and(eq(E.unitId, unitId), sql`${E.doneAt} is not null`)).orderBy(desc(E.day)).limit(3),
  ]);
  return [...open, ...done];
}

export const isLate = (e: { day: string; endDay: string | null; doneAt: Date | null }, d = today()) => !e.doneAt && (e.endDay ?? e.day) < d;
