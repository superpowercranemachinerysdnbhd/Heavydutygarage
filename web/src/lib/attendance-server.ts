import "server-only";
import { and, asc, between, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AttStatus } from "./attendance";

/** Everyone on the attendance sheet: active staff except the Head Manager. */
export async function sheetStaff() {
  return db.select({ id: schema.staff.id, name: schema.staff.name, role: schema.staff.role }).from(schema.staff)
    .where(and(eq(schema.staff.active, true), ne(schema.staff.role, "boss"))).orderBy(asc(schema.staff.name));
}

export type AttRow = { staffId: number; day: string; status: AttStatus; timeIn: string | null; timeOut: string | null; note: string | null };
export async function attendanceBetween(from: string, to: string, staffId?: number): Promise<AttRow[]> {
  const A = schema.attendance;
  return db.select({ staffId: A.staffId, day: A.day, status: A.status, timeIn: A.timeIn, timeOut: A.timeOut, note: A.note }).from(A)
    .where(and(between(A.day, from, to), staffId ? eq(A.staffId, staffId) : undefined));
}
