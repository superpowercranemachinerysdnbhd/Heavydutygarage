import "server-only";
import { and, asc, eq, lte, desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { today } from "./format";

const R = schema.staffPayRates;
export const HISTORY_START = "2000-01-01";

export async function payHistory(staffId: number) {
  return db.select().from(R).where(eq(R.staffId, staffId)).orderBy(asc(R.effectiveFrom));
}

/** Before the first change is added, keep today's pay as "from the start", so past work keeps its cost. */
export async function ensurePayBaseline(staffId: number, by: number | null) {
  const [any] = await db.select({ id: R.id }).from(R).where(eq(R.staffId, staffId)).limit(1);
  if (any) return;
  const [s] = await db.select().from(schema.staff).where(eq(schema.staff.id, staffId));
  if (!s) return;
  await db.insert(R).values({ staffId, effectiveFrom: HISTORY_START, monthlySalary: s.monthlySalary, monthlyHours: s.monthlyHours, hourlyRate: s.payRate, createdBy: by }).onConflictDoNothing();
}

/** staff.pay_rate / monthly_salary show the pay in force today (the team page, new entries' fallback). */
export async function syncCurrentPay(staffId: number) {
  const [cur] = await db.select().from(R).where(and(eq(R.staffId, staffId), lte(R.effectiveFrom, today()))).orderBy(desc(R.effectiveFrom)).limit(1);
  if (!cur) return;
  await db.update(schema.staff).set({ payRate: Number(cur.hourlyRate).toFixed(2), monthlySalary: cur.monthlySalary, ...(cur.monthlyHours ? { monthlyHours: cur.monthlyHours } : {}) }).where(eq(schema.staff.id, staffId));
}
