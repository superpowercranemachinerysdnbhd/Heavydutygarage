import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/** SQL for the hourly rate in force on the day a labour entry was worked (aliases: l = labour_entries, s = staff).
 *  Same rule as rateOn in lib/pay.ts: latest change on or before the day, else the first, else staff.pay_rate. */
export const RATE_AT = sql.raw(`coalesce(
  (select r.hourly_rate from staff_pay_rates r where r.staff_id = l.staff_id and r.effective_from <= l.work_date order by r.effective_from desc limit 1),
  (select r.hourly_rate from staff_pay_rates r where r.staff_id = l.staff_id order by r.effective_from limit 1),
  s.pay_rate)`);

/** What maintenance costs, per work order: parts from stock (at their cost), things bought for the work order, outside work
 *  (vendor invoices) and labour at each person's pay rate. Dated by the day the work order was opened. Cancelled history is included. */
export type CostRow = { jobId: number; unitId: number; category: string; opened: string; outsourced: boolean; stock: number; bought: number; outside: number; hours: number; labour: number };

export async function costRows(opts: { unitId?: number; from?: string; to?: string } = {}): Promise<CostRow[]> {
  const where = [
    opts.unitId ? sql`j.unit_id = ${opts.unitId}` : sql`true`,
    opts.from ? sql`j.opened_at >= ${opts.from}` : sql`true`,
    opts.to ? sql`j.opened_at <= ${opts.to}` : sql`true`,
  ];
  const r = await db.execute<{ job_id: number; unit_id: number; category: string; opened: string; outsourced: boolean; stock: string; bought: string; outside: string; hours: string; labour: string }>(sql`
    select j.id as job_id, j.unit_id, j.category, j.opened_at::text as opened, j.outsourced,
      coalesce((select sum(p.qty * p.unit_cost) from job_parts p where p.job_id = j.id), 0) as stock,
      coalesce((select sum(b.qty * b.unit_cost) from job_purchases b where b.job_id = j.id and b.kind <> 'service'), 0) as bought,
      coalesce((select sum(b.qty * b.unit_cost) from job_purchases b where b.job_id = j.id and b.kind = 'service'), 0) as outside,
      coalesce((select sum(l.hours) from labour_entries l where l.job_id = j.id), 0) as hours,
      coalesce((select sum(l.hours * ${RATE_AT} * l.rate_mult) from labour_entries l join staff s on s.id = l.staff_id where l.job_id = j.id), 0) as labour
    from jobs j where ${sql.join(where, sql` and `)}`);
  return r.rows.map((x) => ({ jobId: Number(x.job_id), unitId: Number(x.unit_id), category: x.category, opened: x.opened, outsourced: !!x.outsourced,
    stock: Number(x.stock), bought: Number(x.bought), outside: Number(x.outside), hours: Number(x.hours), labour: Number(x.labour) }));
}

export type CostSum = { n: number; parts: number; outside: number; labour: number; hours: number };
export const EMPTY_SUM: CostSum = { n: 0, parts: 0, outside: 0, labour: 0, hours: 0 };
export const costTotal = (c: CostSum) => c.parts + c.outside + c.labour;
export function sum(rows: CostRow[]): CostSum {
  return rows.reduce((a, r) => ({ n: a.n + 1, parts: a.parts + r.stock + r.bought, outside: a.outside + r.outside, labour: a.labour + r.labour, hours: a.hours + r.hours }), EMPTY_SUM);
}

/** Outside work (vendor invoice lines) per vendor, for work orders opened in the period. */
export async function outsideByVendor(from: string, to: string): Promise<{ vendor: string; supplierId: number | null; n: number; jobs: number; amount: number }[]> {
  const r = await db.execute<{ vendor: string; supplier_id: number | null; n: string; jobs: string; amount: string }>(sql`
    select coalesce(s.name, b.supplier_name, '—') as vendor, s.id as supplier_id, count(*) as n, count(distinct b.job_id) as jobs, sum(b.qty * b.unit_cost) as amount
    from job_purchases b join jobs j on j.id = b.job_id left join suppliers s on s.id = b.supplier_id
    where b.kind = 'service' and j.opened_at between ${from} and ${to}
    group by 1, 2 order by 5 desc`);
  return r.rows.map((x) => ({ vendor: x.vendor, supplierId: x.supplier_id, n: Number(x.n), jobs: Number(x.jobs), amount: Number(x.amount) }));
}
export function groupBy<K>(rows: CostRow[], key: (r: CostRow) => K): Map<K, CostSum> {
  const m = new Map<K, CostRow[]>();
  for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
  return new Map([...m].map(([k, v]) => [k, sum(v)]));
}
