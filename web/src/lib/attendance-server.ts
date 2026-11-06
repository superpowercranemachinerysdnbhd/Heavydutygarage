import "server-only";
import { and, asc, between, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AttStatus } from "./attendance";
import { rateOn } from "./pay";

/** Everyone on the attendance sheet: active staff except the Head Manager. */
export async function sheetStaff() {
  return db.select({ id: schema.staff.id, name: schema.staff.name, role: schema.staff.role, supportRole: schema.staff.supportRole }).from(schema.staff)
    .where(and(eq(schema.staff.active, true), ne(schema.staff.role, "boss"))).orderBy(asc(schema.staff.name));
}

export type AttRow = { staffId: number; day: string; status: AttStatus; timeIn: string | null; timeOut: string | null; note: string | null };
export async function attendanceBetween(from: string, to: string, staffId?: number): Promise<AttRow[]> {
  const A = schema.attendance;
  return db.select({ staffId: A.staffId, day: A.day, status: A.status, timeIn: A.timeIn, timeOut: A.timeOut, note: A.note }).from(A)
    .where(and(between(A.day, from, to), staffId ? eq(A.staffId, staffId) : undefined));
}

/** Time logged on work orders between two days, one row per entry, with the work order. */
export async function labourBetween(from: string, to: string, staffId?: number) {
  const L = schema.labourEntries, J = schema.jobs;
  return db.select({ staffId: L.staffId, day: L.workDate, hours: L.hours, rateMult: L.rateMult, timeFrom: L.timeFrom, timeTo: L.timeTo, jobId: L.jobId, jobNo: J.jobNo, title: J.title, complaint: J.complaint })
    .from(L).innerJoin(J, eq(L.jobId, J.id)).where(and(between(L.workDate, from, to), staffId ? eq(L.staffId, staffId) : undefined)).orderBy(asc(L.workDate), asc(L.timeFrom));
}

/** Hourly rate per person on any day (pay history, else the current rate), for costing time at work. */
export async function payRatesLookup() {
  const [staff, hist] = await Promise.all([
    db.select({ id: schema.staff.id, rate: schema.staff.payRate, noOvertime: schema.staff.noOvertime }).from(schema.staff),
    db.select({ staffId: schema.staffPayRates.staffId, effectiveFrom: schema.staffPayRates.effectiveFrom, hourlyRate: schema.staffPayRates.hourlyRate }).from(schema.staffPayRates),
  ]);
  return {
    rate: (staffId: number, day: string) => rateOn(hist.filter((h) => h.staffId === staffId).map((h) => ({ effectiveFrom: h.effectiveFrom, hourlyRate: Number(h.hourlyRate) })), day, Number(staff.find((s) => s.id === staffId)?.rate ?? 0)),
    noOvertime: (staffId: number) => !!staff.find((s) => s.id === staffId)?.noOvertime,
  };
}
