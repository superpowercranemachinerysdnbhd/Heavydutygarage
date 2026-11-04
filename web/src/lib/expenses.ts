import "server-only";
import { and, asc, between } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { RATE_AT } from "./costs";
import { rateOn } from "./pay";
import { today } from "./format";

/** Kinds of other expenses the Head Manager records by hand. */
export const EXPENSE_CATEGORIES = ["rent", "utilities", "fuel", "tools", "vehicle", "office", "insurance", "other"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export const isExpenseCategory = (v: string): v is ExpenseCategory => (EXPENSE_CATEGORIES as readonly string[]).includes(v);

export type MonthExpenses = { month: string; stock: number; jobParts: number; outside: number; salaries: number; extraPay: number; other: number; total: number };

/** What the company spent each month of a year: parts received into stock (supplier invoices), parts bought for work orders,
 *  outsource work, salaries in force that month, overtime / Sunday hours and hourly-paid work, and the other expenses typed in. */
export async function monthlyExpenses(year: number): Promise<MonthExpenses[]> {
  const from = `${year}-01-01`, to = `${year}-12-31`;
  const month = (col: string) => sql.raw(`to_char(${col}, 'YYYY-MM')`);
  const [stock, bought, pay, other, staff, rates] = await Promise.all([
    db.execute<{ m: string; v: string }>(sql`select ${month("(r.received_at at time zone 'Asia/Kuala_Lumpur')")} as m, sum(rl.qty * rl.invoice_price) as v
      from receipt_lines rl join receipts r on r.id = rl.receipt_id where (r.received_at at time zone 'Asia/Kuala_Lumpur')::date between ${from} and ${to} group by 1`),
    db.execute<{ m: string; kind: string; v: string }>(sql`select ${month("b.purchased_at")} as m, b.kind, sum(b.qty * b.unit_cost) as v
      from job_purchases b where b.purchased_at between ${from} and ${to} group by 1, 2`),
    // Time paid on top of a salary (overtime / Sunday), and all time of people paid by the hour.
    db.execute<{ m: string; v: string }>(sql`select ${month("l.work_date")} as m,
      sum(case when s.monthly_salary is null or s.monthly_salary = 0 then l.hours * ${RATE_AT} * l.rate_mult
               when l.rate_type <> 'normal' then l.hours * ${RATE_AT} * l.rate_mult else 0 end) as v
      from labour_entries l join staff s on s.id = l.staff_id where l.work_date between ${from} and ${to} group by 1`),
    db.select().from(schema.companyExpenses).where(between(schema.companyExpenses.day, from, to)),
    db.select({ id: schema.staff.id, joined: schema.staff.joined, active: schema.staff.active, salary: schema.staff.monthlySalary }).from(schema.staff),
    db.select().from(schema.staffPayRates).orderBy(asc(schema.staffPayRates.effectiveFrom)),
  ]);
  const pick = (rows: { m: string; v: string }[], m: string) => Number(rows.find((r) => r.m === m)?.v ?? 0);
  return Array.from({ length: 12 }, (_, i) => {
    const m = `${year}-${String(i + 1).padStart(2, "0")}`, end = `${m}-28`, future = m > today().slice(0, 7);
    // Salaries: everyone active who had joined by the month, at the monthly salary in force that month.
    const salaries = future ? 0 : staff.filter((p) => p.active && (!p.joined || p.joined <= end)).reduce((sum, p) => {
      const hist = rates.filter((r) => r.staffId === p.id && r.monthlySalary !== null).map((r) => ({ effectiveFrom: r.effectiveFrom, hourlyRate: Number(r.monthlySalary) }));
      return sum + (hist.length ? rateOn(hist, end, 0) : Number(p.salary ?? 0));
    }, 0);
    const row = {
      month: m, stock: pick(stock.rows, m), jobParts: Number(bought.rows.find((r) => r.m === m && r.kind !== "service")?.v ?? 0),
      outside: Number(bought.rows.find((r) => r.m === m && r.kind === "service")?.v ?? 0), salaries, extraPay: pick(pay.rows, m),
      other: other.filter((e) => e.day.startsWith(m)).reduce((a, e) => a + Number(e.amount), 0),
    };
    return { ...row, total: row.stock + row.jobParts + row.outside + row.salaries + row.extraPay + row.other };
  });
}

/** Other expenses typed in for a year, newest first. */
export async function otherExpenses(year: number) {
  const E = schema.companyExpenses;
  return db.select().from(E).where(and(between(E.day, `${year}-01-01`, `${year}-12-31`))).orderBy(sql`${E.day} desc, ${E.id} desc`);
}
